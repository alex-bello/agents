import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const implementation = "skills/thin-slice/thin-slice-implement/SKILL.md";
const framework = "skills/thin-slice/README.md";

test("discovery-only work defines concrete documentation deliverables", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "delivery: discovery-only",
    "source or capability inventory",
    "workflow map",
    "authorization or permission",
    "application code is absent",
    "follow-up thin-slice items",
  ]) assert.ok(text.toLowerCase().includes(requirement.toLowerCase()), `missing discovery-only rule: ${requirement}`);
});

test("discovery-only acceptance separates documentation from code evidence", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "Documentation acceptance",
    "Code-test acceptance",
    "not required when the contract explicitly says",
    "document absent application code",
    "actionable",
    "thin-slice-needs-discovery",
  ]) assert.ok(text.includes(requirement), `missing evidence distinction: ${requirement}`);
});

test("framework guidance makes the discovery-only result actionable", async () => {
  const text = await readFile(framework, "utf8");
  assert.match(text, /concrete deliverable/);
  assert.match(text, /Documentation acceptance[\s\S]*code-test acceptance/);
  assert.match(text, /next slices are concrete/);
});
