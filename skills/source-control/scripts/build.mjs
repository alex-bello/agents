#!/usr/bin/env node

import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.join(repositoryRoot, "skills/source-control/src/cli.ts");
const script = path.join(repositoryRoot, "skills/source-control/scripts/sc");
const binary = path.join(repositoryRoot, "dist/sc");

function build(args, cwd = repositoryRoot) {
  const result = spawnSync("bun", args, { cwd, stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`sc: could not run Bun: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(path.dirname(binary), { recursive: true });
build(["build", source, "--target=node", "--format=esm", `--outfile=${script}`, "--banner=#!/usr/bin/env node"]);
chmodSync(script, 0o755);
const compileDirectory = mkdtempSync(path.join(tmpdir(), "sc-bun-build-"));
try {
  build(["build", "--compile", source, `--outfile=${binary}`], compileDirectory);
  chmodSync(binary, 0o755);
} finally {
  rmSync(compileDirectory, { recursive: true, force: true });
}
