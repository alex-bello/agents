import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wayfinder validates setup before refinement and issue creation", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-wayfinder/SKILL.md", "utf8");
  for (const requirement of [
    "## 0. Validate setup before refinement",
    "pnpm run thin-slice:validate-config -- .thin-slice.yml",
    "hard gate",
    "stop before discovery",
    "schema-incompatible",
    "actionable setup guidance",
    "absent or ambiguous",
  ]) assert.ok(text.includes(requirement), `missing setup guarantee: ${requirement}`);
});

test("wayfinder resolves configured tracker labels and keeps confirmation", async () => {
  const text = await readFile("skills/thin-slice/thin-slice-wayfinder/SKILL.md", "utf8");
  for (const requirement of [
    "thin-slice-tracker",
    "thin-slice-wayfinder",
    "labels.mappings",
    "resolved provider labels",
    "explicit confirmation",
    "Use existing labels only",
  ]) assert.ok(text.includes(requirement), `missing label guarantee: ${requirement}`);
});
