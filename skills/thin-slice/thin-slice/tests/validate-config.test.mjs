import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const validator = path.resolve("skills/thin-slice/thin-slice/scripts/validate-config.mjs");
const valid = `schema: 1
labels:
  mode: mapped
  vocabulary: {}
  mappings: {}
branch:
  pattern: thin-slice/{issue-number}-{short-slug}
implementation:
  create_branch: true
  use_worktree: false
  commit_reference_required: true
  ready_label: thin-slice-ready
  in_progress_label: thin-slice-in-progress
  implemented_label: thin-slice-implemented
  blocked_label: thin-slice-blocked
  needs_discovery_label: thin-slice-needs-discovery
  automatic_lifecycle: false
pull_request:
  creation: ask
  close_work_item_on_merge: false
verification:
  require_tests: true
  require_acceptance_checks: true
  require_manual_evidence_when_relevant: true
  reject_unrelated_changes: false
`;

async function run(t, text) {
  const dir = await mkdtemp(path.join(tmpdir(), "thin-slice-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".thin-slice.yml"); await writeFile(file, text);
  return spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
}

test("accepts the schema-1 setup configuration", async (t) => {
  const result = await run(t, valid); assert.equal(result.status, 0, result.stderr);
});

test("accepts an optional configured default branch", async (t) => {
  const result = await run(t, valid.replace("branch:\n  pattern:", "branch:\n  default: trunk\n  pattern:"));
  assert.equal(result.status, 0, result.stderr);
});

test("accepts explicitly enabled worktree mode", async (t) => {
  const result = await run(t, valid.replace("  use_worktree: false\n", "  use_worktree: true\n"));
  assert.equal(result.status, 0, result.stderr);
});

test("accepts older configurations without the optional worktree setting", async (t) => {
  const result = await run(t, valid.replace("  use_worktree: false\n", ""));
  assert.equal(result.status, 0, result.stderr);
});

test("accepts relative and absolute worktree roots", async (t) => {
  for (const root of [".worktrees", "/tmp/thin-slice-worktrees"]) {
    const result = await run(t, valid.replace("  use_worktree: false\n", `  use_worktree: true\n  worktree_root: ${root}\n`));
    assert.equal(result.status, 0, `${root}: ${result.stderr}`);
  }
});

test("rejects invalid and empty worktree roots", async (t) => {
  for (const root of ["true", "[]", ""]) {
    const line = root === "" ? "  worktree_root: \"\"\n" : `  worktree_root: ${root}\n`;
    const result = await run(t, valid.replace("  use_worktree: false\n", line));
    assert.notEqual(result.status, 0);
    if (root === "") assert.match(result.stderr, /implementation\.worktree_root must not be empty/);
    else assert.match(result.stderr, /implementation\.worktree_root must be string/);
  }
});

test("reports missing, incompatible, and unknown configuration", async (t) => {
  const result = await run(t, "schema: 2\nbranch:\n  pattern: main\nextra: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema must be 1/);
  assert.match(result.stderr, /branch\.pattern must contain/);
  assert.match(result.stderr, /missing top-level section verification/);
  assert.match(result.stderr, /unknown top-level key extra/);
});

test("rejects malformed structure and unknown nested keys", async (t) => {
  const result = await run(t, `schema: 1
labels: mapped
branch:
    pattern: thin-slice/{issue-number}-{short-slug}
implementation:
  create_branch: yes
  use_worktree: maybe
  commit_reference_required: true
  ready_label: ready
  in_progress_label: progress
  implemented_label: done
  blocked_label: blocked
  needs_discovery_label: discovery
  automatic_lifecycle: false
pull_request:
  creation: ask
  close_work_item_on_merge: false
verification:
  require_tests: true
  require_acceptance_checks: true
  require_manual_evidence_when_relevant: true
  reject_unrelated_changes: false
`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /labels must be a mapping/);
  assert.match(result.stderr, /nested keys must be indented by two spaces/);
  assert.match(result.stderr, /implementation\.create_branch must be boolean/);
  assert.match(result.stderr, /implementation\.use_worktree must be boolean/);
});

test("reports a missing configuration file clearly", () => {
  const result = spawnSync(process.execPath, [validator, "/tmp/no-such-thin-slice-config.yml"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot read configuration/);
  assert.match(result.stderr, /thin-slice-setup/);
});

test("migrates a valid configuration through the current schema", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "thin-slice-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".thin-slice.yml");
  await writeFile(file, valid.trimEnd());
  const result = spawnSync(process.execPath, [validator, "--migrate", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migrated .* to schema 1/);
  assert.equal((await readFile(file, "utf8")).endsWith("\n"), true);
});
