import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";

const implementation = "skills/thin-slice/thin-slice-implement/SKILL.md";

function comparisonForm(raw, platform, canonicalExisting = (value) => value) {
  const runtime = platform === "win32" ? path.win32 : path.posix;
  const separators = platform === "win32" ? /\//g : /\/{2,}/g;
  const normalized = raw.replace(separators, runtime.sep);
  const canonical = canonicalExisting(runtime.normalize(normalized));
  const result = runtime.normalize(canonical);
  const root = runtime.parse(result).root;
  let withoutTrailingSeparators = result;
  while (withoutTrailingSeparators !== root && withoutTrailingSeparators.endsWith(runtime.sep)) {
    withoutTrailingSeparators = withoutTrailingSeparators.slice(0, -runtime.sep.length);
  }
  return platform === "win32" ? withoutTrailingSeparators.toLowerCase() : withoutTrailingSeparators;
}

function contained(primary, candidate, platform) {
  const runtime = platform === "win32" ? path.win32 : path.posix;
  const relative = runtime.relative(primary, candidate);
  return relative === "" || (!runtime.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${runtime.sep}`));
}

test("implementation documents runtime-native canonicalization and safe containment", async () => {
  const text = await readFile(implementation, "utf8");
  for (const requirement of [
    "Cross-platform path contract",
    "path.posix` or `path.win32",
    "never\nsplit on `/`",
    "canonicalize the\nexisting portion with `realpath`",
    "Drive-relative paths",
    "UNC paths",
    "case-insensitive rules",
    "relative`\noperation",
    "symlinked paths",
    "do not fall\nback to POSIX semantics",
  ]) assert.ok(text.includes(requirement), `missing cross-platform path rule: ${requirement}`);
});

test("POSIX simulations preserve case and reject traversal, symlinks, and separators", () => {
  const primary = comparisonForm("/repo", "posix");
  assert.equal(comparisonForm("/repo/./worktrees/agents/96/", "posix"), "/repo/worktrees/agents/96");
  assert.equal(comparisonForm("/repo-link/worktrees", "posix", (value) => value.replace("/repo-link", "/repo")), "/repo/worktrees");
  assert.ok(contained(primary, comparisonForm("/repo/worktrees", "posix"), "posix"));
  assert.ok(!contained(primary, comparisonForm("/repository", "posix"), "posix"));
  assert.ok(!contained(primary, comparisonForm("/repo/../outside", "posix"), "posix"));
  assert.notEqual(comparisonForm("/Repo/worktrees", "posix"), comparisonForm("/repo/worktrees", "posix"));
});

test("Windows simulations normalize separators, roots, UNC paths, and case", () => {
  const primary = comparisonForm("C:\\Repo\\", "win32");
  assert.equal(primary, "c:\\repo");
  assert.equal(comparisonForm("c:/repo/worktrees/agents/96/", "win32"), "c:\\repo\\worktrees\\agents\\96");
  assert.equal(comparisonForm("C:\\REPO\\worktrees", "win32"), comparisonForm("c:/repo/worktrees", "win32"));
  assert.equal(comparisonForm("\\\\server\\share\\repo\\..\\worktrees", "win32"), "\\\\server\\share\\worktrees");
  assert.ok(contained(primary, comparisonForm("c:/repo/worktrees", "win32"), "win32"));
  assert.ok(!contained(primary, comparisonForm("c:/repository", "win32"), "win32"));
  assert.ok(!contained(primary, comparisonForm("c:/repo/../outside", "win32"), "win32"));
  assert.ok(!path.win32.isAbsolute("C:worktree"), "drive-relative paths must not be accepted as absolute targets");
});
