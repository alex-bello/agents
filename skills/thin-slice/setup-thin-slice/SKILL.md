---
name: setup-thin-slice
description: Inspect a repository and prepare its thin-slice lifecycle configuration, label plan, setup branch, and pull request after explicit confirmation.
---

# Setup Thin Slice

Initialize the repository foundation required by the thin-slice lifecycle.
Do not install dependencies, enable CI, modify the default branch, or create
labels without explicit confirmation.

## Inspect

1. Read `AGENTS.md`, `README.md`, and repository-local instructions.
2. Check for `.thin-slice.yml`; if present, validate it with
   `node skills/thin-slice/scripts/validate-config.mjs`.
3. Use `skills/source-control/scripts/sc provider`, `auth status`, `repo view`,
   `label list`, and `capabilities`.
4. Detect the default branch, existing branch conventions, test command,
   formatter, and CI configuration from the repository. Report anything
   missing; do not infer that a missing tool should be installed.

## Propose

Present one setup plan containing the proposed schema-1 `.thin-slice.yml`,
label mappings, setup branch name, and setup pull request title/body. Clearly
separate existing labels from labels that would be created. Ask for explicit
confirmation of label creation and the setup branch/PR mutations.

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

1. Create approved labels through `source-control` only.
2. Create and check out a setup branch from the default branch.
3. Write `.thin-slice.yml`, validate it, and run the repository validation and
   configured tests/formatters when available.
4. Commit the configuration with a clear message referencing setup.
5. Create a setup PR by default, or stop after the commit when the user chose
   not to open one. Report every normalized result and verification command.

If a required capability is unavailable, stop with the exact prerequisite and
leave the worktree recoverable. Never silently fall back to direct `tea`, `gh`,
or API calls.
