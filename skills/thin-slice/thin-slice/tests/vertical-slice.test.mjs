import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  planning: "skills/thin-slice/thin-slice/SKILL.md",
  wayfinder: "skills/thin-slice/thin-slice-wayfinder/SKILL.md",
  implementation: "skills/thin-slice/thin-slice-implement/SKILL.md",
  audit: "skills/thin-slice/thin-slice-audit/SKILL.md",
};

test("planning defines a vertical-slice quality gate and layer-only exception", async () => {
  const text = await readFile(files.planning, "utf8");
  for (const requirement of [
    "### Vertical-slice quality gate",
    "one specific user or operator can take an action and observe",
    "Complete path",
    "Real boundary",
    "end-to-end acceptance check",
    "Reject layer-only work",
    "delivery: enabling",
    "seven or eight items",
  ]) assert.ok(text.includes(requirement), `missing vertical-slice rule: ${requirement}`);
});

test("planning keeps coupled technical layers in one child contract", async () => {
  const text = await readFile(files.planning, "utf8");
  for (const requirement of [
    "technical\nsubtasks that cannot stand alone as a behavior",
    "required schema, persistence, API, UI, and tests in",
    "## Vertical slice contract",
    "User outcome:",
    "Complete path:",
    "Delivery: `product-slice`",
  ]) assert.ok(text.includes(requirement), `missing child contract rule: ${requirement}`);
});

test("wayfinder and implementation enforce vertical slices", async () => {
  const wayfinder = await readFile(files.wayfinder, "utf8");
  const implementation = await readFile(files.implementation, "utf8");
  for (const requirement of [
    "Every normal item is a thin vertical slice",
    "Do not turn one behavior into separate table",
    "seven or eight items to deliver one small behavior",
  ]) assert.ok(wayfinder.includes(requirement), `missing Wayfinder rule: ${requirement}`);
  for (const requirement of [
    "vertical slice contract naming one user outcome",
    "do not implement a layer-only issue",
    "complete path to the observable boundary",
    "Verify at the user or operator boundary",
    "Layer-only or non-demonstrable scope",
  ]) assert.ok(implementation.includes(requirement), `missing implementation rule: ${requirement}`);
});

test("audit detects layer-only work as a slicing-quality finding", async () => {
  const text = await readFile(files.audit, "utf8");
  for (const requirement of [
    "slicing quality is coherent",
    "user-visible outcome",
    "complete path through the relevant layers",
    "Flag layer-only work",
    "as `invalid`",
  ]) assert.ok(text.includes(requirement), `missing audit rule: ${requirement}`);
});
