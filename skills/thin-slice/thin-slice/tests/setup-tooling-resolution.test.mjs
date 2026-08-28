import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const resolver = path.join(repositoryRoot, "skills", "thin-slice", "thin-slice-setup", "scripts", "resolve-tooling.mjs");

function invoke(script, targetRepository) {
  return spawnSync(process.execPath, [script, "--target-repository", targetRepository], { encoding: "utf8" });
}

test("resolves repository-local source tooling to relative package scripts", () => {
  const result = invoke(resolver, repositoryRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    mode: "local",
    layout: "grouped-source",
    skillDirectory: path.join(repositoryRoot, "skills", "thin-slice", "thin-slice-setup"),
    targetRepository: repositoryRoot,
    scripts: {
      sc: "node './skills/source-control/scripts/sc'",
      "thin-slice:validate-config": "node './skills/thin-slice/thin-slice/scripts/validate-config.mjs'",
    },
    paths: {
      sc: path.join(repositoryRoot, "skills", "source-control", "scripts", "sc"),
      validator: path.join(repositoryRoot, "skills", "thin-slice", "thin-slice", "scripts", "validate-config.mjs"),
    },
  });
});

test("resolves a global installed layout to absolute package scripts", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "thin-slice-setup-resolution-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillsRoot = path.join(root, "global", "skills");
  const setupScripts = path.join(skillsRoot, "thin-slice-setup", "scripts");
  const sc = path.join(skillsRoot, "source-control", "scripts", "sc");
  const validator = path.join(skillsRoot, "thin-slice", "scripts", "validate-config.mjs");
  const targetRepository = path.join(root, "project");
  await mkdir(setupScripts, { recursive: true });
  await mkdir(path.dirname(sc), { recursive: true });
  await mkdir(path.dirname(validator), { recursive: true });
  await mkdir(targetRepository, { recursive: true });
  const installedResolver = path.join(setupScripts, "resolve-tooling.mjs");
  await copyFile(resolver, installedResolver);
  await writeFile(sc, "#!/usr/bin/env node\n");
  await writeFile(validator, "");

  const result = invoke(installedResolver, targetRepository);
  assert.equal(result.status, 0, result.stderr);
  const canonicalSkillsRoot = await realpath(skillsRoot);
  const canonicalTargetRepository = await realpath(targetRepository);
  const canonicalSc = path.join(canonicalSkillsRoot, "source-control", "scripts", "sc");
  const canonicalValidator = path.join(canonicalSkillsRoot, "thin-slice", "scripts", "validate-config.mjs");
  assert.deepEqual(JSON.parse(result.stdout), {
    mode: "global",
    layout: "installed",
    skillDirectory: path.join(canonicalSkillsRoot, "thin-slice-setup"),
    targetRepository: canonicalTargetRepository,
    scripts: {
      sc: `node '${canonicalSc}'`,
      "thin-slice:validate-config": `node '${canonicalValidator}'`,
    },
    paths: { sc: canonicalSc, validator: canonicalValidator },
  });
});

test("fails when the active installation is incomplete", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "thin-slice-setup-incomplete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const setupScripts = path.join(root, "skills", "thin-slice-setup", "scripts");
  const targetRepository = path.join(root, "project");
  await mkdir(setupScripts, { recursive: true });
  await mkdir(targetRepository, { recursive: true });
  const installedResolver = path.join(setupScripts, "resolve-tooling.mjs");
  await copyFile(resolver, installedResolver);

  const result = invoke(installedResolver, targetRepository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not resolve source-control and thin-slice validation tooling/);
  assert.equal(result.stdout, "");
});
