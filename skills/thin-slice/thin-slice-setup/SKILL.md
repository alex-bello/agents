---
name: thin-slice-setup
version: 1.3.0
description: Inspect a repository and prepare its thin-slice lifecycle configuration, label plan, setup branch, and pull request after explicit confirmation.
---

# Thin-Slice Setup

Initialize the repository foundation required by the thin-slice lifecycle.
Do not install dependencies, enable CI, modify the default branch, or create
labels without explicit confirmation.

## Inspect

1. Read `AGENTS.md`, `README.md`, and repository-local instructions.
2. Resolve the active setup tooling with `scripts/resolve-tooling.mjs` as
   specified below. Check for `.thin-slice.yml`; if present, validate it with
   the resolved validator.
3. Use the resolved source-control wrapper for `provider`, `auth status`,
   `repo view`, `label list`, and `capabilities`.
4. Detect the default branch, existing branch conventions, package manager,
   package/project scripts, test command, formatter, and CI configuration from
   the repository. In package-based repositories, verify that `package.json`
   exposes `sc`, `validate`, and `thin-slice:validate-config`, recording the
   commands they run. Report anything missing; do not infer that a missing
   tool should be installed.

### Setup path-resolution contract

When setup generates repository scripts, it must resolve the installation
containing the currently executing `thin-slice-setup` skill before reading or
writing any repository file.
The caller's `process.cwd()` is only the target repository supplied by the
setup operation; it is never used to locate the skill, its validator, or
another installed skill.

Run the `scripts/resolve-tooling.mjs` beside the active `SKILL.md`, passing the
absolute target repository:

```sh
node /active/thin-slice-setup/scripts/resolve-tooling.mjs \
  --target-repository /absolute/target-repository
```

The helper returns normalized JSON containing `mode: local | global`, the
detected source or installed layout, the active skill directory, absolute tool
paths, and exact package-script values for `sc` and
`thin-slice:validate-config`. Record that JSON as setup evidence.

Resolve the active skill location with this precedence:

1. Use the runtime module URL or equivalent runtime-provided file location for
   the executing skill.
2. Classify the run as local only when that active skill directory is inside
   the target repository. Otherwise classify it as global.
3. Resolve both the sibling `source-control/scripts/sc` wrapper and
   `thin-slice/scripts/validate-config.mjs` validator. Support the grouped
   repository source layout and the flat installed-skills layout.
4. If the runtime location is unavailable, neither layout is complete, or
   multiple layouts match, fail before proposing or writing
   scripts. Report every attempted wrapper and validator path and the command
   to rerun setup after restoring a usable installation.

This contract covers both supported layouts:

- A local installation resolves to the repository-local skill installation
  directory and generates repository-relative commands targeting that
  directory.
- A global installation resolves to the globally installed skill directory and
  generates absolute commands targeting that directory; it must not fall back
  to a repository-local path.

The generated commands must be deterministic and independently executable
from the target repository root and from an unrelated working directory. The
`sc` entry must invoke the resolved source-control wrapper. The
`thin-slice:validate-config` entry must invoke the resolved validator. The
repository's `validate` entry remains its complete project-specific validation
command; never point it at a nonexistent shared skill validator. Preserve
unrelated `package.json` scripts and record every exact resolved path in setup
evidence. Use the configured package manager to run the generated commands;
do not derive command targets from the caller's current directory.

Verification requires that all three commands through `pnpm` from the target repository root and again from an unrelated working directory are recorded.
Use these command shapes, substituting the absolute target repository and
configuration paths for the unrelated-directory runs:

```sh
pnpm run sc -- provider
pnpm run validate
pnpm run thin-slice:validate-config -- .thin-slice.yml

pnpm --dir /absolute/target-repository run sc -- provider
pnpm --dir /absolute/target-repository run validate
pnpm --dir /absolute/target-repository run thin-slice:validate-config -- \
  /absolute/target-repository/.thin-slice.yml
```

For each generated entry, setup must show a before/after record before asking
for approval. The record includes the script name, the exact old value (or
`<missing>`), and the exact new command, for example:

