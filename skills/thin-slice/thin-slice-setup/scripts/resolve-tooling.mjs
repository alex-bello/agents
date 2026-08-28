#!/usr/bin/env node

import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function fail(message) {
  process.stderr.write(`thin-slice-setup: ${message}\n`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`${name} is required`);
  return process.argv[index + 1];
}

function contains(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function quoted(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function packageCommand(tool, targetRepository, mode) {
  if (mode === "global") return `node ${quoted(tool)}`;
  if (!contains(targetRepository, tool)) fail(`local tooling resolved outside target repository: ${tool}`);
  const relative = path.relative(targetRepository, tool).split(path.sep).join("/");
  return `node ${quoted(`./${relative}`)}`;
}

const requestedTarget = argument("--target-repository");
if (!path.isAbsolute(requestedTarget)) fail("--target-repository must be an absolute path");
if (!existsSync(requestedTarget) || !statSync(requestedTarget).isDirectory()) {
  fail(`target repository is not a directory: ${requestedTarget}`);
}

const targetRepository = realpathSync(requestedTarget);
const skillDirectory = realpathSync(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const installedRoot = path.dirname(skillDirectory);
const groupedSkillsRoot = path.dirname(installedRoot);
const candidates = [
  {
    layout: "installed",
    sc: path.join(installedRoot, "source-control", "scripts", "sc"),
    validator: path.join(installedRoot, "thin-slice", "scripts", "validate-config.mjs"),
  },
  {
    layout: "grouped-source",
    sc: path.join(groupedSkillsRoot, "source-control", "scripts", "sc"),
    validator: path.join(installedRoot, "thin-slice", "scripts", "validate-config.mjs"),
  },
];
const matches = candidates.filter(({ sc, validator }) => existsSync(sc) && existsSync(validator));
if (matches.length !== 1) {
  const attempted = candidates.map(({ layout, sc, validator }) => `${layout}: sc=${sc}, validator=${validator}`).join("; ");
  fail(`could not resolve source-control and thin-slice validation tooling from the active skill installation; matches=${matches.length}; attempted ${attempted}`);
}

const selected = matches[0];
const sc = realpathSync(selected.sc);
const validator = realpathSync(selected.validator);
const mode = contains(targetRepository, skillDirectory) ? "local" : "global";

process.stdout.write(`${JSON.stringify({
  mode,
  layout: selected.layout,
  skillDirectory,
  targetRepository,
  scripts: {
    sc: packageCommand(sc, targetRepository, mode),
    "thin-slice:validate-config": packageCommand(validator, targetRepository, mode),
  },
  paths: { sc, validator },
})}\n`);
