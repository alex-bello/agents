import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tracker creation preserves the complete specification and provenance", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-wayfinder/SKILL.md", "utf8");
  for (const requirement of [
    "complete refined specification",
    "acceptance criteria",
    "exactly one issue",
    "configured tracker label",
    "sc issue create --body-file",
    "schema: 1",
    "kind: specification",
    "source: thin-slice-wayfinder",
    "status: refined",
  ]) assert.ok(text.includes(requirement), `missing tracker guarantee: ${requirement}`);
});

test("tracker creation handles failures without duplicate mutations", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-wayfinder/SKILL.md", "utf8");
  for (const requirement of [
    "single externally visible mutation",
    "do not retry through another interface",
    "replacement issue",
    "issue identifier and URL",
  ]) assert.ok(text.includes(requirement), `missing failure guarantee: ${requirement}`);
});