```text
sc:
  old: <missing>
  new: node './skills/source-control/scripts/sc'
validate:
  old: <missing>
  new: pnpm test
thin-slice:validate-config:
  old: node skills/thin-slice/thin-slice/scripts/validate-config.mjs
  new: node './skills/thin-slice/thin-slice/scripts/validate-config.mjs'
```

For a global run, the helper returns the same `node '<path>'` commands with
absolute paths under the active global skill folder. Do not copy local example
paths into a global setup or global paths into a local setup.

The new commands must be written only after explicit approval. The setup
evidence must preserve the resolved skill directory, all three exact commands,
the target repository, and the invocation context for each verification run.
Run all three commands through `pnpm` from the target repository root and again
from an unrelated working directory; setup may report success only when all six runs complete successfully. Verify `sc` with the non-mutating
`pnpm run sc -- provider` command. A failure records the command, working
directory, exit status, and relevant output and prevents commit or PR handoff.

Record each run in normalized evidence with these fields:

```text
skill_location: absolute installation directory
target_repository: absolute repository directory
mode: local | global
script: sc | validate | thin-slice:validate-config
command: exact pnpm command
working_directory: absolute invocation directory
exit_status: numeric status
result: success | failure
output: relevant normalized output
```

The setup result is `success` only when all six records have
`result: success`; otherwise it is `blocked` and must include every failed
record before any commit or PR handoff.
In other words, all six runs complete successfully before setup can report
success.

Global paths are installation-specific. An absolute resolved path is valid for
the current installation, but can become stale after relocation, reinstall, or
removal of a global installation. Setup must surface that portability risk,
and audit or a later setup run must report a missing resolved target with
rerun guidance. Local relative paths remain portable with the repository but
require the repository-local skill source or installation to remain present.

### Inspection report

Return one structured report before proposing any changes. Keep observations
separate from prerequisites so an incomplete repository can still be set up
deliberately. Use `detected`, `missing`, or `unavailable` for each check; an
unavailable provider command is not evidence that the repository setting is
missing.

The report must contain these sections:

```text
repository
  provider: detected | unavailable
  repository: owner/name or unavailable
  authenticated: yes | no | unavailable
  default_branch: branch name or missing
  current_branch: branch name
labels
  existing: names
  required: names mapped to existing | proposed | missing
conventions
  branch_pattern: detected pattern | missing
  package_scripts:
    package_manager: command | missing
    sc: command | missing
    validate: command | missing
    thin_slice_validate_config: command | missing
    test: command | missing
    formatter: command | missing
  test_command: command | missing
  formatter: command | missing
  ci: configuration paths/commands | missing
capabilities
  operation: available | unavailable (reason)
prerequisites
  blocking: actionable missing requirements
  advisory: non-blocking observations
```

At minimum, inspect the provider and authentication status, repository metadata,
labels, capabilities, the default branch, local branch names, package/project
scripts, formatter configuration, and CI files. In a package-based repository,
`sc` must invoke the resolver-selected source-control wrapper, `validate` must
be the canonical pre-commit/pre-PR validation entry point, and
`thin-slice:validate-config` must invoke the repository's thin-slice config
validator. A missing test command,
formatter, CI file, `.thin-slice.yml`, label, executable, or authentication
session must appear explicitly in `prerequisites` with the exact evidence and
the consequence. Do not install dependencies, create labels, enable CI, or
change repository settings while producing this report. Missing or invalid
package scripts are proposed setup changes; do not silently substitute a
command.

Representative outcomes:

- A complete repository reports detected commands and CI, maps existing labels,
  and has no blocking prerequisite.
- A repository without credentials reports `authenticated: no` and marks
  remote metadata and label operations as unavailable; it does not claim that
  labels are missing.
- A local repository without CI or test/format scripts reports those items as
  missing and proposes them as setup decisions; it does not install tools or
  silently substitute commands.

## Propose

Present one setup plan containing the proposed schema-1 `.thin-slice.yml`,
required `package.json` script changes, label mappings, setup branch name, and
setup pull request title/body. Clearly
separate existing labels from labels that would be created. Ask for explicit
confirmation of package-script changes, label creation, and the setup
branch/PR mutations.

