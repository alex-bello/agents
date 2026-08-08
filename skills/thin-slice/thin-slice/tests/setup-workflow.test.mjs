import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("setup workflow documents confirmation, safety, and evidence gates", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-setup/SKILL.md", "utf8");
  for (const requirement of [
    "two separate\ndecisions",
    "current branch and default branch",
    "sc label",
    "pnpm run thin-slice:validate-config",
    "pnpm run validate",
    "Commit only `.thin-slice.yml`",
    "sc pr create",
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
