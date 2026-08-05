---
name: thin-slice-implement
description: Implement exactly one thin-slice work issue from its specification, verify it, manage its lifecycle labels, and optionally open a pull request. Use when explicitly asked to implement an issue or when a thin-slice issue is selected by its configured ready label.
---

# Thin-Slice Implement

Implement one and only one thin-slice work item. Treat the issue body as the
implementation contract, repository instructions as higher authority, and the
configured lifecycle labels as shared state between humans and agents.

## Invocation modes

Support these modes: `implement` (inspect, implement, verify, and report),
`pr` (the same work plus a pull request when configuration allows), and
`upgrade` (inspect one existing issue and propose or apply an enriched
implementation contract without changing code).
An explicit issue number and a ready-label lookup are both valid entry points.
The ready-label lookup must select at most one issue. Never process a batch.

## Configuration

Read `.thin-slice.yml` and validate it with
`pnpm run thin-slice:validate-config -- .thin-slice.yml` when it exists. Honor its
label mappings, branch pattern, verification settings, and pull-request policy.
Invocation options may make behavior less automated, but may not bypass
repository instructions or safety requirements.

Expected implementation settings include:

```yaml
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
  creation: ask # never | ask | automatic
  close_work_item_on_merge: false
```

## Preconditions

1. Read applicable `AGENTS.md` files, the README, and configuration.
2. Use `skills/source-control/scripts/sc` for provider, issue, branch, label,
   comment, and pull-request operations. Read its contract first; never call
   `gh`, `tea`, a raw API, or a connector directly.
3. Fetch exactly the selected issue and inspect its labels, body, comments, and
   metadata. Confirm it is a thin-slice work item.
4. If selection was by label, require the configured ready label. For an
   explicit issue, report a missing ready label and ask before proceeding unless
   direct implementation was explicitly requested.
5. Parse `depends-on` from metadata and the dependency section. Every
   dependency must be closed or have a merged pull request. Otherwise stop
   without changing code and report the unresolved dependency.
6. Inspect the worktree and current branch. Continue past clearly unrelated
   uncommitted changes, but stop if changes overlap the issue or make
   verification unreliable.

## Issue contract

Prefer work items containing `Objective`, `Context`, `Scope`, `Detailed
behavior`, `Acceptance criteria`, `Verification`, `Non-goals`, `Dependencies`,
`Risks and exceptions`, and `Rollback notes` sections. If an issue lacks enough
information to determine completion, use `upgrade` mode to propose an enriched
body and review state; do not implement during an upgrade. Preserve the
original issue content, show the proposed replacement or append an explicit
specification comment, and require confirmation before rewriting an externally
visible issue body. If the issue remains underspecified, apply
`thin-slice-needs-discovery`; if it is ready for review, apply
`thin-slice-review` and remove `thin-slice-needs-discovery` when lifecycle
automation is enabled.

## Implementation workflow

Resolve and check out the implementation branch only after the configuration
and provenance gates have passed. The branch operation is a local Git
operation; do not use a provider branch API or a provider-specific CLI.

1. Confirm `.thin-slice.yml` exists. Run the configured validator from the
   repository root and stop on any error, reporting its complete diagnostics
   and the setup/migration action it recommends. Resolve the implementation
   label from the validated configuration; never invent a fallback label.
2. Fetch the selected issue, verify it is open and carries the configured
   implementation label (or explicitly report the missing ready label when an
   issue number was supplied), and run the provenance gate below. Before inspecting implementation files, do not mutate labels, create a branch, or inspect implementation files before the gate passes.
3. Render `branch.pattern` by replacing `{issue-number}` with the decimal
   issue number and `{short-slug}` with a deterministic slug of the issue
   title: lowercase, non-alphanumeric runs become one hyphen, leading and
   trailing hyphens are removed, and the result is limited to  fifty
   characters. Reject an empty slug or a rendered branch name that is not a
   valid Git ref instead of guessing a name.
4. Read the current branch and worktree immediately before mutation. If the
   rendered branch already exists locally, check it out only when it points to
   the current `HEAD` or has no commits ahead of the current base; otherwise
   stop and report the collision. If it does not exist, create it from the
   current `HEAD` and check it out. Verify the resulting branch name before
   continuing.
