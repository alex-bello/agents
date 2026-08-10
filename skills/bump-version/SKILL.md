---
name: bump-version
version: 1.0.0
description: Bump package.json's version before committing, to satisfy the pre-commit version-bump hook. Decides major/minor/patch from SemVer rules by reading the staged diff, and optionally produces an alpha/beta prerelease (with a counter or a commit-hash identifier). Use when preparing a commit, when a commit was rejected for not bumping the version, or when the user asks to bump/release/tag a version.
---

# bump-version

This repo's pre-commit hook (`lefthook.yml` → `scripts/check-version-bump.sh`)
**rejects any commit whose `package.json` "version" matches `HEAD`**. Every
commit must change the version. This skill picks the right bump and applies it
via its bundled `scripts/bump-version.mjs`, which does the (fiddly) SemVer
arithmetic.

## Workflow

1. **Decide the level** (`minor` / `patch`) unless the user already told you.
   Inspect what is staged:

   ```sh
   git diff --cached --stat
   git diff --cached
   ```

   **This project is pre-1.0** (currently `0.1.0`), so only `minor`, `patch`,
   and alpha/beta prereleases are in use until the first stable launch. There is
   no `major` bump — the bundled script's `major` command is intentionally
   rejected.

   Classify per SemVer 2.0.0, relative to the public API (exports in
   `src/index.ts`, the `bin` CLI, and documented behavior):

   - **minor** (`0.MINOR`) — new functionality **and breaking changes**. While
     pre-1.0 the `0.MINOR` slot is the breaking slot: a removed/renamed export,
     a changed signature, a removed CLI flag, etc. all go here.
   - **patch** (`0.x.PATCH`) — backwards-compatible fixes and non-API work: bug
     fixes, internal refactors, performance, tests, docs, build/chore changes.

   **Warn, don't auto-bump, on breaking changes.** If the staged diff contains a
   change that *would be* a major (breaking) bump in a 1.x project, **call it
   out to the user** — name the breaking change and why — rather than silently
   bumping. Then proceed with `minor` (the pre-1.0 breaking slot) once the user
   is aware, or pause if they want to reconsider. Cutting `1.0.0` is a
   deliberate human decision: if the user explicitly wants to launch stable,
   have them set the version manually instead of using this skill.

   When the change is ambiguous, state your reasoning and pick `minor` (safer
   for consumers), or ask the user.

2. **Apply the bump.** Run the script (it edits `package.json` in place):

   The script lives beside this `SKILL.md`, not in the target project. Resolve
   the skill directory from this file's location, then run it while the shell's
   working directory is the target project's root (so it updates that project's
   `package.json`):

   ```sh
   node <skill-directory>/scripts/bump-version.mjs <minor|patch> [--pre alpha|beta] [--hash[=N]]
   ```

   Add `--dry-run` first if you want to preview without writing.

3. **Stage it** so the commit includes the change:

   ```sh
   git add package.json
   ```

## Prereleases (alpha / beta)

Pass `--pre alpha` or `--pre beta` to make the result a SemVer prerelease, which
sorts **before** the stable release
(`0.2.0-alpha.0` < `0.2.0-beta.0` < `0.2.0`). Use alpha for early/unstable
previews, beta for feature-complete previews.

Behavior:
- From a **stable** release, `--pre` starts a new prerelease line by bumping the
  core per `<level>`: `0.1.0` + `minor --pre alpha` → `0.2.0-alpha.0`.
- While **already** on a prerelease, the core is kept and the tag iterates:
  - same stage → counter increments: `0.2.0-alpha.0` → `0.2.0-alpha.1`
  - new stage → resets: `0.2.0-alpha.3` + `--pre beta` → `0.2.0-beta.0`
  - the `<level>` argument is ignored while iterating an existing prerelease.
- **Finalize** a prerelease with a plain bump (no `--pre`): `0.2.0-beta.2` +
  `minor` → `0.2.0` (it drops the tag instead of skipping ahead to `0.3.0`).

## Commit-hash identifier (`--hash`)

`--hash` (requires `--pre`) uses a short commit hash as the prerelease
identifier instead of a counter: `0.2.0-alpha.0c114be`. `--hash=N` sets the
length (default 7, e.g. `--hash=10`).

**Important:** the hash is **HEAD's** short hash — the parent of the commit you
are about to make — because the new commit's own hash does not exist yet at
pre-commit time. Because each commit's HEAD differs, the version still changes
every commit (satisfying the hook), but hash-tagged prereleases are **not
guaranteed to sort in commit order**. Use the counter form (`--pre` without
`--hash`) when you need a clean, increasing prerelease sequence.

## Examples

| User intent | Command |
| --- | --- |
| Bug fix | `node <skill-directory>/scripts/bump-version.mjs patch` |
| New feature | `node <skill-directory>/scripts/bump-version.mjs minor` |
| Breaking change (pre-1.0) | warn the user, then `node <skill-directory>/scripts/bump-version.mjs minor` |
| Start a minor alpha | `node <skill-directory>/scripts/bump-version.mjs minor --pre alpha` |
| Next alpha iteration | `node <skill-directory>/scripts/bump-version.mjs minor --pre alpha` |
| Promote alpha → beta | `node <skill-directory>/scripts/bump-version.mjs minor --pre beta` |
| Beta tagged with commit hash | `node <skill-directory>/scripts/bump-version.mjs minor --pre beta --hash` |
| Ship the prerelease as stable | `node <skill-directory>/scripts/bump-version.mjs minor` |
