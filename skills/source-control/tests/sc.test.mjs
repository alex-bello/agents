import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sc = process.env.SC_BIN
  ? path.resolve(process.cwd(), process.env.SC_BIN)
  : path.join(skillRoot, "scripts", "sc");

async function mockExecutable(directory, name, source) {
  const target = path.join(directory, name);
  await writeFile(target, `#!/bin/sh\n${source}\n`);
  await chmod(target, 0o755);
}

// Stubs answer `--version` with a supported version unless they handle it themselves.
const supportedVersionOutput = {
  tea: "printf 'Version: \\033[1m0.15.1\\033[0m\\tgolang: 1.26.5\\n'",
  gh: "printf 'gh version 2.57.0 (2024-10-14)\\n'",
};

async function fixture(t, scripts) {
  const directory = await mkdtemp(path.join(tmpdir(), "source-control-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(scripts)) {
    const answersVersion = source.includes("--version") || !(name in supportedVersionOutput);
    await mockExecutable(directory, name, answersVersion
      ? source
      : `if [ "$1" = "--version" ]; then ${supportedVersionOutput[name]}; exit 0; fi\n${source}`);
  }
  return directory;
}

function invoke(directory, args, environment = {}) {
  const command = process.env.SC_BIN ? sc : process.execPath;
  const commandArgs = process.env.SC_BIN ? args : [sc, ...args];
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    cwd: process.env.SC_BIN ? directory : process.cwd(),
    env: { ...process.env, ...environment, PATH: environment.PATH ?? `${directory}:${process.env.PATH}` },
  });
}

test("help and version work without provider tools or a Git remote", async (t) => {
  const directory = await fixture(t, {});
  const help = invoke(directory, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: sc/);
  assert.equal(help.stderr, "");
  const version = invoke(directory, ["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^sc \d+\.\d+\.\d+\n$/);
  assert.equal(version.stderr, "");
});

test("native diagnostics redact environment values, body contents, and credential URLs", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%s\\n" "failure https://user:password@github.com/owner/project?token=topsecret body=private-body $SC_TEST_SECRET" >&2; exit 1',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "private-body");
  const result = invoke(directory, ["issue", "create", "--title", "Test", "--body-file", bodyFile], {
    SC_TEST_SECRET: "environment-secret-value",
  });
  assert.equal(result.status, 7);
  assert.doesNotMatch(result.stderr, /password|topsecret|private-body|environment-secret-value/);
  assert.match(result.stderr, /\[redacted\]/);
  assert.equal(result.stdout, "");
});

test("fails with the missing-dependency exit code when a provider executable is unavailable", async (t) => {
  const directory = await fixture(t, { git: "exit 1" });
  const result = invoke(directory, ["--provider", "github", "auth", "status"], { PATH: directory });
  assert.equal(result.status, 5);
  assert.match(result.stderr, /required executable not found: gh/);
  assert.equal(result.stdout, "");
});

test("redacts credentials and secret URL parameters from normalized JSON", async (t) => {
  const directory = await fixture(t, {
    gh: `printf '%s\\n' '{"number":3,"title":"Example","url":"https://user:password@github.com/owner/project/issues/3?token=private-token"}'`,
  });
  const result = invoke(directory, ["--provider", "github", "issue", "view", "3"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /password|private-token/);
  const output = JSON.parse(result.stdout);
  assert.equal(output.item.url, "https://[redacted]@github.com/owner/project/issues/3?token=[redacted]");
});

test("preserves ordinary environment values in normalized repository output", async (t) => {
  const directory = await fixture(t, {
    gh: `printf '%s\\n' '{"nameWithOwner":"operator/agents","url":"https://github.com/operator/agents","visibility":"PUBLIC"}'`,
  });
  const result = invoke(directory, ["--provider", "github", "repo", "view"], { SC_TEST_NAME: "agents" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.repository, "operator/agents");
  assert.equal(output.item.name, "operator/agents");
  assert.equal(output.item.url, "https://github.com/operator/agents");
});

test("detects GitHub from origin without running gh beyond its version probe", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'if [ "$1" = "--version" ]; then printf "gh version 2.57.0 (2024-10-14)\\n"; exit 0; fi; exit 99',
  });
  const result = invoke(directory, ["provider"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github",
    operation: "provider",
    repository: "owner/project",
    tool: { tool: "gh", version: "2.57.0", minimum: "2.57.0", supported: true },
  });
});

test("normalizes a GitHub issue list", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `printf '%s\\n' '[{"number":7,"title":"Example","body":"Body","state":"OPEN","author":{"login":"octo"},"url":"https://github.com/owner/project/issues/7","labels":[{"name":"bug"}],"createdAt":"2026-01-01","updatedAt":"2026-01-02"}]'`,
  });
  const result = invoke(directory, ["issue", "list", "--state", "all"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.operation, "issue.list");
  assert.deepEqual(output.items[0], {
    number: 7,
    title: "Example",
    body: "Body",
    state: "open",
    author: "octo",
    url: "https://github.com/owner/project/issues/7",
    labels: ["bug"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
  });
});

test("normalizes GitHub pull-request branch metadata", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `printf '%s\\n' '[{"number":8,"title":"Feature","state":"OPEN","baseRefName":"main","headRefName":"codex/feature","isDraft":true,"mergeable":"MERGEABLE"}]'`,
  });
  const result = invoke(directory, ["pr", "list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).items[0], {
    number: 8, title: "Feature", body: null, state: "open", author: null, url: null,
    labels: [], createdAt: null, updatedAt: null, base: "main", head: "codex/feature",
    draft: true, mergeable: "MERGEABLE",
  });
});

test("lists Forgejo pull requests with optional Tea draft-field support", async (t) => {
  const cases = [
    {
      fixtureName: "forgejo-pr-list-with-draft.json",
      unavailableDraft: false,
      draft: true,
      expectedListCalls: 1,
    },
    {
      fixtureName: "forgejo-pr-list-without-draft.json",
      unavailableDraft: true,
      draft: null,
      expectedListCalls: 2,
    },
    {
      fixtureName: "forgejo-pr-list-with-draft.json",
      failure: "temporary provider failure",
      expectedListCalls: 1,
    },
  ];

  for (const testCase of cases) {
    const directory = await fixture(t, {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "pulls list" ]; then
  printf '%s\\n' "$*" >> "$SC_TEST_CALLS"
  case "$*" in
    *draft*)
      if [ -n "$SC_TEST_FAILURE" ]; then
        printf '%s\\n' "$SC_TEST_FAILURE" >&2
        exit 1
      fi
      if [ "$SC_TEST_UNAVAILABLE_DRAFT" = "true" ]; then
        printf '%s\\n' "Error: invalid field 'draft'" >&2
        exit 1
      fi
      ;;
  esac
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
    });
    const output = await readFile(path.join(skillRoot, "tests", "fixtures", testCase.fixtureName), "utf8");
    const callsFile = path.join(directory, "tea-calls.txt");
    const result = invoke(directory, ["pr", "list", "--state", "open"], {
      SC_TEST_CALLS: callsFile,
      SC_TEST_OUTPUT: output,
      SC_TEST_UNAVAILABLE_DRAFT: String(testCase.unavailableDraft),
      SC_TEST_FAILURE: testCase.failure ?? "",
    });
    if (testCase.failure) {
      assert.equal(result.status, 7);
      assert.match(result.stderr, /temporary provider failure/);
      assert.equal(result.stdout, "");
      const listCalls = (await readFile(callsFile, "utf8")).trim().split("\n");
      assert.equal(listCalls.length, testCase.expectedListCalls);
      assert.match(listCalls[0], /--fields .*draft,ci/);
      continue;
    }

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      provider: "forgejo",
      operation: "pr.list",
      repository: "owner/project",
      items: [{
        number: 145,
        title: "Existing PR",
        body: "PR body",
        state: "open",
        author: "alex",
        url: "https://forge.example/owner/project/pulls/145",
        labels: ["thin-slice"],
        createdAt: "2026-09-15T10:00:00Z",
        updatedAt: "2026-09-16T10:00:00Z",
        base: "main",
        head: "codex/issue-145",
        draft: testCase.draft,
        mergeable: "MERGEABLE",
      }],
    });

    const listCalls = (await readFile(callsFile, "utf8")).trim().split("\n");
    assert.equal(listCalls.length, testCase.expectedListCalls);
    assert.match(listCalls[0], /--state open/);
    assert.match(listCalls[0], /--fields index,title,body,state,author,url,labels,created,updated,base,head,mergeable,draft,ci/);
    if (testCase.unavailableDraft) {
      assert.match(listCalls[1], /--state open/);
      assert.match(listCalls[1], /--fields index,title,body,state,author,url,labels,created,updated,base,head,mergeable,ci/);
      assert.doesNotMatch(listCalls[1], /draft/);
    }
  }
});

