import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupSkill = "skills/thin-slice/thin-slice-setup/SKILL.md";
const auditSkill = "skills/thin-slice/thin-slice-audit/SKILL.md";

test("validation fixtures distinguish local and global skill installations", async () => {
  const text = await readFile(setupSkill, "utf8");

  for (const requirement of [
    "This contract covers both supported layouts:",
    "A local installation resolves to the repository-local skill installation",
    "A global installation resolves to the globally installed skill directory",
    "it must not fall back to a\n  repository-local path",
    "runtime module URL or equivalent runtime-provided file location",
    "resolved skill directory",
  ]) {
    assert.ok(text.includes(requirement), `missing installation-path fixture guarantee: ${requirement}`);
  }
});

test("validation fixtures require execution from an external working directory", async () => {
  const text = await readFile(setupSkill, "utf8");

  for (const requirement of [
    "target repository root and from an unrelated working directory",
    "both commands through `pnpm` from the target repository root and again from an unrelated working directory",
    "working_directory: absolute invocation directory",
    "caller\'s `process.cwd()` is only the target repository",
  ]) {
    assert.ok(text.includes(requirement), `missing external-working-directory coverage: ${requirement}`);
  }
});

test("validation fixtures cover missing and non-zero validator failures", async () => {
  const text = await readFile(auditSkill, "utf8");

  for (const requirement of [
    "A missing or malformed `validate` script produces a `missing` or `invalid`",
    "A non-zero command produces a `failure` blocking finding",
    "command, exit status, output, and repair guidance",
    "lifecycle discovery was not attempted",
    "The preflight is read-only. It must not edit package scripts or mutate issues,",
  ]) {
    assert.ok(text.includes(requirement), `missing validator-failure coverage: ${requirement}`);
  }
});