5. Only after successful checkout, apply optional lifecycle labels and begin
   implementation. If any Git operation fails, preserve the worktree and
   report the failure without claiming the branch was created or checked out.

6. If lifecycle automation is enabled, add the in-progress label, remove the
   ready label, and record a concise start comment. If mutation fails, stop.
7. Translate the issue into a short local checklist and inspect only the code
   and tests needed for that checklist.
   A child with invalid provenance is not an implementation candidate: stop
   without changing code, report every diagnostic, and request correction of
   the child body or its originating tracker.
8. Implement the smallest complete behavior in scope. Do not pull deferred
   work into the change.
9. Run every issue-specified check and repository-required validation. Add or
   update tests required by the acceptance criteria. Perform relevant manual
   acceptance checks and record evidence.
10. Review the diff for scope, accidental changes, secrets, generated files,
   and regressions.
11. When `implementation.commit_reference_required` is true, validate every
   implementation commit before committing or opening a pull request. The
   commit range is the commits on the implementation branch after its base
   (the branch point recorded before implementation) through `HEAD`; an empty
   range passes because there is nothing to validate. Each commit subject or
   body must contain an issue reference in the form `#<selected-issue-number>`
   (for example, `#42`), with no reliance on the branch name, pull-request
   title, or a reference to a different issue. Emit one actionable diagnostic
   per offending commit including its short SHA, observed subject, and the
   correction, for example: `commit abc1234: observed "Implement parser";
   expected the commit subject or body to reference implementation issue #42
   (for example, "Implement parser (#42)").` Stop before creating a commit or
   pull request until all diagnostics are resolved. If the setting is false,
   skip this gate and state that it was disabled in the report.
12. If additional work is low-risk and reversible, include only what is needed
   to preserve the stated behavior and explain it. Otherwise add the standard
   `Discovered work` comment, apply `thin-slice-needs-discovery`, and stop.
13. Commit when required by repository instructions or configuration. Otherwise
   do not commit unless authorized.
14. In `pr` mode, prepare the pull request before any external mutation. Resolve
    the repository's detected default branch as `base`, verify the checked-out
    implementation branch as `head`, and confirm both names and the current
    commit. Use the issue title as the PR title, suffixing `(#<issue-number>)`
    when that reference is not already present. Prepare a body containing:
    the implementation issue and source tracker references, a concise summary,
    acceptance criteria and their status, verification commands and results,
    relevant manual evidence, follow-ups or discovered work, and a checklist
    stating that unrelated changes were reviewed. Write this body to a temporary
    file and inspect it before invoking `sc pr create`.

    Generate the PR body from the selected issue contract and verification
    record; do not rely on the branch name or PR title as traceability. The
    traceability section must link the implementation issue as `#<issue-number>`
    and link its source tracker as `#<source-tracker>` (including their URLs
    when the provider returned them). The verification section must contain one
    checklist entry for each applicable category:

    - `- [x] Tests: ...` or `- [ ] Tests: ...` for every required test command,
      with the command and result or failure recorded.
    - `- [x] Acceptance: ...` or `- [ ] Acceptance: ...` for every acceptance
      criterion, with the observed result recorded.
    - `- [x] Manual evidence: ...` or `- [ ] Manual evidence: ...` whenever
      the configuration or issue makes manual evidence relevant, naming the
      checked behavior and evidence (for example, a screenshot, output, or
      reproduction steps).

    Preserve the issue's acceptance-criterion order. Mark an entry checked only
    when its evidence was actually collected; unchecked or failed entries must
    remain visible with the reason. Always include `- [x] Unrelated changes
    reviewed` after reviewing the diff, or leave it unchecked with the reason.
    If a required test, acceptance check, or relevant manual-evidence item is
    missing, stop before PR creation and report the missing checklist entry.
15. Apply `pull_request.creation` exactly: `never` prepares and reports the PR
    metadata but does not call `sc pr create`; `ask` presents the complete
    prepared title, base, head, commit, labels, and body summary and obtains
    explicit confirmation immediately before the external mutation; `automatic`
    creates it after all verification and commit-reference gates pass. Treat an
    unknown value as a configuration error even if the validator was bypassed.
    Resolve the configured pull-request label from the validated label mapping;
    do not invent one or silently omit a required mapped label. After creation,
    verify the normalized PR number and URL and record both in the issue comment.
