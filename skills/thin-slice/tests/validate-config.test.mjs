import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const validator = path.resolve("skills/thin-slice/scripts/validate-config.mjs");
const valid = `schema: 1
labels:
  mode: mapped
  vocabulary: {}
  mappings: {}
branch:
  pattern: thin-slice/{issue-number}-{short-slug}
implementation:
  create_branch: true
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

test("reports missing, incompatible, and unknown configuration", async (t) => {
  const result = await run(t, "schema: 2\nbranch:\n  pattern: main\nextra: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema must be 1/);
  assert.match(result.stderr, /branch\.pattern must contain/);
  assert.match(result.stderr, /missing top-level section verification/);
  assert.match(result.stderr, /unknown top-level key extra/);
});
