import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sc = path.join(skillRoot, "scripts", "sc");

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

function invoke(directory, args) {
  return spawnSync(process.execPath, [sc, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
  });
}

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

test("uses structured Forgejo repository listing for repo view", async (t) => {
  const directory = await fixture(t, {
    git: 'printf "%s\\n" "ssh://git@forge.example/owner/project.git"',
    tea: `
if [ "$1" = "logins" ]; then
  printf '%s\\n' '[{"url":"https://forge.example"}]'
else
  printf '%s\\n' '[{"owner":"owner","name":"project","description":"Example","url":"https://forge.example/owner/project","type":"source"}]'
fi`,
  });
  const result = invoke(directory, ["repo", "view"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).item, {
    name: "owner/project",
    description: "Example",
    url: "https://forge.example/owner/project",
    visibility: "public",
    fork: false,
    defaultBranch: null,
  });
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