The confirmation must be actionable and unambiguous. Show two separate
decisions for the exact package-script edits and label creation, plus a third
decision for the branch/configuration/PR mutation: the exact package-script edits, the exact labels to create,
including color and description, and
the branch, configuration commit, and PR mutations. Existing labels must be
listed separately and must not be recreated. A general “looks good” response
to inspection is not approval for either mutation.

Use this minimum configuration shape:

```yaml
schema: 1
labels:
  mode: mapped
  vocabulary: {}
  mappings: {}
branch:
  pattern: thin-slice/{issue-number}-{short-slug}
implementation:
  create_branch: true
  use_worktree: false
  # Optional; relative paths resolve from the primary repository root.
  # worktree_root: /absolute/path/outside-the-repository
  commit_reference_required: true
  ready_label: thin-slice-ready
  in_progress_label: thin-slice-in-progress
  implemented_label: thin-slice-implemented
  blocked_label: thin-slice-blocked
  needs_discovery_label: thin-slice-needs-discovery
  automatic_lifecycle: false
pull_request:
  creation: ask
  close_work_item_on_merge: false
verification:
  require_tests: true
  require_acceptance_checks: true
  require_manual_evidence_when_relevant: true
  reject_unrelated_changes: false
```

`implementation.worktree_root` is optional. Relative values resolve from the
canonical primary repository root, never the caller's current working
directory; absolute values are canonicalized before use. When omitted, the
default remains `<repository-parent>/.thin-slice-worktrees`. Setup evidence
must record both the configured value and resolved absolute root. Reject
non-string or empty values, roots inside the primary checkout, roots that
cannot be safely created, and roots containing an unrelated directory or
registered worktree before mutation.

## Apply after confirmation

1. Re-read the current branch and default branch immediately before mutation.
   Refuse to continue if they are the same unless the user explicitly
   authorized modifying the default branch.
2. Apply the approved package-script changes to `package.json`, preserving
   unrelated scripts and existing behavior. The required entries are:

   - `sc`: the resolver-selected source-control wrapper command.
   - `validate`: the repository's complete validation command.
   - `thin-slice:validate-config`: the repository's thin-slice config validator.

   Add `test` or formatter scripts only when inspection found a real command.
   Show the exact old and new values for all three entries before confirmation,
   then write only the approved entries. Verify all three scripts resolve
   through the configured package manager from the repository root and an
   unrelated working directory, recording the resolved skill location and each
   command's invocation context and result.
3. Create each approved label through `pnpm run sc -- label create`; list
   labels again through `pnpm run sc -- label list` and verify every requested
   name exists.
4. Create and check out a deterministic setup branch such as
   `thin-slice/setup` from the default branch. Refuse to reuse a branch with
   unrelated changes without explicit approval.
5. Write `.thin-slice.yml`, validate it with
   `pnpm run thin-slice:validate-config -- .thin-slice.yml`, then run
   `pnpm run validate` and detected tests/formatters from the repository root
   and an unrelated working directory. Stop before committing when either
   generated validation command or another required check fails, and include
   the exact command, working directory, exit status, and output in the
   evidence.
6. Commit only `.thin-slice.yml`, the approved `package.json` changes (and
   explicitly approved setup artifacts),
   verify the commit's parent and changed paths, then push the setup branch.
7. When PR creation is approved and supported, create it through
   `pnpm run sc -- pr create`, targeting the detected default branch. Otherwise
   stop after the commit and report the prerequisite.
8. Report branches, package-script changes, labels, validation, checks, commit
   identifier, push result,
   and PR identifier/URL (or why no PR was opened).

### Required setup evidence

Before handoff, verify that the default branch tip is unchanged, the setup
branch contains only the configuration and approved package-script changes,
the configuration passes schema validation, `pnpm run validate` succeeds,
every approved label exists and no unapproved label was created, and any PR
targets the default branch and contains the setup commit. Record the commands
and normalized results, including the resolved skill location and invocation
context for all three generated commands from both working directories.
A failed verification must leave the setup result blocked, preserve the failed
command records, and must not be followed by commit or PR creation.

If a required capability is unavailable, stop with the exact prerequisite and
leave the worktree recoverable. Never silently fall back to direct `tea`, `gh`,
or API calls.
