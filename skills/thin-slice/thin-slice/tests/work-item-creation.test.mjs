import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = "skills/thin-slice/thin-slice/SKILL.md";

test("on-demand work-item creation validates configuration before selection", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "### On-demand child creation",
    "pnpm run thin-slice:validate-config -- .thin-slice.yml",
    "This is a hard gate",
    "stop before reading selections or creating issues",
    "configured implementation label",
    "never invent, silently substitute, or create a label",
  ]) assert.ok(text.includes(requirement), `missing configuration guarantee: ${requirement}`);
});

test("work-item creation supports precise item/group selection without implicit children", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "exact checklist item",
    "exact feature-group heading/slug",
    "Reject an absent or ambiguous item/group",
    "unchecked checklist items",
    "Do not create children for checked items",
    "require confirmation of that exact batch",
    "never an automatic consequence",
  ]) assert.ok(text.includes(requirement), `missing selection guarantee: ${requirement}`);
});

test("child issues preserve source context and acceptance criteria", async () => {
  const text = await readFile(skill, "utf8");
  for (const requirement of [
    "parent tracker number and URL",
    "feature-group name/slug",
    "complete source checklist item",
    "useful acceptance criteria tied to the source item",
    "standard\n`thin-slice-work-item` provenance block",
    "source-item-to-issue mapping",
  ]) assert.ok(text.includes(requirement), `missing child-content guarantee: ${requirement}`);
});
