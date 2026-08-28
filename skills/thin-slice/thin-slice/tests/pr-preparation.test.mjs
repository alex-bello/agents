import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const implementation = "skills/thin-slice/thin-slice-implement/SKILL.md";

test("implementation defines deterministic pull-request preparation", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "exact precedence: (1)",
    "defaultBranch",
    "git symbolic-ref --short refs/remotes/<remote>/HEAD",
    "branch.default",
    "explicit ambiguity failure",
    "never guess `main` or `master`",
    "stop before push or PR creation",
    "detected default branch as `base`",
    "checked-out",
    "current",
    "suffixing `(#<issue-number>)`",
    "source tracker references",
    "acceptance criteria and their status",
    "verification commands and results",
    "temporary\n    file",
    "normalized PR number and URL",
  ]) assert.ok(text.includes(requirement), `missing PR preparation rule: ${requirement}`);
});

test("implementation covers every default-branch resolution path", async () => {
  const text = await readFile(implementation, "utf8");
  assert.match(text, /provider metadata/i);
  assert.match(text, /local remote/i);
  assert.match(text, /configured/i);
  assert.match(text, /ambiguity/i);
  assert.match(text, /no single candidate remains[\s\S]*stop before push or PR creation/i);
});

test("implementation applies every configured PR creation mode", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "`never` prepares and reports",
    "`ask` presents the complete",
    "explicit confirmation immediately before",
    "`automatic`",
    "unknown value as a configuration error",
    "configured pull-request label",
  ]) assert.ok(text.includes(requirement), `missing PR creation rule: ${requirement}`);
});

test("implementation generates traceability and verification checklist entries", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "implementation issue as `#<issue-number>`",
    "source tracker as `#<source-tracker>`",
    "`- [x] Tests: ...` or `- [ ] Tests: ...`",
    "`- [x] Acceptance: ...` or `- [ ] Acceptance: ...`",
    "`- [x] Manual evidence: ...` or `- [ ] Manual evidence: ...`",
    "Preserve the issue's acceptance-criterion order",
    "Mark an entry checked only",
    "missing checklist entry",
  ]) assert.ok(text.includes(requirement), `missing checklist rule: ${requirement}`);
});

test("implementation defines configurable post-merge work-item lifecycle", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "Post-merge lifecycle",
    "normalized PR state as authoritative",
    "close_work_item_on_merge",
    "If the PR is merged",
    "do not close the implementation issue",
    "closed without merging",
    "Never treat a closed, unmerged PR as a successful",
    "This reconciliation is idempotent",
  ]) assert.ok(text.includes(requirement), `missing post-merge lifecycle rule: ${requirement}`);
});

test("implementation defines opt-in worktree creation and safe merged-PR cleanup", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "implementation.use_worktree",
    "defaults to `false`",
    "dedicated Git worktree",
    "leave the current checkout on\n   its existing branch",
    "deterministic path outside the repository",
    "git worktree add",
    "registered worktree path and branch name",
    "run all implementation, verification, diff, and commit commands",
    "git worktree remove <path>",
    "confirms `merged`",
    "Check `git status --short`",
    "Never remove the primary checkout",
    "delete the\nbranch as part of this cleanup",
    "or use `--force`",
    "worktree is dirty",
    "An open,\nclosed-unmerged",
  ]) assert.ok(text.includes(requirement), `missing worktree rule: ${requirement}`);
});

test("implementation defines configurable worktree-root safety", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "implementation.worktree_root",
    "relative to the canonical primary repository root",
    "never the caller's current working directory",
    "<repository-parent>/.thin-slice-worktrees",
    "configured root",
    "canonical resolved root",
    "roots that resolve inside the primary repository",
    "roots that cannot be created safely",
    "unrelated directories",
    "registered-worktree collisions",
  ]) assert.ok(text.includes(requirement), `missing configurable-root rule: ${requirement}`);
});