16. Keep the issue `thin-slice-in-progress` until the pull request is merged or
    closed. Record its URL in an issue comment. Do not apply
    `thin-slice-implemented` merely because a PR was opened.

### Post-merge lifecycle

After a pull request has been opened, reconcile its state with
`skills/source-control/scripts/sc pr view <pr-number>` before reporting the
work item as complete. Treat the normalized PR state as authoritative:

- If the PR is merged and `pull_request.close_work_item_on_merge` is `true`,
  apply the configured `implemented_label`, remove the configured
  `in_progress_label` (and any configured `ready_label`), then close the
  implementation issue with `sc issue close <issue-number>`. Record the merged
  PR URL and the close result in an issue comment. Verify the issue is closed
  before reporting completion.
- If the PR is merged and `pull_request.close_work_item_on_merge` is `false`,
  do not close the implementation issue. Preserve it open, apply the
  configured `implemented_label`, remove `in_progress_label`, and report that
  manual issue closure was intentionally skipped by configuration.
- If the PR is closed without merging, preserve the implementation issue open,
  keep or restore `in_progress_label` as appropriate, and report that the work
  is not implemented. Never treat a closed, unmerged PR as a successful
  implementation.
- If the PR remains open, leave the issue `in-progress` and report that it is
  awaiting PR merge.

This reconciliation is idempotent: on a repeated check, do not duplicate the
status comment or attempt to close an already-closed issue. A failed label or
issue mutation must stop the transition, preserve the last verified state, and
be reported as a provider mutation failure.

## Failure states

- Missing or ambiguous issue, unresolved dependency, or overlapping dirty
  changes: stop without mutation and report the condition.
- Missing requirements: apply `thin-slice-needs-discovery` when enabled, add a
  comment describing the exact gap, and stop.
- Verification failure: keep `thin-slice-in-progress`, record commands and
  failures, and do not open a PR unless explicitly authorized.
- Dangerous or breaking change without a clear issue exception: apply
  `thin-slice-blocked` when enabled and stop.
- Provider mutation failure: preserve the worktree and never claim a lifecycle
  transition occurred.

## Provenance gate

For an explicit issue or a ready-label selection, validate provenance before
branching, lifecycle mutation, or code changes. Parse exactly one block in the
issue body:

```md
<!-- thin-slice-work-item
schema: 2
kind: work-item
source-tracker: 123
feature-group: group-slug
source-item: item-slug
depends-on: []
-->
```

Require `schema: 2`, `kind: work-item`, a positive integer `source-tracker`,
non-empty exact-match `feature-group` and `source-item` slugs, and a present
list-valued `depends-on` field containing only positive integer issue numbers.
Reject missing, duplicate, malformed, or unsupported fields with diagnostics
that identify the field, observed value, and correction. Fetch the referenced
tracker and require that it exists, is open, has the configured tracker label,
and is a `thin-slice-tracker`. Confirm that the child's `Source tracker`,
`Feature group`, and `Source item` text matches the metadata and that the
tracker contains the same feature group and source checklist item. Reject
mismatches, unknown groups/items, closed or non-tracker parents, and malformed
issue numbers. Emit one diagnostic per failure, for example:

`source-tracker: observed "abc"; expected a positive integer tracker issue
number.`

`source-item: observed "cache-results"; expected an unchecked checklist item
with slug "cache-results" in tracker #123, feature group "storage".`

Do not add lifecycle labels, create a branch, or run implementation work until
the gate passes. This gate applies even when the issue has the ready label.

## Required report

Report the selected issue, mode, branch, files changed, verification commands
and results, commit if any, lifecycle labels changed, discovered work, and PR
URL if opened. State whether the issue is ready for review, blocked, awaiting
discovery, or awaiting PR merge.

## Handoff and metadata

The planning skill should generate the issue contract, explicit dependencies,
and this metadata. The implementation skill remains independently callable.

```md
<!-- thin-slice-work-item
schema: 2
kind: work-item
source-tracker: 123
feature-group: group-slug
source-item: item-slug
depends-on: [121, 122]
-->
```