test("creates and lists Forgejo labels in inferred and explicit repository scope", async (t) => {
  for (const target of [
    { name: "inferred", args: [], repo: "owner/project", colorArgs: [] },
    { name: "explicit", args: ["--repo", "other/target"], repo: "other/target", colorArgs: ["--color", "#7c3aed"] },
  ]) {
    const callsFile = path.join(tmpdir(), `source-control-label-calls-${process.pid}-${target.name}`);
    t.after(() => rm(callsFile, { force: true }));
    const directory = await fixture(t, {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels create" ]; then
  printf '%s\\n' "$*" >> "${callsFile}"
  touch "${callsFile}.created"
  printf '%s\\n' 'created'
elif [ "$1 $2" = "labels list" ]; then
  printf '%s\\n' "$*" >> "${callsFile}"
  case "$*" in
  *"--repo ${target.repo}"*)
    if [ -f "${callsFile}.created" ]; then
    printf '%s\\n' '[{"id":17,"name":"wayfinder","color":"7C3AED","description":"Lifecycle work"}]'
    else printf '%s\\n' '[]'; fi
    ;;
  *)
    printf '%s\\n' '[]'
    ;;
  esac
else exit 99; fi`,
    });
    t.after(() => rm(`${callsFile}.created`, { force: true }));

    const created = invoke(directory, ["--provider", "forgejo", ...target.args, "label", "create", "--name", "wayfinder", ...target.colorArgs, "--description", "Lifecycle work"]);
    assert.equal(created.status, 0, `${target.name}: ${created.stderr}`);
    assert.deepEqual(JSON.parse(created.stdout), {
      provider: "forgejo", operation: "label.create", repository: target.repo,
      name: "wayfinder", success: true, output: "created",
    });

    const listed = invoke(directory, ["--provider", "forgejo", ...target.args, "label", "list"]);
    assert.equal(listed.status, 0, `${target.name}: ${listed.stderr}`);
    assert.deepEqual(JSON.parse(listed.stdout).items, [{
      id: 17, name: "wayfinder", color: "7C3AED", description: "Lifecycle work",
    }]);
    const nativeCalls = await readFile(callsFile, "utf8");
    assert.match(nativeCalls, new RegExp(`labels create .*--repo ${target.repo}`));
    assert.match(nativeCalls, new RegExp(`labels list .*--repo ${target.repo}`));
    if (target.colorArgs.length) assert.match(nativeCalls, /--color 7C3AED/);
    else assert.match(nativeCalls, /--color 808080/);
  }
});

test("fails when Forgejo reports label creation but the label is not visible", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels create" ]; then printf '%s\\n' 'created';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[]';
else exit 99; fi`,
  });
  const result = invoke(directory, ["--provider", "forgejo", "label", "create", "--name", "missing"]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /reported success.*label.*missing.*not visible/i);
  assert.equal(result.stdout, "");
});

test("rejects malformed Forgejo label colors with an actionable format", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: 'exit 99',
  });
  const result = invoke(directory, ["--provider", "forgejo", "label", "create", "--name", "bad-color", "--color", "blue"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /six-digit hexadecimal RGB.*808080 or #808080/i);
});

test("normalizes GitHub label identifiers", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `printf '%s\\n' '[{"id":"LA_kwDO","name":"bug","color":"B60205","description":"Defect"}]'`,
  });
  const result = invoke(directory, ["label", "list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "label.list", repository: "owner/project",
    items: [{ id: "LA_kwDO", name: "bug", color: "B60205", description: "Defect" }],
  });
});

test("detects a configured Forgejo host and normalizes issues", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
else
  printf '%s\\n' '[{"index":9,"title":"Forge issue","state":"open","author":"alex","url":"https://forge.example/owner/project/issues/9","labels":["help wanted"]}]'
fi`,
  });
  const result = invoke(directory, ["issue", "list"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.provider, "forgejo");
  assert.equal(output.items[0].number, 9);
  assert.deepEqual(output.items[0].labels, ["help wanted"]);
});

test("returns null visibility when Forgejo does not report it", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "repos list" ]; then
  printf '%s' "$SC_TEST_LIST"
elif [ "$1 $2" = "repos search" ]; then
  printf '%s' '[]'
else
  exit 99
fi`,
  });
  const result = invoke(directory, ["repo", "view"], {
    SC_TEST_LIST: '[{"owner":"owner","name":"project","description":"Example","url":"https://forge.example/owner/project","type":"source"}]',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).item, {
    name: "owner/project",
    description: "Example",
    url: "https://forge.example/owner/project",
    visibility: null,
    fork: false,
    defaultBranch: null,
  });
});

test("classifies Forgejo visibility from explicit tea search filters and preserves a reported default branch", async (t) => {
  for (const visibility of ["private", "public"]) {
    const directory = await fixture(t, {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "repos list" ]; then
  printf '%s' "$SC_TEST_LIST"
elif [ "$1 $2" = "repos search" ]; then
  case "$*" in
    *"--private true"*) printf '%s' "$SC_TEST_PRIVATE" ;;
    *"--private false"*) printf '%s' "$SC_TEST_PUBLIC" ;;
    *) exit 99 ;;
  esac
else
  exit 99
fi`,
    });
    const result = invoke(directory, ["repo", "view"], {
      SC_TEST_LIST: '[{"owner":"owner","name":"project","description":"Example","url":"https://forge.example/owner/project","type":"source","default_branch":"trunk"}]',
      SC_TEST_PRIVATE: visibility === "private" ? '[{"owner":"owner","name":"project"}]' : "[]",
      SC_TEST_PUBLIC: visibility === "public" ? '[{"owner":"owner","name":"project"}]' : "[]",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).item.visibility, visibility);
    assert.equal(JSON.parse(result.stdout).item.defaultBranch, "trunk");
  }
});

test("paginates Forgejo visibility searches and classifies a repository found on page two", async (t) => {
  const firstPage = JSON.stringify(Array.from({ length: 100 }, (_, index) => ({
    owner: "owner",
    name: `other-${index}`,
  })));

  for (const visibility of ["private", "public"]) {
    const directory = await fixture(t, {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "repos list" ]; then
  printf '%s' '[{"owner":"owner","name":"project"}]'
elif [ "$1 $2" = "repos search" ]; then
  printf '%s\\n' "$*" >> "$SC_TEST_SEARCH_CALLS"
  case "$*" in
    *"--private true"*)
      case "$*" in
        *"--page 1"*) printf '%s' "$SC_TEST_PRIVATE_PAGE_ONE" ;;
        *"--page 2"*) printf '%s' "$SC_TEST_PRIVATE_PAGE_TWO" ;;
        *) exit 99 ;;
      esac ;;
    *"--private false"*)
      case "$*" in
        *"--page 1"*) printf '%s' "$SC_TEST_PUBLIC_PAGE_ONE" ;;
        *"--page 2"*) printf '%s' "$SC_TEST_PUBLIC_PAGE_TWO" ;;
        *) exit 99 ;;
      esac ;;
    *) exit 99 ;;
  esac
else
  exit 99
fi`,
    });
    const selectedPageTwo = JSON.stringify([{ owner: "owner", name: "project" }]);
    const result = invoke(directory, ["repo", "view"], {
      SC_TEST_SEARCH_CALLS: path.join(directory, "search-calls.txt"),
      SC_TEST_PRIVATE_PAGE_ONE: firstPage,
      SC_TEST_PRIVATE_PAGE_TWO: visibility === "private" ? selectedPageTwo : "[]",
      SC_TEST_PUBLIC_PAGE_ONE: firstPage,
      SC_TEST_PUBLIC_PAGE_TWO: visibility === "public" ? selectedPageTwo : "[]",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).item.visibility, visibility);
    const calls = await readFile(path.join(directory, "search-calls.txt"), "utf8");
    assert.match(calls, new RegExp(`--private ${visibility === "private" ? "true" : "false"} .*--page 2`));
  }
});

