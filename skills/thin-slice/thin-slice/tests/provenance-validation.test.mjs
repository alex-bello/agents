import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const planning = "skills/thin-slice/thin-slice/SKILL.md";
const implementation = "skills/thin-slice/thin-slice-implement/SKILL.md";

test("child creation defines a complete tracker-to-child provenance gate", async () => {
  const text = await readFile(planning, "utf8");
  for (const requirement of [
    "exactly one `thin-slice-work-item` block",
    "schema: 2",
    "source-tracker",
    "configured tracker label",
    "unchecked source checklist item",
    "wrong-kind",
    "unknown-group",
    "unknown-item",
    "actionable diagnostic",
  ]) assert.ok(text.includes(requirement), `missing provenance rule: ${requirement}`);
});

test("implementation rejects invalid provenance before downstream work", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "Before inspecting implementation files",
    "branching, lifecycle mutation, or code changes",
    "missing, duplicate, malformed",
    "closed or non-tracker parents",
    "Source tracker",
    "Source item",
    "Do not add lifecycle labels, create a branch, or run implementation work",
  ]) assert.ok(text.includes(requirement), `missing implementation gate: ${requirement}`);
});

test("provenance diagnostics identify observed values and corrections", async () => {
  const text = await readFile(implementation, "utf8");
  assert.match(text, /observed .*expected/);
  assert.match(text, /positive integer tracker issue[\s\n]+number/);
  assert.match(text, /unchecked checklist item/);
});

test("implementation defines the validated branch workflow", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "pnpm run thin-slice:validate-config",
    "Before inspecting implementation files",
    "{issue-number}",
    "{short-slug}",
    "lowercase, non-alphanumeric runs become one hyphen",
    "valid Git ref",
    "current `HEAD`",
    "Verify the resulting branch name",
  ]) assert.ok(text.includes(requirement), `missing branch workflow rule: ${requirement}`);
});

test("implementation validates commit references before delivery", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "implementation.commit_reference_required",
    "commit subject or body",
    "#<selected-issue-number>",
    "short SHA",
    "observed subject",
    "If the setting is false",
  ]) assert.ok(text.includes(requirement), `missing commit-reference rule: ${requirement}`);
  assert.match(text, /every\s+implementation commit/);
  assert.match(text, /Stop before creating a commit or\s+pull request/);
  assert.match(text, /one actionable diagnostic\s+per offending commit/);
});
