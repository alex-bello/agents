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

async function fixture(t, scripts) {
  const directory = await mkdtemp(path.join(tmpdir(), "source-control-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(scripts)) {
    await mockExecutable(directory, name, source);
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

test("detects GitHub from origin without calling gh", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
  });
  const result = invoke(directory, ["provider"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "github",
    operation: "provider",
    repository: "owner/project",
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

test("lists and creates Forgejo labels", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then printf '%s\\n' '[{"url":"https://forge.example"}]';
elif [ "$1 $2" = "labels list" ]; then printf '%s\\n' '[{"id":17,"name":"thin-slice","color":"2563EB","description":"Lifecycle work"}]';
elif [ "$1 $2" = "labels create" ]; then printf '%s\\n' 'created';
else exit 99; fi`,
  });
  const listed = invoke(directory, ["label", "list"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).items, [{ id: 17, name: "thin-slice", color: "2563EB", description: "Lifecycle work" }]);
  const created = invoke(directory, ["label", "create", "--name", "wayfinder", "--color", "7C3AED"]);
  assert.equal(created.status, 0, created.stderr);
  assert.deepEqual(JSON.parse(created.stdout), { provider: "forgejo", operation: "label.create", repository: "owner/project", name: "wayfinder", success: true, output: "created" });
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
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "git@github.com:owner/project.git"',
    gh: `
if [ "$*" = "issue edit 7 --add-label ready --add-label in-progress --remove-label blocked" ]; then
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
elif [ "$1 $2 $3 $4 $5 $6 $7" = "issues edit 9 --add-labels ready,in-progress --remove-labels blocked" ]; then
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