test("paginates Forgejo repository listing and reports a repository missing from all pages", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "repos list" ]; then
  case "$*" in
    *"--page 1"*) printf '%s' "$SC_TEST_PAGE_ONE" ;;
    *"--page 2"*) printf '%s' '[{"owner":"owner","name":"project"}]' ;;
    *) printf '%s' '[]' ;;
  esac
elif [ "$1 $2" = "repos search" ]; then
  printf '%s' '[]'
else
  exit 99
fi`,
  });
  const firstPage = JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ owner: "owner", name: `other-${index}` })));
  const found = invoke(directory, ["repo", "view"], { SC_TEST_PAGE_ONE: firstPage });
  assert.equal(found.status, 0, found.stderr);
  assert.equal(JSON.parse(found.stdout).item.name, "owner/project");

  const missingDirectory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "repos list" ]; then printf '%s' '[]';
else exit 99; fi`,
  });
  const missing = invoke(missingDirectory, ["repo", "view"]);
  assert.equal(missing.status, 8);
  assert.match(missing.stderr, /repository not found/);
});

test("normalizes populated and empty pull-request comment fixtures across providers", async (t) => {
  const cases = [
    {
      provider: "forgejo",
      fixtureName: "forgejo-pr-comments-populated.json",
      scripts: {
        git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
        tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: [{
        id: 19,
        author: "alex",
        body: "Looks good",
        url: "https://forge.example/owner/project/pulls/18#issuecomment-19",
        createdAt: "2026-09-14T05:30:00Z",
        updatedAt: "2026-09-14T05:31:00Z",
      }],
    },
    {
      provider: "github",
      fixtureName: "github-pr-comments-populated.json",
      scripts: {
        git: 'printf "%s\\n" "git@github.com:owner/project.git"',
        gh: `
if [ "$1 $2 $3" = "pr view 18" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: [{
        id: 19,
        author: "alex",
        body: "Looks good",
        url: "https://github.com/owner/project/pull/18#issuecomment-19",
        createdAt: "2026-09-14T05:30:00Z",
        updatedAt: "2026-09-14T05:31:00Z",
      }],
    },
    {
      provider: "forgejo",
      fixtureName: "forgejo-pr-comments-empty.txt",
      scripts: {
        git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
        tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: [],
    },
    {
      provider: "github",
      fixtureName: "github-pr-comments-empty.json",
      scripts: {
        git: 'printf "%s\\n" "git@github.com:owner/project.git"',
        gh: `
if [ "$1 $2 $3" = "pr view 18" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: [],
    },
  ];

  const populatedSchemas = [];
  for (const testCase of cases) {
    const directory = await fixture(t, testCase.scripts);
    const output = await readFile(path.join(skillRoot, "tests", "fixtures", testCase.fixtureName), "utf8");
    const result = invoke(directory, ["pr", "comments", "18"], { SC_TEST_OUTPUT: output });
    assert.equal(result.status, 0, `${testCase.provider}/${testCase.fixtureName}: ${result.stderr}`);
    const normalized = JSON.parse(result.stdout);
    assert.deepEqual(normalized, {
      provider: testCase.provider, operation: "pr.comments", repository: "owner/project", number: 18, items: testCase.expected,
    });
    if (testCase.expected.length) {
      populatedSchemas.push(Object.fromEntries(Object.entries(normalized.items[0]).map(([key, value]) => [
        key, value === null ? "null" : typeof value,
      ])));
    }
  }
  assert.deepEqual(populatedSchemas[0], populatedSchemas[1]);
});

test("rejects unsupported pull-request comment output for both providers without leaking it", async (t) => {
  for (const testCase of [
    {
      provider: "forgejo",
      fixtureName: "forgejo-pr-comments-malformed.json",
      scripts: {
        git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
        tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      diagnostic: /expected a JSON array or empty output/,
    },
    {
      provider: "github",
      fixtureName: "github-pr-comments-malformed.json",
      scripts: {
        git: 'printf "%s\\n" "git@github.com:owner/project.git"',
        gh: `
if [ "$1 $2 $3" = "pr view 18" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      diagnostic: /expected a JSON object with a comments array/,
    },
  ]) {
    const directory = await fixture(t, testCase.scripts);
    const output = await readFile(path.join(skillRoot, "tests", "fixtures", testCase.fixtureName), "utf8");
    const result = invoke(directory, ["pr", "comments", "18"], { SC_TEST_OUTPUT: output });
    assert.equal(result.status, 8, `${testCase.provider}: ${result.stderr}`);
    assert.match(result.stderr, /could not normalize pr\.comments output/);
    assert.match(result.stderr, testCase.diagnostic);
    assert.match(result.stderr, /safe remediation: check the provider capability and fixture against the source-control command contract/);
    assert.doesNotMatch(result.stderr, /fixture-sensitive-marker/);
    assert.doesNotMatch(result.stderr, /fixture-provider-token|fixture-secret|alex:fixture-secret|token=fixture/);
    assert.equal(result.stdout, "");
  }
});

test("aggregates supported paginated Forgejo pull-request comments in stable order", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  case "$(printf '%s' "$*" | sed -n 's/.*--page \\([0-9]*\\).*/\\1/p')" in
    1) printf '%s' "$SC_TEST_PAGE_1" ;;
    2) printf '%s' "$SC_TEST_PAGE_2" ;;
    *) exit 99 ;;
  esac
else
  exit 99
fi`,
  });
  const pages = await Promise.all([
    readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-page-1.json"), "utf8"),
    readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-page-2.json"), "utf8"),
  ]);
  const result = invoke(directory, ["pr", "comments", "18"], {
    SC_TEST_PAGE_1: pages[0],
    SC_TEST_PAGE_2: pages[1],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).items.map((item) => item.id), [19, 20]);
});

test("terminates Forgejo pagination on repeated page references without duplicate pages", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  page=$(printf '%s' "$*" | sed -n 's/.*--page \\([0-9]*\\).*/\\1/p')
  if [ "$page" = "1" ]; then printf '%s' "$SC_TEST_PAGE_1";
  elif [ "$page" = "2" ]; then printf '%s' "$SC_TEST_PAGE_2";
  else exit 99; fi
else
  exit 99
fi`,
  });
  const pages = await Promise.all([
    readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-repeated-page-1.json"), "utf8"),
    readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-repeated-page-2.json"), "utf8"),
  ]);
  const result = invoke(directory, ["pr", "comments", "18"], {
    SC_TEST_PAGE_1: pages[0],
    SC_TEST_PAGE_2: pages[1],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).items.map((item) => item.id), [19, 20]);
});

test("accepts an empty Forgejo pagination page", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
  });
  const output = await readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-empty-page.json"), "utf8");
  const result = invoke(directory, ["pr", "comments", "18"], { SC_TEST_OUTPUT: output });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).items, []);
});

test("rejects malformed Forgejo pagination metadata without leaking it", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
  });
  const output = await readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-comments-malformed-pagination.json"), "utf8");
  const result = invoke(directory, ["pr", "comments", "18"], { SC_TEST_OUTPUT: output });
  assert.equal(result.status, 8, result.stderr);
  assert.match(result.stderr, /could not normalize pr\.comments output/);
  assert.match(result.stderr, /pagination\.next to be null or a positive integer page number/);
  assert.doesNotMatch(result.stderr, /fixture-provider-token|fixture-secret|token=fixture/);
  assert.equal(result.stdout, "");
});

test("reports actionable diagnostics for malformed pull-request comment JSON without leaking it", async (t) => {
  for (const testCase of [
    {
      provider: "forgejo",
      output: '{"token":"fixture-provider-token","url":"https://alex:fixture-secret@forge.example/owner/project/pulls/18?token=fixture"',
      scripts: {
        git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
        tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "comments list" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: /expected a JSON array or empty output/,
    },
    {
      provider: "github",
      output: '{"token":"fixture-provider-token","url":"https://alex:fixture-secret@github.example/owner/project/pull/18?token=fixture"',
      scripts: {
        git: 'printf "%s\\n" "git@github.com:owner/project.git"',
        gh: `
if [ "$1 $2 $3" = "pr view 18" ]; then
  printf '%s' "$SC_TEST_OUTPUT"
else
  exit 99
fi`,
      },
      expected: /expected a JSON object with a comments array/,
    },
  ]) {
    const directory = await fixture(t, testCase.scripts);
    const result = invoke(directory, ["pr", "comments", "18"], { SC_TEST_OUTPUT: testCase.output });
    assert.equal(result.status, 8, `${testCase.provider}: ${result.stderr}`);
    assert.match(result.stderr, /could not normalize pr\.comments output/);
    assert.match(result.stderr, testCase.expected);
    assert.match(result.stderr, /safe remediation: check the provider capability and fixture against the source-control command contract/);
    assert.doesNotMatch(result.stderr, /fixture-provider-token|fixture-secret|alex:fixture-secret|token=fixture/);
    assert.equal(result.stdout, "");
  }
});

test("fails deterministically when provider detection is ambiguous", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@unknown.example/owner/project.git"',
    tea: `printf '%s\\n' '[]'`,
  });
  const result = invoke(directory, ["provider"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /pass --provider/);
  assert.equal(result.stdout, "");
});

test("rejects missing body files before invoking a write", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: "exit 99",
  });
  const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", "/definitely/missing"]);
  assert.equal(result.status, 5);
  assert.match(result.stderr, /file not found/);
});

test("normalizes a Forgejo issue creation with external links in the rendered body", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$1 $2" = "issues create" ]; then
  printf '%s' "$SC_TEST_CREATE_OUTPUT"
elif [ "$1 $2" = "issues 73" ]; then
  printf '%s\\n' '[{"index":73,"title":"Build contextual desktop chat","url":"https://forge.example/owner/project/issues/73"}]'
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  const body = "Compare [Astryx](https://github.com/facebook/astryx) with [the reference](https://example.com/reference).";
  await writeFile(bodyFile, body);
  const createOutput = await readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-issue-create-with-links.txt"), "utf8");
  const result = invoke(directory, ["issue", "create", "--title", "Build contextual desktop chat", "--body-file", bodyFile], {
    SC_TEST_CREATE_OUTPUT: createOutput,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "issue.create", repository: "owner/project", number: 73,
    success: true, url: "https://forge.example/owner/project/issues/73",
  });
});

test("rejects missing Forgejo issue-create output", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "issues create" ]; then exit 0;
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /created issue URL.*missing/i);
  assert.equal(result.stdout, "");
});

test("rejects a malformed Forgejo issue-create URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "issues create" ]; then printf '%s\\n' 'https://forge.example/owner/project/releases/73';
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /does not identify an issue in repository owner\/project/);
  assert.equal(result.stdout, "");
});

test("rejects ambiguous Forgejo issue-create output", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "issues create" ]; then
  printf '%s\\n' 'https://forge.example/owner/project/issues/73 https://forge.example/owner/project/issues/74';
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /expected exactly one URL, found 2/);
  assert.equal(result.stdout, "");
});

test("rejects missing, malformed, and ambiguous Forgejo structured creation verification", async (t) => {
  const cases = [
    ["missing", "[]", /expected exactly one structured issue, found 0/],
    ["malformed", "{", /could not normalize issue\.create verification output as JSON/],
    ["ambiguous", '[{"index":73},{"index":73}]', /expected exactly one structured issue, found 2/],
  ];
  for (const [name, verificationOutput, expectedError] of cases) {
    const directory = await fixture(t, {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "issues create" ]; then printf '%s\\n' 'https://forge.example/owner/project/issues/73';
elif [ "$1 $2" = "issues 73" ]; then printf '%s' "$SC_TEST_VERIFY_OUTPUT";
else exit 99; fi`,
    });
    const bodyFile = path.join(directory, "body.md");
    await writeFile(bodyFile, "Body");
    const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", bodyFile], {
      SC_TEST_VERIFY_OUTPUT: verificationOutput,
    });
    assert.equal(result.status, 8, `${name}: ${result.stderr}`);
    assert.match(result.stderr, expectedError, name);
    assert.equal(result.stdout, "", name);
  }
});

