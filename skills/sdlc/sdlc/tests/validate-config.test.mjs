import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const validator = path.resolve("skills/sdlc/sdlc/scripts/validate-config.mjs");
const config = path.resolve(".sdlc.yml");

test("validates the unified SDLC configuration", () => {
  const result = spawnSync(process.execPath, [validator, config], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Valid .*schema 1/);
});

test("requires generic state vocabulary and batch concurrency", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sdlc-config-"));
  const file = path.join(directory, ".sdlc.yml");
  const source = await readFile(config, "utf8");
  await writeFile(file, source.replace(/max_concurrency: 2/, "max_concurrency: 0").replace(/\"ready\":\"ready\",/, ""));
  const result = spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /labels\.vocabulary\.ready|labels\.mappings\.ready|max_concurrency/);
});
