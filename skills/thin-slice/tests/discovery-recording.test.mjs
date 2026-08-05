import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = "skills/thin-slice/thin-slice/SKILL.md";

test("discovery recording preserves originating tracker provenance", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "originating tracker issue",
    "source-tracker metadata",
    "feature-group slug",
    "source-item slug",
    "thin-slice-discovery",
    "source-tracker-url",
    "origin-issue",
    "status: awaiting-triage",
    "tracker group → discovery comment → child issue → branch/commits → pull request",
  ]) assert.ok(text.includes(requirement), `missing discovery provenance: ${requirement}`);
});

test("discovery recording avoids orphaned or duplicate lifecycle entries", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "stop and report the missing provenance",
    "exactly one comment",
    "shared contract cannot edit tracker bodies",
    "do not retry through another interface",
    "Never detach the discovery into an unrelated group",
  ]) assert.ok(text.includes(requirement), `missing discovery safety rule: ${requirement}`);
});