test("edits a GitHub issue body from a file", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'test "$1 $2 $3 $4" = "issue edit 7 --body-file" && test -f "$5" && printf "https://github.com/owner/project/issues/7\\n"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Updated body");
  const result = invoke(directory, ["issue", "edit", "7", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "issue.edit", repository: "owner/project", number: 7,
    success: true, url: "https://github.com/owner/project/issues/7",
  });
});

test("edits GitHub labels singly and repeatedly", async (t) => {
  const callsFile = path.join(tmpdir(), `source-control-gh-edit-labels-${process.pid}`);
  t.after(() => rm(callsFile, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_ready","name":"ready"},{"id":"LA_progress","name":"in-progress"},{"id":"LA_blocked","name":"blocked"}]';
elif [ "$*" = "issue edit 7 --add-label ready --add-label in-progress --remove-label blocked --repo owner/project" ]; then
  touch "${callsFile}"
  printf '%s\\n' 'https://github.com/owner/project/issues/7'
else exit 99; fi`,
  });
  const result = invoke(directory, ["issue", "edit", "7", "--add-label", "ready", "--add-label", "in-progress", "--remove-label", "blocked"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "issue.edit", repository: "owner/project", number: 7,
    success: true, url: "https://github.com/owner/project/issues/7",
  });
});

test("edits a Forgejo issue body from a file", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2 $3" = "issues edit 9" ] && [ "$4" = "--description" ] && [ "$5" = "Updated body" ]; then printf '%s\\n' 'https://forge.example/owner/project/issues/9';
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Updated body");
  const result = invoke(directory, ["issue", "edit", "9", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "issue.edit", repository: "owner/project", number: 9,
    success: true, url: "https://forge.example/owner/project/issues/9",
  });
});

test("edits Forgejo labels singly and repeatedly", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"ready"},{"id":18,"name":"in-progress"},{"id":19,"name":"blocked"}]';
elif [ "$*" = "issues edit 9 --add-labels ready,in-progress --remove-labels blocked --repo owner/project" ]; then
  printf '%s\\n' 'https://forge.example/owner/project/issues/9'
else exit 99; fi`,
  });
  const result = invoke(directory, ["issue", "edit", "9", "--add-label", "ready", "--add-label", "in-progress", "--remove-label", "blocked"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "issue.edit", repository: "owner/project", number: 9,
    success: true, url: "https://forge.example/owner/project/issues/9",
  });
});

test("deletes a GitHub label by exact ID and verifies it in the same repository", async (t) => {
  const calls = path.join(tmpdir(), `source-control-gh-label-delete-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$1 $2" = "label list" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  if [ -f "${calls}.deleted" ]; then printf '%s\\n' '[{"id":"LA_other","name":"same"}]';
  else printf '%s\\n' '[{"id":"LA_target","name":"target"},{"id":"LA_other","name":"same"}]'; fi
elif [ "$1 $2" = "label delete" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  test "$3" = "target" && test "$4" = "--yes" && test "$5 $6" = "--repo owner/project" || exit 90
  touch "${calls}.deleted"
else exit 99; fi`,
  });
  t.after(() => rm(`${calls}.deleted`, { force: true }));
  const result = invoke(directory, ["label", "delete", "--id", "LA_target"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", repository: "owner/project", operation: "label.delete", label_id: "LA_target", success: true,
  });
  const native = await readFile(calls, "utf8");
  assert.equal((native.match(/label list/g) ?? []).length, 3);
  assert.match(native, /label delete target --yes --repo owner\/project/);
});

test("removes one attached GitHub label ID and verifies unrelated labels remain", async (t) => {
  const calls = path.join(tmpdir(), `source-control-gh-issue-remove-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_target","name":"target"},{"id":"LA_keep","name":"keep"}]';
elif [ "$1 $2" = "issue view" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  if [ -f "${calls}.removed" ]; then printf '%s\\n' '{"number":7,"labels":[{"id":"LA_keep","name":"keep"}]}';
  else printf '%s\\n' '{"number":7,"labels":[{"id":"LA_target","name":"target"},{"id":"LA_keep","name":"keep"}]}'; fi
elif [ "$1 $2" = "issue edit" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  test "$*" = "issue edit 7 --remove-label target --repo owner/project" || exit 90
  touch "${calls}.removed"
else exit 99; fi`,
  });
  t.after(() => rm(`${calls}.removed`, { force: true }));
  const result = invoke(directory, ["issue", "remove-label", "7", "--id", "LA_target"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", repository: "owner/project", operation: "issue.remove-label", issue_number: 7, label_id: "LA_target", success: true,
  });
  const native = await readFile(calls, "utf8");
  assert.match(native, /issue view 7 --json number,labels --repo owner\/project/);
  assert.match(native, /issue edit 7 --remove-label target --repo owner\/project/);
});

