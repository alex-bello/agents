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
