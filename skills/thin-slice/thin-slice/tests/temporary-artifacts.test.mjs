import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "skills/thin-slice/thin-slice/SKILL.md",
  "skills/thin-slice/thin-slice-wayfinder/SKILL.md",
  "skills/thin-slice/thin-slice-implement/SKILL.md",
];

async function workflowText() {
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

test("temporary bodies use unique managed directories and are inspectable", async () => {
  const text = await workflowText();
  for (const requirement of [
    "managed temporary directory",
    "unique",
    "outside the repository",
    "inspect the exact",
    "Before",
    "mkdtemp",
  ]) assert.ok(text.includes(requirement), `missing artifact rule: ${requirement}`);
});

test("success, interruption, collision, staging, and secret safety are explicit", async () => {
  const text = await workflowText();
  for (const requirement of [
    "After a successful provider operation, remove",
    "If the process is interrupted",
    "uniquely named",
    "never stage",
    "git status --short",
    "no credentials",
    "tokens",
    "keys",
    "cleanup failure",
  ]) assert.ok(text.includes(requirement), `missing focused artifact guarantee: ${requirement}`);
});