test("deletes a Forgejo label by ID using the repository-scoped native capability", async (t) => {
  const calls = path.join(tmpdir(), `source-control-tea-label-delete-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  if [ -f "${calls}.deleted" ]; then printf '%s\\n' '[]'; else printf '%s\\n' '[{"id":17,"name":"target"}]'; fi
elif [ "$1 $2" = "labels delete" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  test "$*" = "labels delete --id 17 --repo owner/project" || exit 90
  touch "${calls}.deleted"
else exit 99; fi`,
  });
  t.after(() => rm(`${calls}.deleted`, { force: true }));
  const result = invoke(directory, ["--provider", "forgejo", "label", "delete", "--id", "17"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", repository: "owner/project", operation: "label.delete", label_id: "17", success: true,
  });
  assert.match(await readFile(calls, "utf8"), /labels delete --id 17 --repo owner\/project/);
});

test("removes one attached Forgejo label ID and preserves other label IDs", async (t) => {
  const calls = path.join(tmpdir(), `source-control-tea-issue-remove-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  printf '%s\\n' '[{"id":17,"name":"target"},{"id":18,"name":"keep"}]'
elif [ "$1 $2" = "issues 9" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  if [ -f "${calls}.removed" ]; then printf '%s\\n' '{"index":9,"labels":[{"id":18,"name":"keep"}]}';
  else printf '%s\\n' '{"index":9,"labels":[{"id":17,"name":"target"},{"id":18,"name":"keep"}]}'; fi
elif [ "$1 $2" = "issues edit" ]; then
  printf '%s\\n' "$*" >> "${calls}"
  test "$*" = "issues edit 9 --remove-labels target --repo owner/project" || exit 90
  touch "${calls}.removed"
else exit 99; fi`,
  });
  t.after(() => rm(`${calls}.removed`, { force: true }));
  const result = invoke(directory, ["--provider", "forgejo", "issue", "remove-label", "9", "--id", "17"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", repository: "owner/project", operation: "issue.remove-label", issue_number: 9, label_id: "17", success: true,
  });
  const native = await readFile(calls, "utf8");
  assert.match(native, /issues 9 --fields index,labels --output json --repo owner\/project/);
  assert.match(native, /issues edit 9 --remove-labels target --repo owner\/project/);
});

test("rejects ambiguous label names before any issue-label write for both providers", async (t) => {
  for (const [provider, args, scripts] of [
    ["github", ["--provider", "github"], {
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: `if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_one","name":"duplicate"},{"id":"LA_two","name":"duplicate"}]'; elif [ "$1 $2" = "issue edit" ]; then exit 90; else exit 99; fi`,
    }],
    ["forgejo", ["--provider", "forgejo"], {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]'; elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"duplicate"},{"id":18,"name":"duplicate"}]'; elif [ "$1 $2" = "issues edit" ]; then exit 90; else exit 99; fi`,
    }],
  ]) {
    const directory = await fixture(t, scripts);
    const result = invoke(directory, [...args, "issue", "edit", provider === "github" ? "7" : "9", "--remove-label", "duplicate"]);
    assert.equal(result.status, 2, `${provider}: ${result.stderr}`);
    assert.match(result.stderr, /ambiguous/);
    assert.equal(result.stdout, "");
  }
});

test("rejects issue-label removal when the selected ID is not attached", async (t) => {
  const calls = path.join(tmpdir(), `source-control-gh-issue-not-attached-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_target","name":"target"}]';
elif [ "$1 $2" = "issue view" ]; then printf '%s\\n' '{"number":7,"labels":[]}';
elif [ "$1 $2" = "issue edit" ]; then touch "${calls}"; exit 90; else exit 99; fi`,
  });
  const result = invoke(directory, ["issue", "remove-label", "7", "--id", "LA_target"]);
  assert.equal(result.status, 5);
  assert.match(result.stderr, /not attached/);
  await assert.rejects(readFile(calls));
});

test("rejects absent, malformed, and non-singleton issue reads before mutation for both providers", async (t) => {
  const cases = [
    ["github", ["--provider", "github"], "7", ["[]", "{}", '{"number":7}', '{"number":7,"labels":{}}', '{"number":7,"labels":[{}]}']],
    ["forgejo", ["--provider", "forgejo"], "9", ["[]", '[{},{}]', '{"index":9}', '{"index":9,"labels":null}', '{"index":9,"labels":[{"id":17}]}']],
  ];
  for (const [provider, globalArgs, number, invalidRecords] of cases) {
    for (const issueRecord of invalidRecords) {
      const calls = path.join(tmpdir(), `source-control-${provider}-strict-read-${process.pid}-${Math.random()}`);
      t.after(() => rm(calls, { force: true }));
      const scripts = provider === "github" ? {
        git: 'printf "%s\\n" "git@github.com:owner/project.git"',
        gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_target","name":"target"}]';
elif [ "$1 $2" = "issue view" ]; then printf '%s\\n' "$SC_TEST_ISSUE";
elif [ "$1 $2" = "issue edit" ]; then touch "${calls}"; exit 90; else exit 99; fi`,
      } : {
        git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
        tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"target"}]';
elif [ "$1 $2" = "issues 9" ]; then printf '%s\\n' "$SC_TEST_ISSUE";
elif [ "$1 $2" = "issues edit" ]; then touch "${calls}"; exit 90; else exit 99; fi`,
      };
      const directory = await fixture(t, scripts);
      const result = invoke(directory, [...globalArgs, "issue", "remove-label", number, "--id", provider === "github" ? "LA_target" : "17"], {
        SC_TEST_ISSUE: issueRecord,
      });
      assert.equal(result.status, 8, `${provider} record ${issueRecord}: ${result.stderr}`);
      assert.equal(result.stdout, "");
      await assert.rejects(readFile(calls));
    }
  }
});

test("does not claim issue-label removal when post-mutation issue reads are missing or malformed", async (t) => {
  for (const [provider, globalArgs, number, id, validRecord, invalidRecord, scripts] of [
    ["github", ["--provider", "github"], "7", "LA_target", '{"number":7,"labels":[{"id":"LA_target","name":"target"}]}', '{"number":7,"labels":{}}', (calls, state, validRecord, invalidRecord) => ({
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_target","name":"target"}]';
elif [ "$1 $2" = "issue view" ]; then if [ -f "${state}" ]; then printf '%s\\n' '${invalidRecord}'; else printf '%s\\n' '${validRecord}'; fi
elif [ "$1 $2" = "issue edit" ]; then touch "${state}"; printf '%s\\n' "$*" >> "${calls}";
else exit 99; fi`,
    })],
    ["forgejo", ["--provider", "forgejo"], "9", "17", '{"index":9,"labels":[{"id":17,"name":"target"}]}', '[{}]', (calls, state, validRecord, invalidRecord) => ({
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"target"}]';
elif [ "$1 $2" = "issues 9" ]; then if [ -f "${state}" ]; then printf '%s\\n' '${invalidRecord}'; else printf '%s\\n' '${validRecord}'; fi
elif [ "$1 $2" = "issues edit" ]; then touch "${state}"; printf '%s\\n' "$*" >> "${calls}";
else exit 99; fi`,
    })],
  ]) {
    const calls = path.join(tmpdir(), `source-control-${provider}-invalid-readback-${process.pid}`);
    const state = `${calls}.mutated`;
    t.after(() => rm(calls, { force: true }));
    t.after(() => rm(state, { force: true }));
    const directory = await fixture(t, scripts(calls, state, validRecord, invalidRecord));
    const result = invoke(directory, [...globalArgs, "issue", "remove-label", number, "--id", id]);
    assert.equal(result.status, 8, `${provider}: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /could not verify issue/);
  }
});

