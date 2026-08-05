import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const implementation = "skills/thin-slice/thin-slice-implement/SKILL.md";

test("implementation defines deterministic pull-request preparation", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
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
