import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = "skills/thin-slice/thin-slice-audit/SKILL.md";

test("audit reports every lifecycle relationship with actionable evidence", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "read-only",
    "source-control",
    "Git for local repository inspection",
    "source tracker → implementation issue → implementation branch → commits → pull request",
    "one finding per broken relationship",
    "concrete repair action",
    "Classify each finding as `missing`, `invalid`, `mismatched`, `duplicate`, or",
    "merged PR",
  ]) assert.ok(text.includes(requirement), `missing audit requirement: ${requirement}`);
});

test("audit output is deterministic and does not mutate lifecycle records", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "Sort findings by issue number",
    "0 findings",
    "no records found",
    "do not add labels, comments, issues",
    "Unverifiable checks",
    "Healthy chains",
  ]) assert.ok(text.includes(requirement), `missing audit safety/output rule: ${requirement}`);
});

test("audit runs a blocking validation preflight before lifecycle discovery", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "### Validation preflight",
    "configured `validate` script",
    "before provider record discovery",
    "missing or malformed `validate` script",
    "non-zero command produces a `failure` blocking finding",
    "command execution is unavailable",
    "lifecycle discovery was not attempted",
    "must not edit package scripts or mutate issues",
    "Validation preflight:",
  ]) assert.ok(text.includes(requirement), `missing validation preflight guarantee: ${requirement}`);
});