test("rejects label-ID replacement races after issue removal for both providers", async (t) => {
  for (const [provider, globalArgs, number, id, repoTarget, replacement, scripts] of [
    ["github", ["--provider", "github"], "7", "LA_target", '{"number":7,"labels":[{"id":"LA_target","name":"target"}]}', '[{"id":"LA_replacement","name":"target"}]', (calls, state, validRecord, replacement) => ({
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: `
if [ "$1 $2" = "label list" ]; then if [ -f "${state}" ]; then printf '%s\\n' '${replacement}'; else printf '%s\\n' '[{"id":"LA_target","name":"target"}]'; fi
elif [ "$1 $2" = "issue view" ]; then if [ -f "${state}.removed" ]; then printf '%s\\n' '{"number":7,"labels":[]}'; else printf '%s\\n' '${validRecord}'; fi
elif [ "$1 $2" = "issue edit" ]; then touch "${state}.removed"; touch "${state}"; printf '%s\\n' "$*" >> "${calls}";
else exit 99; fi`,
    })],
    ["forgejo", ["--provider", "forgejo"], "9", "17", '{"index":9,"labels":[{"id":17,"name":"target"}]}', '[{"id":18,"name":"target"}]', (calls, state, validRecord, replacement) => ({
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then if [ -f "${state}" ]; then printf '%s\\n' '${replacement}'; else printf '%s\\n' '[{"id":17,"name":"target"}]'; fi
elif [ "$1 $2" = "issues 9" ]; then if [ -f "${state}.removed" ]; then printf '%s\\n' '{"index":9,"labels":[]}'; else printf '%s\\n' '${validRecord}'; fi
elif [ "$1 $2" = "issues edit" ]; then touch "${state}.removed"; touch "${state}"; printf '%s\\n' "$*" >> "${calls}";
else exit 99; fi`,
    })],
  ]) {
    const calls = path.join(tmpdir(), `source-control-${provider}-identity-race-${process.pid}`);
    const state = `${calls}.replacement`;
    t.after(() => rm(calls, { force: true }));
    t.after(() => rm(`${state}.removed`, { force: true }));
    t.after(() => rm(state, { force: true }));
    const directory = await fixture(t, scripts(calls, state, repoTarget, replacement));
    const result = invoke(directory, [...globalArgs, "issue", "remove-label", number, "--id", id]);
    assert.equal(result.status, 5, `${provider}: ${result.stderr}`);
    assert.match(result.stderr, /label ID.*not found/);
    assert.equal(result.stdout, "");
    assert.match(await readFile(calls, "utf8"), /issue|issues edit/);
  }
});

test("rejects malformed provider label IDs before reading or writing", async (t) => {
  for (const [provider, args, scripts] of [
    ["github", ["--provider", "github", "label", "delete", "--id", "17"], {
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: 'exit 90',
    }],
    ["forgejo", ["--provider", "forgejo", "issue", "remove-label", "9", "--id", "LA_target"], {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: 'if [ "$1" = "logins" ]; then printf "[ {\\"url\\":\\"https://forge.example\\"} ]\\n"; else exit 90; fi',
    }],
  ]) {
    const directory = await fixture(t, scripts);
    const result = invoke(directory, args);
    assert.equal(result.status, 2, `${provider}: ${result.stderr}`);
    assert.match(result.stderr, /malformed/);
    assert.equal(result.stdout, "");
  }
});

test("does not report success when a GitHub label remains after deletion", async (t) => {
  const calls = path.join(tmpdir(), `source-control-gh-label-delete-unverified-${process.pid}`);
  t.after(() => rm(calls, { force: true }));
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$1 $2" = "label list" ]; then printf '%s\\n' '[{"id":"LA_target","name":"target"}]';
elif [ "$1 $2" = "label delete" ]; then touch "${calls}"; printf '%s\\n' 'reported deleted';
else exit 99; fi`,
  });
  const result = invoke(directory, ["label", "delete", "--id", "LA_target"]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /could not verify.*label ID/);
  assert.equal(result.stdout, "");
});

test("propagates native Forgejo label-deletion failures without success output", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"target"}]';
elif [ "$1 $2" = "labels delete" ]; then printf '%s\\n' 'provider rejected deletion' >&2; exit 1;
else exit 99; fi`,
  });
  const result = invoke(directory, ["--provider", "forgejo", "label", "delete", "--id", "17"]);
  assert.equal(result.status, 7);
  assert.match(result.stderr, /provider rejected deletion/);
  assert.equal(result.stdout, "");
});

test("permits body-only edits without label arguments for both providers", async (t) => {
  for (const [provider, scripts, args, expected] of [
    ["github", {
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: 'test "$1 $2 $3 $4" = "issue edit 7 --body-file" && test -f "$5" && printf "ok\\n"',
    }, ["issue", "edit", "7"], "github"],
    ["forgejo", {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: 'if [ "$1" = "logins" ]; then printf "[{\\"url\\":\\"https://forge.example\\"}]\\n"; elif [ "$1 $2 $3" = "issues edit 9" ] && [ "$4" = "--description" ] && [ "$5" = "Updated body" ]; then printf "ok\\n"; else exit 99; fi',
    }, ["issue", "edit", "9"], "forgejo"],
  ]) {
    const directory = await fixture(t, scripts);
    const bodyFile = path.join(directory, "body.md");
    await writeFile(bodyFile, "Updated body");
    const result = invoke(directory, [...args, "--body-file", bodyFile]);
    assert.equal(result.status, 0, `${expected}: ${result.stderr}`);
  }
});

test("preserves the last verified lifecycle state when a mutation fails", () => {
  const lastVerified = ["thin-slice", "thin-slice-ready"];
  const mutation = { ok: false, error: "provider rejected label update" };
  const resultingState = mutation.ok ? ["thin-slice", "thin-slice-in-progress"] : lastVerified;
  assert.deepEqual(resultingState, lastVerified);
  assert.match(mutation.error, /provider rejected/);
});

test("edits a Forgejo pull-request body from a file", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2 $3" = "pulls edit 18" ] && [ "$4" = "--description" ] && [ "$5" = "Updated body" ]; then printf '%s\\n' 'https://forge.example/owner/project/pulls/18';
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Updated body");
  const result = invoke(directory, ["pr", "edit", "18", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "pr.edit", repository: "owner/project", number: 18,
    success: true, url: "https://forge.example/owner/project/pulls/18",
  });
});

test("strips terminal hyperlink controls from created URLs", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `printf '\\033]8;;https://github.com/owner/project/issues/12\\007https://github.com/owner/project/issues/12\\033]8;;\\007\\n'`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["issue", "create", "--title", "Example", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).url, "https://github.com/owner/project/issues/12");
});

test("normalizes a GitHub pull-request creation identity", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%s\\n" "https://github.com/owner/project/pull/12"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "pr.create", repository: "owner/project", success: true,
    number: 12, url: "https://github.com/owner/project/pulls/12", title: "Feature", base: "main", head: "feature", state: "open",
  });
});

test("promotes a GitHub draft pull request and normalizes its URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'test "$*" = "pr ready 12" && printf "%s\\n" "Ready for review"',
  });
  const result = invoke(directory, ["pr", "ready", "12"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "pr.ready", repository: "owner/project",
    number: 12, success: true, url: "https://github.com/owner/project/pulls/12",
  });
});

test("promotes a Forgejo draft pull request and normalizes its URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
elif [ "$*" = "pulls edit 14 --ready" ]; then
  printf '%s\\n' 'Ready for review'
else
  exit 99
fi`,
  });
  const result = invoke(directory, ["pr", "ready", "14"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "pr.ready", repository: "owner/project",
    number: 14, success: true, url: "https://forge.example/owner/project/pulls/14",
  });
});

test("normalizes a GitHub general PR comment without treating it as PR creation", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'test "$1 $2 $3 $4" = "pr comment 12 --body-file" && test -f "$5" && printf "%s\\n" "https://github.com/owner/project/pull/12#issuecomment-99"',
  });
  const bodyFile = path.join(directory, "review.md");
  await writeFile(bodyFile, "Review pass 1");
  const result = invoke(directory, ["pr", "comment", "12", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "pr.comment", repository: "owner/project",
    number: 12, success: true, url: "https://github.com/owner/project/pull/12#issuecomment-99",
  });
});

test("propagates provider failures for draft promotion", async (t) => {
  for (const scripts of [
    {
      git: 'printf "%s\\n" "git@github.com:owner/project.git"',
      gh: 'test "$*" = "pr ready 12" && printf "provider rejected\\n" >&2 && exit 42',
    },
    {
      git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
      tea: 'if [ "$1" = "logins" ]; then printf "[{\\"url\\":\\"https://forge.example\\"}]\\n"; elif [ "$*" = "pulls edit 14 --ready" ]; then printf "provider rejected\\n" >&2; exit 42; else exit 99; fi',
    },
  ]) {
    const directory = await fixture(t, scripts);
    const result = invoke(directory, ["pr", "ready", scripts.gh ? "12" : "14"]);
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /provider rejected|command failed/);
    assert.equal(result.stdout, "");
  }
});

