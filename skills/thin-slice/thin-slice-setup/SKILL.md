---
name: thin-slice-setup
description: Inspect a repository and prepare its thin-slice lifecycle configuration, label plan, setup branch, and pull request after explicit confirmation.
---

# Thin-Slice Setup

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

The confirmation must be actionable and unambiguous. Show two separate
decisions: the exact labels to create, including color and description, and
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
2. Create each approved label through `skills/source-control/scripts/sc label
   create`; list labels again and verify every requested name exists.
3. Create and check out a deterministic setup branch such as
   `thin-slice/setup` from the default branch. Refuse to reuse a branch with
   unrelated changes without explicit approval.
4. Write `.thin-slice.yml`, validate it with
   `pnpm run thin-slice:validate-config -- .thin-slice.yml`, then run
   `pnpm run validate` and detected tests/formatters. Stop before committing
   when a required check fails.
5. Commit only `.thin-slice.yml` (and explicitly approved setup artifacts),
   verify the commit's parent and changed paths, then push the setup branch.
6. When PR creation is approved and supported, create it through
   `skills/source-control/scripts/sc pr create`, targeting the detected
   default branch. Otherwise stop after the commit and report the prerequisite.
7. Report branches, labels, validation, checks, commit identifier, push result,
   and PR identifier/URL (or why no PR was opened).

### Required setup evidence

Before handoff, verify that the default branch tip is unchanged, the setup
branch contains only the configuration commit, the configuration passes schema
validation, every approved label exists and no unapproved label was created,
and any PR targets the default branch and contains the setup commit. Record
the commands and normalized results. A failed verification must not be
followed by PR creation.

If a required capability is unavailable, stop with the exact prerequisite and
leave the worktree recoverable. Never silently fall back to direct `tea`, `gh`,
or API calls.
