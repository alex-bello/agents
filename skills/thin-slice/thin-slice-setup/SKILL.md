---
name: thin-slice-setup
version: 1.1.0
description: Inspect a repository and prepare its thin-slice lifecycle configuration, label plan, setup branch, and pull request after explicit confirmation.
---

# Thin-Slice Setup

Initialize the repository foundation required by the thin-slice lifecycle.
Do not install dependencies, enable CI, modify the default branch, or create
labels without explicit confirmation.

## Inspect

1. Read `AGENTS.md`, `README.md`, and repository-local instructions.
2. Check for `.thin-slice.yml`; if present, validate it with
   `node skills/thin-slice/thin-slice/scripts/validate-config.mjs`.
3. Use `skills/source-control/scripts/sc provider`, `auth status`, `repo view`,
   `label list`, and `capabilities`.
4. Detect the default branch, existing branch conventions, package manager,
   package/project scripts, test command, formatter, and CI configuration from
   the repository. In package-based repositories, verify that `package.json`
   exposes `validate` and `thin-slice:validate-config`, recording the commands
   they run. Report anything missing; do not infer that a missing tool should
   be installed.

### Setup path-resolution contract

When setup generates repository scripts, it must resolve the installation
containing the currently executing `thin-slice-setup` skill before reading or
writing any repository file. The caller's `process.cwd()` is only the target
repository supplied by the setup operation; it is never used to locate the
skill, its validator, or another installed skill.

Resolve the active skill location with this precedence:

1. Use the runtime module URL or equivalent runtime-provided file location for
   the executing skill.
2. Resolve the containing skill directory, then its sibling
   `thin-slice/thin-slice/scripts/validate-config.mjs` path from that
   installation root.
3. If the runtime location is unavailable, fail before proposing or writing
   scripts. Report the attempted resolution, the expected validator path, and
   the command to rerun setup after restoring a usable installation.

This contract covers both supported layouts:

- A local installation resolves to the repository-local skill installation
  directory and generates commands targeting that directory.
- A global installation resolves to the globally installed skill directory and
  generates commands targeting that directory; it must not fall back to a
  repository-local path.

The generated commands must be deterministic and independently executable
from the target repository root and from an unrelated working directory. They
must invoke the resolved validator explicitly, preserve unrelated
`package.json` scripts, and record the exact resolved path in setup evidence.
Use the configured package manager to run the generated commands; do not
derive command targets from the caller's current directory.

Paths are installation-specific. An absolute resolved path is valid for the
current installation, but can become stale after relocation, reinstall, or
removal of a global installation. Setup must surface that portability risk,
and audit or a later setup run must report a missing resolved target with
rerun guidance. A stable launcher command remains future work and is not
silently substituted by this contract.

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
`validate` must be the canonical pre-commit/pre-PR validation entry point and
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

The confirmation must be actionable and unambiguous. Show three separate
decisions: the exact package-script edits, the exact labels to create,
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

## Apply after confirmation

1. Re-read the current branch and default branch immediately before mutation.
   Refuse to continue if they are the same unless the user explicitly
   authorized modifying the default branch.
2. Apply the approved package-script changes to `package.json`, preserving
   unrelated scripts and existing behavior. The required entries are:

   - `validate`: the repository's complete validation command.
   - `thin-slice:validate-config`: the repository's thin-slice config validator.

   Add `test` or formatter scripts only when inspection found a real command.
   Show old and new commands when replacing an existing entry, then verify
   both scripts resolve through the configured package manager.
3. Create each approved label through `skills/source-control/scripts/sc label
   create`; list labels again and verify every requested name exists.
4. Create and check out a deterministic setup branch such as
   `thin-slice/setup` from the default branch. Refuse to reuse a branch with
   unrelated changes without explicit approval.
5. Write `.thin-slice.yml`, validate it with
   `pnpm run thin-slice:validate-config -- .thin-slice.yml`, then run
   `pnpm run validate` and detected tests/formatters. Stop before committing
   when a required check fails.
6. Commit only `.thin-slice.yml`, the approved `package.json` changes (and
   explicitly approved setup artifacts),
   verify the commit's parent and changed paths, then push the setup branch.
7. When PR creation is approved and supported, create it through
   `skills/source-control/scripts/sc pr create`, targeting the detected
   default branch. Otherwise stop after the commit and report the prerequisite.
8. Report branches, package-script changes, labels, validation, checks, commit
   identifier, push result,
   and PR identifier/URL (or why no PR was opened).

### Required setup evidence

Before handoff, verify that the default branch tip is unchanged, the setup
branch contains only the configuration and approved package-script changes,
the configuration passes schema validation, `pnpm run validate` succeeds,
every approved label exists and no unapproved label was created, and any PR
targets the default branch and contains the setup commit. Record the commands
and normalized results. A failed verification must not be followed by PR
creation.

If a required capability is unavailable, stop with the exact prerequisite and
leave the worktree recoverable. Never silently fall back to direct `tea`, `gh`,
or API calls.
