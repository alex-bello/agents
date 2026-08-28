import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("setup workflow documents confirmation, safety, and evidence gates", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "two separate\ndecisions",
    "current branch and default branch",
    "pnpm run sc -- label",
    "pnpm run thin-slice:validate-config",
    "pnpm run validate",
    "Commit only `.thin-slice.yml`",
    "pnpm run sc -- pr create",
    "default branch tip is unchanged",
    "no unapproved label was created",
  ]) assert.ok(text.includes(requirement), `missing setup guarantee: ${requirement}`);
});

test("setup inspection defines a stable report and missing-prerequisite states", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "### Inspection report",
    "provider: detected | unavailable",
    "authenticated: yes | no | unavailable",
    "default_branch: branch name or missing",
    "branch_pattern: detected pattern | missing",
    "test_command: command | missing",
    "formatter: command | missing",
    "ci: configuration paths/commands | missing",
    "blocking: actionable missing requirements",
    "advisory: non-blocking observations",
    "does not claim that\n  labels are missing",
    "does not install tools or\n  silently substitute commands",
  ]) assert.ok(text.includes(requirement), `missing inspection guarantee: ${requirement}`);
});

test("setup defines cwd-independent local and global path resolution", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "### Setup path-resolution contract",
    "runtime module URL or equivalent runtime-provided file location",
    "caller's `process.cwd()` is only the target repository",
    "local | global",
    "A local installation resolves to the repository-local skill installation",
    "A global installation resolves to the globally installed skill directory",
    "independently executable\nfrom the target repository root and from an unrelated working directory",
    "fail before proposing or writing\n   scripts",
    "stale after relocation, reinstall, or\nremoval of a global installation",
  ]) assert.ok(text.includes(requirement), `missing path-resolution contract: ${requirement}`);
});

test("setup specifies exact script diffs and pnpm verification evidence", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "exact old value (or",
    "exact new command",
    "sc:",
    "pnpm run sc -- provider",
    "new commands must be written only after explicit approval",
    "resolved skill directory, all three exact commands",
    "target repository, and the invocation context",
    "all three commands through `pnpm` from the target repository root and again from an unrelated working directory",
    "all six runs complete successfully",
    "exit status, and relevant output",
  ]) assert.ok(text.includes(requirement), `missing script verification guarantee: ${requirement}`);
});

test("setup evidence has normalized records and a six-run success gate", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "Record each run in normalized evidence",
    "skill_location: absolute installation directory",
    "target_repository: absolute repository directory",
    "script: sc | validate | thin-slice:validate-config",
    "working_directory: absolute invocation directory",
    "exit_status: numeric status",
    "result: success | failure",
    "all six records have",
    "setup result is `success` only",
    "setup result blocked",
  ]) assert.ok(text.includes(requirement), `missing evidence guarantee: ${requirement}`);
});
