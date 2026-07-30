#!/usr/bin/env node
// Compute and write the next package.json "version".
//
// Usage:
//   node <skill-directory>/scripts/bump-version.mjs <minor|patch> [options]
//
// Options:
//   --pre <alpha|beta>   Make the result a prerelease of that stage.
//   --hash[=N]           Use HEAD's short commit hash (N chars, default 7) as the
//                        prerelease identifier instead of an incrementing counter.
//                        Requires --pre.
//   --dry-run            Print "<old> -> <new>" and exit without writing.
//
// "major" is intentionally rejected while pre-1.0: breaking changes belong in
// the 0.MINOR slot until the first stable launch. A major request is surfaced
// as a warning so a human decides when to cut 1.0.0.
//
// Why HEAD's hash? At pre-commit time the *new* commit's hash does not exist yet
// (and would depend on the version we are about to write), so the only real
// commit hash available is HEAD — the parent of the commit you are creating.
//
// Version math mirrors the `semver` package's `inc()` semantics so that a plain
// bump correctly *finalizes* a prerelease (e.g. 1.2.0-alpha.3 + minor -> 1.2.0).

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// The script is installed with the skill, while the package being bumped is
// the project from which the skill is invoked.
const PKG = join(process.cwd(), "package.json");

// Official SemVer 2.0.0 validation regex (anchored).
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(msg) {
  console.error(`✖ bump-version: ${msg}`);
  process.exit(1);
}

// --- Parse args ------------------------------------------------------------
const args = process.argv.slice(2);
const level = args[0];
if (level === "major") {
  fail(
    "⚠ This change looks like a MAJOR (breaking) bump, but major is disabled " +
      "while pre-1.0.\n" +
      "  Until the first stable launch, put breaking changes in the 0.MINOR " +
      "slot (use `minor`),\n" +
      "  or have a human decide to cut 1.0.0 by setting the version manually.",
  );
}
if (!["minor", "patch"].includes(level)) {
  fail(
    "first argument must be one of: minor | patch\n" +
      "  e.g. node <skill-directory>/scripts/bump-version.mjs minor --pre alpha --hash",
  );
}

let pre;
let useHash = false;
let hashLen = 7;
let dryRun = false;

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--pre") {
    pre = args[++i];
  } else if (arg === "--hash") {
    useHash = true;
  } else if (arg.startsWith("--hash=")) {
    useHash = true;
    hashLen = Number(arg.slice("--hash=".length));
    if (!Number.isInteger(hashLen) || hashLen < 1 || hashLen > 40) {
      fail("--hash=N must be an integer between 1 and 40");
    }
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else {
    fail(`unknown argument: ${arg}`);
  }
}

if (pre !== undefined && !["alpha", "beta"].includes(pre)) {
  fail("--pre must be 'alpha' or 'beta'");
}
if (useHash && pre === undefined) {
  fail("--hash requires --pre (the hash is the prerelease identifier)");
}

// --- Version helpers -------------------------------------------------------
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    v.trim(),
  );
  if (!m) fail(`cannot parse current version: "${v}"`);
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".") : [],
  };
}

// Plain release bump with semver `inc` semantics: when the current version is a
// prerelease, the matching bump *finalizes* it rather than skipping ahead.
function releaseBump({ major, minor, patch, pre }) {
  if (level === "major") {
    if (minor !== 0 || patch !== 0 || pre.length === 0) major++;
    minor = 0;
    patch = 0;
  } else if (level === "minor") {
    if (patch !== 0 || pre.length === 0) minor++;
    patch = 0;
  } else {
    if (pre.length === 0) patch++;
  }
  return { major, minor, patch, pre: [] };
}

// Full bump used when *starting* a new prerelease line from a stable release.
function fullBump({ major, minor, patch }) {
  if (level === "major") return { major: major + 1, minor: 0, patch: 0 };
  if (level === "minor") return { major, minor: minor + 1, patch: 0 };
  return { major, minor, patch: patch + 1 };
}

// Increment the last numeric identifier in a prerelease list (alpha.0 -> alpha.1).
function incNumeric(ids) {
  const out = [...ids];
  for (let i = out.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(out[i])) {
      out[i] = String(Number(out[i]) + 1);
      return out;
    }
  }
  out.push("0");
  return out;
}

function shortHash(n) {
  try {
    return execSync(`git rev-parse --short=${n} HEAD`, {
      encoding: "utf8",
    }).trim();
  } catch {
    return fail("could not read HEAD short hash (is there at least one commit?)");
  }
}

function format({ major, minor, patch, pre }) {
  const base = `${major}.${minor}.${patch}`;
  return pre.length ? `${base}-${pre.join(".")}` : base;
}

// --- Compute next version --------------------------------------------------
const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const cur = parseVersion(pkg.version);
const inPre = cur.pre.length > 0;

let next;
if (pre === undefined) {
  // Plain release (also finalizes an in-progress prerelease).
  next = releaseBump(cur);
} else {
  // Prerelease mode. Already on a prerelease -> keep the same core and iterate;
  // otherwise start a fresh prerelease line by bumping the core.
  const core = inPre
    ? { major: cur.major, minor: cur.minor, patch: cur.patch }
    : fullBump(cur);

  let preIds;
  if (useHash) {
    preIds = [pre, shortHash(hashLen)];
  } else if (inPre && cur.pre[0] === pre) {
    preIds = incNumeric(cur.pre);
  } else {
    preIds = [pre, "0"];
  }
  next = { ...core, pre: preIds };
}

const nextStr = format(next);
if (!SEMVER.test(nextStr)) {
  fail(
    `computed version "${nextStr}" is not valid SemVer.\n` +
      "  (A pure-digit hash with a leading zero can cause this — try --hash=N " +
      "with a different length.)",
  );
}

if (dryRun) {
  console.log(`${pkg.version} -> ${nextStr}`);
  process.exit(0);
}

pkg.version = nextStr;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
console.log(`✔ version bumped: ${cur && format(cur)} -> ${nextStr}`);