test("reports draft promotion in provider capabilities", async (t) => {
  for (const scripts of [
    { git: 'printf "%s\\n" "git@github.com:owner/project.git"' },
    { git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"', tea: 'if [ "$1" = "logins" ]; then printf "[{\\"url\\":\\"https://forge.example\\"}]\\n"; else exit 99; fi' },
  ]) {
    const directory = await fixture(t, scripts);
    const result = invoke(directory, ["capabilities"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).capabilities["pr.ready"], true);
  }
});

test("reports an actionable diagnostic for unsupported provider commands", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
  });
  const result = invoke(directory, ["pr", "unsupported-action"]);
  assert.equal(result.status, 4, result.stderr);
  assert.match(result.stderr, /operation is unsupported for github: pr\.unsupported-action/);
  assert.equal(result.stdout, "");
});

test("rejects a Forgejo issue URL as a pull request URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: 'if [ "$1" = "logins" ]; then printf "[{\\"url\\":\\"https://forge.example\\"}]\\n"; else printf "%s\\n" "https://forge.example/owner/project/issues/13"; fi',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /no canonical pull-request URL found/);
  assert.equal(result.stdout, "");
});

test("normalizes one Forgejo PR URL while ignoring body and tracker URLs", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "pulls create" ]; then printf '%b' "$SC_TEST_CREATE_OUTPUT";
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body with https://github.com/owner/project/issues/123");
  const createOutput = await readFile(path.join(skillRoot, "tests", "fixtures", "forgejo-pr-create-with-links.txt"), "utf8");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile], {
    SC_TEST_CREATE_OUTPUT: createOutput,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "pr.create", repository: "owner/project", success: true,
    number: 126, url: "https://forge.example/owner/project/pulls/126", title: "Feature", base: "main", head: "feature", state: "open",
  });
});

test("deduplicates repeated copies of the same pull-request URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%s\\n" "https://github.com/owner/project/pull/12 https://github.com/owner/project/pull/12"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).url, "https://github.com/owner/project/pulls/12");
});

test("normalizes PR URLs with trailing punctuation and ANSI hyperlinks", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%b" "$SC_TEST_CREATE_OUTPUT"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile], {
    SC_TEST_CREATE_OUTPUT: "\\033]8;;https://github.com/owner/project/pull/12\\007https://github.com/owner/project/pull/12\\033]8;;\\007.\\n",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).number, 12);
});

test("prefers a structured PR URL over URLs in structured body fields", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `printf '%s\\n' '{"url":"https://github.com/owner/project/pull/15","body":"See https://github.com/owner/project/issues/123"}'`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).number, 15);
});

test("qualifies Forgejo slash-containing heads for Tea", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "pulls create" ]; then
  test "$4" = "main" && test "$6" = "owner:feature/topic" || exit 98;
  printf '%s\\n' 'https://forge.example/owner/project/pulls/14';
else exit 99; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature/topic", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).head, "feature/topic");
});

test("reports Forgejo PR creation context on target-resolution failure", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
else printf '%s\\n' 'The target could not be found' >&2; exit 1; fi`,
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature/topic", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 7);
  assert.match(result.stderr, /base "main".*head "feature\/topic".*repository "owner\/project"/s);
  assert.match(result.stderr, /tea pulls create/);
});

test("rejects ambiguous pull-request creation responses", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%s\\n" "https://github.com/owner/project/pull/12 https://github.com/owner/project/pull/13"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /ambiguous canonical pull-request URLs/);
  assert.match(result.stderr, /pulls\/12/);
  assert.match(result.stderr, /pulls\/13/);
  assert.equal(result.stdout, "");
});

test("rejects native PR creation output with no usable PR URL", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'printf "%s\\n" "Created from https://github.com/owner/project/issues/12 and https://example.com/tracker/12"',
  });
  const bodyFile = path.join(directory, "body.md");
  await writeFile(bodyFile, "Body");
  const result = invoke(directory, ["pr", "create", "--base", "main", "--head", "feature", "--title", "Feature", "--body-file", bodyFile]);
  assert.equal(result.status, 8);
  assert.match(result.stderr, /no canonical pull-request URL found/);
  assert.equal(result.stdout, "");
});

test("closes a GitHub issue", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: 'test "$1 $2 $3" = "issue close 42"',
  });
  const result = invoke(directory, ["issue", "close", "42"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github", operation: "issue.close", repository: "owner/project", number: 42,
    success: true, url: null,
  });
});

test("closes a Forgejo issue", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2 $3" = "issues close 9" ]; then exit 0;
else exit 99; fi`,
  });
  const result = invoke(directory, ["issue", "close", "9"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "forgejo", operation: "issue.close", repository: "owner/project", number: 9,
    success: true, url: null,
  });
});

// --- Native tool minimum-version checks ---

const teaLabels = `[{"id":1,"name":"status/committed","color":"0e8a16","description":"Ready"}]`;
const forgejoRemote = 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"';
const githubRemote = 'printf "%s\\n" "git@github.com:owner/project.git"';

// A tea stub whose `--version` output is the given shell snippet and whose other calls log argv.
function teaStub(versionOutput, log) {
  return `
echo "$*" >> "${log}"
if [ "$1" = "--version" ]; then ${versionOutput}; exit 0; fi
if [ "$1 $2" = "labels list" ]; then printf '%s\\n' '${teaLabels}'; exit 0; fi
if [ "$1 $2" = "labels create" ]; then exit 0; fi
exit 99`;
}

function teaVersion(text) {
  return `printf 'Version: %s\\tgolang: 1.26.5\\tbuilt with: Homebrew\\n' '${text}'`;
}

async function versionFixture(t, versionOutput) {
  const directory = await fixture(t, { git: forgejoRemote, tea: "" });
  const log = path.join(directory, "tea.log");
  await mockExecutable(directory, "tea", teaStub(versionOutput, log));
  return { directory, log };
}

const labelList = ["--provider", "forgejo", "--repo", "owner/project", "label", "list"];

test("rejects a tea older than the minimum with a dedicated exit code and actionable message", async (t) => {
  const { directory } = await versionFixture(t, teaVersion("0.14.1"));
  const result = invoke(directory, labelList);
  assert.equal(result.status, 9);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /tea 0\.14\.1 is older than the minimum supported version 0\.15\.0/);
  assert.match(result.stderr, /label list omits the org-level labels/);
  assert.match(result.stderr, /Fix: brew upgrade tea/);
  assert.match(result.stderr, /SC_SKIP_VERSION_CHECK=1/);
});

test("accepts tea at exactly the minimum and newer", async (t) => {
  for (const version of ["0.15.0", "0.15.1", "0.16.0", "1.0.0"]) {
    const { directory } = await versionFixture(t, teaVersion(version));
    const result = invoke(directory, labelList);
    assert.equal(result.status, 0, `${version}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).items[0].name, "status/committed");
    assert.equal(result.stderr, "");
  }
});

test("compares versions numerically so 0.9 is older than 0.15", async (t) => {
  for (const version of ["0.9", "0.9.2", "0.2.0", "0.14.99"]) {
    const { directory } = await versionFixture(t, teaVersion(version));
    const result = invoke(directory, labelList);
    assert.equal(result.status, 9, `${version} should be rejected`);
    assert.match(result.stderr, /is older than the minimum supported version 0\.15\.0/);
  }
  const { directory } = await versionFixture(t, teaVersion("0.100.0"));
  assert.equal(invoke(directory, labelList).status, 0);
});

test("parses ANSI-wrapped tea version output", async (t) => {
  const ansi = (text) => `printf 'Version: \\033[1m%s\\033[0m\\tgolang: 1.26.5\\tbuilt with: Homebrew\\n' '${text}'`;
  const old = await versionFixture(t, ansi("0.14.1"));
  const rejected = invoke(old.directory, labelList);
  assert.equal(rejected.status, 9);
  assert.match(rejected.stderr, /tea 0\.14\.1 is older/);
  assert.doesNotMatch(rejected.stderr, /\x1b/);
  const current = await versionFixture(t, ansi("0.15.1"));
  assert.equal(invoke(current.directory, labelList).status, 0);
});

test("handles pre-release and build suffixes", async (t) => {
  const rc = await versionFixture(t, teaVersion("0.15.0-rc1"));
  const rejected = invoke(rc.directory, labelList);
  assert.equal(rejected.status, 9, "a pre-release of the minimum is older than the minimum");
  assert.match(rejected.stderr, /tea 0\.15\.0-rc1 is older/);
  for (const version of ["0.15.1-rc1+build.5", "0.16.0+dirty", "v0.15.2"]) {
    const { directory } = await versionFixture(t, teaVersion(version));
    assert.equal(invoke(directory, labelList).status, 0, version);
  }
});

test("fails distinctly when the tea version cannot be parsed", async (t) => {
  for (const output of ["printf 'something unexpected\\n'", "printf ''", "printf 'Version: dev\\n'"]) {
    const { directory } = await versionFixture(t, output);
    const result = invoke(directory, labelList);
    assert.equal(result.status, 9);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /could not determine the installed tea version/);
    assert.doesNotMatch(result.stderr, /is older than/);
  }
  const directory = await fixture(t, { git: forgejoRemote });
  await mockExecutable(directory, "tea", 'if [ "$1" = "--version" ]; then exit 3; fi; exit 99');
  const failed = invoke(directory, labelList);
  assert.equal(failed.status, 9);
  assert.match(failed.stderr, /"tea --version" failed with exit code 3/);
});

test("reports a missing tool with the missing-executable code, not the version code", async (t) => {
  const directory = await fixture(t, { git: forgejoRemote });
  const result = invoke(directory, labelList, { PATH: directory });
  assert.equal(result.status, 5);
  assert.match(result.stderr, /required executable not found: tea/);
  assert.equal(result.stdout, "");
});

test("checks only the tool for the provider in use", async (t) => {
  const github = await fixture(t, { git: githubRemote });
  await mockExecutable(github, "tea", "exit 99");
  await mockExecutable(github, "gh", `
if [ "$1" = "--version" ]; then printf 'gh version 2.57.0 (2024-10-14)\\n'; exit 0; fi
printf '%s\\n' '[{"id":"L1","name":"bug","color":"d73a4a","description":""}]'`);
  const ok = invoke(github, ["--provider", "github", "label", "list"]);
  assert.equal(ok.status, 0, ok.stderr);

  // An old or absent tea must not break GitHub, and an old gh must not break Forgejo.
  const teaOld = await fixture(t, { git: githubRemote });
  await mockExecutable(teaOld, "tea", teaVersion("0.1.0").replace(/^/, 'if [ "$1" = "--version" ]; then ') + "; exit 0; fi; exit 99");
  await mockExecutable(teaOld, "gh", `
if [ "$1" = "--version" ]; then printf 'gh version 2.60.0 (2024-10-14)\\n'; exit 0; fi
printf '%s\\n' '[]'`);
  assert.equal(invoke(teaOld, ["--provider", "github", "label", "list"]).status, 0);

  const { directory } = await versionFixture(t, teaVersion("0.15.1"));
  await mockExecutable(directory, "gh", 'if [ "$1" = "--version" ]; then printf "gh version 1.0.0 (2020-01-01)\\n"; exit 0; fi; exit 99');
  assert.equal(invoke(directory, labelList).status, 0);
});

test("rejects a gh older than the minimum and names the gh-specific symptom", async (t) => {
  const directory = await fixture(t, { git: githubRemote });
  await mockExecutable(directory, "gh", 'if [ "$1" = "--version" ]; then printf "gh version 2.56.0 (2024-09-01)\\nhttps://github.com/cli/cli/releases/tag/v2.56.0\\n"; exit 0; fi; exit 99');
  const result = invoke(directory, ["--provider", "github", "label", "list"]);
  assert.equal(result.status, 9);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /gh 2\.56\.0 is older than the minimum supported version 2\.57\.0/);
  assert.match(result.stderr, /auth status --active/);
  assert.match(result.stderr, /brew upgrade gh/);
});

test("compares gh versions numerically", async (t) => {
  const stub = (version) => `if [ "$1" = "--version" ]; then printf 'gh version ${version} (2024-01-01)\\n'; exit 0; fi; printf '%s\\n' '[]'`;
  for (const [version, status] of [["2.9.0", 9], ["2.56.9", 9], ["2.57.0", 0], ["2.100.0", 0], ["3.0.0", 0]]) {
    const directory = await fixture(t, { git: githubRemote });
    await mockExecutable(directory, "gh", stub(version));
    assert.equal(invoke(directory, ["--provider", "github", "label", "list"]).status, status, version);
  }
});

test("SC_SKIP_VERSION_CHECK=1 bypasses the check with a single warning line", async (t) => {
  const { directory, log } = await versionFixture(t, teaVersion("0.14.1"));
  const result = invoke(directory, ["--provider", "forgejo", "--repo", "owner/project", "label", "create", "--name", "status/committed"], { SC_SKIP_VERSION_CHECK: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).success, true);
  const warnings = result.stderr.trim().split("\n");
  assert.equal(warnings.length, 1, "one warning per tool per invocation");
  assert.match(warnings[0], /^sc: warning: SC_SKIP_VERSION_CHECK=1 set; not verifying that tea is at least 0\.15\.0$/);
  assert.doesNotMatch(await readFile(log, "utf8"), /--version/, "the tool is not probed when the check is skipped");
});

test("SC_SKIP_VERSION_CHECK does not mask a missing tool", async (t) => {
  const directory = await fixture(t, { git: forgejoRemote });
  const result = invoke(directory, labelList, { PATH: directory, SC_SKIP_VERSION_CHECK: "1" });
  assert.equal(result.status, 5);
});

test("verifies each tool once per invocation, before the first native call", async (t) => {
  const { directory, log } = await versionFixture(t, teaVersion("0.15.1"));
  const result = invoke(directory, ["--provider", "forgejo", "--repo", "owner/project", "label", "create", "--name", "status/committed"]);
  assert.equal(result.status, 0, result.stderr);
  const calls = (await readFile(log, "utf8")).trim().split("\n");
  assert.equal(calls[0], "--version");
  assert.equal(calls.filter((call) => call === "--version").length, 1);
  assert.ok(calls.length > 2, "create plus verification listing ran after a single check");
});

test("a failed check makes no native calls beyond the version probe", async (t) => {
  const { directory, log } = await versionFixture(t, teaVersion("0.14.1"));
  invoke(directory, labelList);
  assert.equal((await readFile(log, "utf8")).trim(), "--version");
});

test("provider, capabilities, and auth status report tool, version, and minimum", async (t) => {
  const { directory } = await versionFixture(t, teaVersion("0.14.1"));
  await mockExecutable(directory, "tea", `
if [ "$1" = "--version" ]; then ${teaVersion("0.14.1")}; exit 0; fi
if [ "$1" = "whoami" ]; then exit 0; fi
exit 99`);
  const args = ["--provider", "forgejo", "--repo", "owner/project"];
  const expected = { tool: "tea", version: "0.14.1", minimum: "0.15.0", supported: false };

  const provider = invoke(directory, [...args, "provider"]);
  assert.equal(provider.status, 0, "diagnostics report an old tool instead of failing");
  assert.deepEqual(JSON.parse(provider.stdout).tool, expected);
  assert.equal(provider.stderr, "");

  const capabilities = invoke(directory, [...args, "capabilities"]);
  assert.equal(capabilities.status, 0, capabilities.stderr);
  assert.deepEqual(JSON.parse(capabilities.stdout).tool, expected);

  const old = invoke(directory, [...args, "auth", "status"]);
  assert.equal(old.status, 9, "auth status is a native call and enforces the minimum");

  const current = await versionFixture(t, teaVersion("0.15.1"));
  await mockExecutable(current.directory, "tea", `
if [ "$1" = "--version" ]; then ${teaVersion("0.15.1")}; exit 0; fi
if [ "$1" = "whoami" ]; then exit 0; fi
exit 99`);
  const auth = invoke(current.directory, [...args, "auth", "status"]);
  assert.equal(auth.status, 0, auth.stderr);
  assert.deepEqual(JSON.parse(auth.stdout).tool, { tool: "tea", version: "0.15.1", minimum: "0.15.0", supported: true });
});

test("provider reports a null version when the tool is absent", async (t) => {
  const directory = await fixture(t, { git: githubRemote });
  const result = invoke(directory, ["provider"], { PATH: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).tool, { tool: "gh", version: null, minimum: "2.57.0", supported: null });
});
