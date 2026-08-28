---
name: thin-slice-implement
version: 1.3.0
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
  creation: ask # never | ask | automatic
  close_work_item_on_merge: false
```

`implementation.use_worktree` is optional for backward compatibility and
defaults to `false` when omitted. When `true`, implementation happens in a
dedicated Git worktree for the issue's branch; the primary checkout remains
untouched. It does not change the branch naming or pull-request policy.

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
5. Parse dependencies using the serialization contract below. Metadata is the
   authoritative list of implementation issue numbers. The human-readable
   section may additionally contain planned source-item slugs; resolve those
   through the source tracker when a child exists. Every resolved dependency
   must be closed or have a merged pull request. A slug without a child is a
   hard stop; never treat it as an issue number or silently ignore it.
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

### Discovery-only work

A work item may declare `delivery: discovery-only` when its contract produces
documentation rather than application source. The declaration must name the
documentation deliverable and its audience. Valid deliverables include a
source or capability inventory, workflow map, authorization or permission
notes, an explicit record that application code is absent, and concrete
follow-up thin-slice items with owners or triggering conditions. A vague
summary, an unstructured list of ideas, or a promise to investigate later is
not a deliverable.

For discovery-only work, evaluate acceptance in two separate evidence tracks:

- Documentation acceptance verifies that the named inventory, map, notes, or
  absence record exists, is internally consistent, and contains actionable
  next implementation slices. Review a representative output manually.
- Code-test acceptance is not required when the contract explicitly says that
  no application source is expected. Do not report missing source changes as
  implementation success; record that application code was absent and why the
  documentation is the correct result.

If a discovery-only item does not identify a concrete deliverable, document
the exact missing requirement and stop with `thin-slice-needs-discovery`.
Never infer requirements or silently convert a normal implementation item into
discovery-only work. A valid discovery-only item completes without source
changes only after its documentation evidence and actionable follow-up slices
have been reviewed.

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
4. Read the current branch and worktree immediately before mutation. If
   `implementation.use_worktree` is `false`, use the current checkout: if the
   rendered branch already exists locally, check it out only when it points to
   the current `HEAD` or has no commits ahead of the current base; otherwise
   stop and report the collision. If it does not exist, create it from the
   current `HEAD` and check it out. Verify the resulting branch name before
   continuing.

   If `implementation.use_worktree` is `true`, leave the current checkout on
   its existing branch and create a separate worktree for the rendered branch.
   Use a deterministic path outside the repository. Resolve the optional
   `implementation.worktree_root` relative to the canonical primary repository root,
   never the caller's current working directory. When omitted, use
   `<repository-parent>/.thin-slice-worktrees`; beneath the resolved root use
   `<repository-name>/<issue-number>-<short-slug>`. Record the configured root,
   canonical resolved root, and canonical worktree path. Reject non-string or
   empty roots, roots that resolve inside the primary repository, roots that
   cannot be created safely, unrelated directories at the target, and
   The safety check must reject roots that cannot be created safely and
   registered-worktree collisions before mutation. If the branch does not
   exist, create both the branch and worktree from the current `HEAD` with
   `git worktree add`; if the branch already exists, attach it only when it has
   no commits ahead of the current base and the target path is unused. Refuse
   branch or path collisions rather than guessing, and verify the registered worktree path and branch name.
5. Only after the branch or worktree operation succeeds, apply optional
   lifecycle labels and begin implementation. When worktree mode is enabled,
   run all implementation, verification, diff, and commit commands from the
   isolated worktree and record its absolute path; do not accidentally modify
   the primary checkout. If any Git operation fails, preserve the existing
   worktree(s) and report the failure without claiming the branch or worktree
   was created or checked out.

6. If lifecycle automation is enabled, add the in-progress label, remove the
   ready label using `sc issue edit <issue-number> --add-label <label>` and
   `--remove-label <label>`, then record a concise start comment. If mutation
   fails, stop.

   Every lifecycle transition is one provider-neutral `sc issue edit` mutation
   with repeated `--add-label` and `--remove-label` options as needed; never
   bypass this boundary with provider-specific commands. The transition contract
   is that a successful mutation yields exactly the configured target lifecycle
   label plus the stable `thin-slice` label. On any failed mutation, stop before
   the next lifecycle step, retain the last successfully verified label state,
   and report `issue.edit` plus the provider diagnostic. Do not claim that a
   partially attempted transition succeeded or retry through another interface.
7. Translate the issue into a short local checklist and inspect only the code
   and tests needed for that checklist.
   A child with invalid provenance is not an implementation candidate: stop
   without changing code, report every diagnostic, and request correction of
   the child body or its originating tracker.
8. Implement the smallest complete behavior in scope. For a valid
   `delivery: discovery-only` item, produce and review the specified
   documentation deliverable instead of changing application source. Do not
   pull deferred work into the change.
9. Run every issue-specified check and repository-required validation. Add or
   update tests required by the acceptance criteria. For discovery-only work,
   record documentation acceptance separately from code-test acceptance,
   document absent application code, and perform the required manual review of
   the output.
10. Review the diff for scope, accidental changes, secrets, generated files,
   and regressions.
11. Record the implementation branch base before creating the first
   implementation commit (the branch point from step 4), and use that recorded
   commit—not the current default branch or a freshly fetched ref—to define the
   implementation range. When `implementation.commit_reference_required` is
   true, validate every implementation commit after that base before
   committing or opening a pull request. Each commit subject or
   body must contain an issue reference in the form `#<selected-issue-number>`
   (for example, `#42`), with no reliance on the branch name, pull-request
   title, or a reference to a different issue. Emit one actionable diagnostic
   per offending commit including its short SHA, observed subject, and the
   correction, for example: `commit abc1234: observed "Implement parser";
   expected the commit subject or body to reference implementation issue #42
   (for example, "Implement parser (#42)").` Emit one actionable diagnostic
   per offending commit, including its short SHA and observed subject; stop
   before creating a commit or pull request until all diagnostics are resolved.
   Unrelated commits before the recorded base are excluded from this check. If
   the setting is false, skip this gate and state that it was disabled in the
   report.
12. In `pr` mode, require at least one commit after the recorded branch base.
   An empty implementation range is an actionable failure: `PR mode requires
   at least one implementation commit after branch base <sha>; create and
   validate a commit before push or PR creation.` In `pr` mode, reject any
   staged or unstaged changes, including untracked files, before push or PR
   preparation, and report the paths that must be committed or removed. These
   preconditions run before any push or `sc pr create` mutation. In `implement`
   mode, implementation may finish with uncommitted changes only when no commit
   is required by repository policy or configuration; report that state clearly
   and do not imply that a PR is ready.
13. If additional work is low-risk and reversible, include only what is needed
   to preserve the stated behavior and explain it. Otherwise add the standard
   `Discovered work` comment, apply `thin-slice-needs-discovery`, and stop.
14. Commit when required by repository instructions or configuration. Otherwise
   do not commit unless authorized.
15. In `pr` mode, prepare the pull request before any external mutation. Resolve
    the repository's default branch with this exact precedence: (1) the
    non-empty `defaultBranch` returned by `sc repo view` (provider metadata), (2) the local remote
    symbolic reference from `git symbolic-ref --short refs/remotes/<remote>/HEAD`
    (strip the `<remote>/` prefix), (3) the non-empty optional
    `branch.default` configured in `.thin-slice.yml`, then (4) an explicit
    ambiguity failure. This is an explicit ambiguity failure. Treat unreadable, conflicting, or empty candidates at a
    given source as unavailable; never guess `main` or `master`. If no single
    candidate remains, stop before push or PR creation and report every observed
    candidate and the missing source. No single candidate remains: stop before push or PR creation. Resolve the repository's detected default
    branch as `base` (the detected default branch as `base`), verify the checked-out implementation branch as `head`,
    and confirm both names and the current commit. Use the issue title as the PR title, suffixing `(#<issue-number>)`
    when that reference is not already present. Prepare a body containing:
    the implementation issue and source tracker references, a concise summary,
    acceptance criteria and their status, verification commands and results,
    relevant manual evidence, follow-ups or discovered work, and a checklist
    stating that unrelated changes were reviewed. Create the body in a managed,
    uniquely named temporary directory outside the repository; inspect the
    exact file before invoking `sc pr create`, including a secret scan and a
    check for unintended paths or credentials. Remove the managed directory
    after successful creation. If interrupted, clean only that recorded
    directory after verifying it is under the platform temporary directory.
    Check `git status --short` before and after preparation, never stage the
    body file, and report cleanup failure rather than silently leaving it.
    This is the required temporary
    file workflow for every generated PR body.

    Explicitly reference the thin-slice work item with `Closes #<issue-number>`
    in the PR body, using the actual implementation issue number. Listing the
    work item only as the implementation issue does not close it when the PR is
    merged.

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
16. Apply `pull_request.creation` exactly: `never` prepares and reports the PR
    metadata but does not call `sc pr create`; `ask` presents the complete
    prepared title, base, head, commit, labels, and body summary and obtains
    explicit confirmation immediately before the external mutation; `automatic`
    creates it after all verification and commit-reference gates pass. Treat an
    unknown value as a configuration error even if the validator was bypassed.
    Resolve the configured pull-request label from the validated label mapping;
    do not invent one or silently omit a required mapped label. After creation,
    verify the normalized PR number and URL and record both in the issue comment.
17. Keep the issue `thin-slice-in-progress` until the pull request is merged or
    closed. Record its URL in an issue comment. Do not apply
    `thin-slice-implemented` merely because a PR was opened.

### Post-merge lifecycle

After a pull request has been opened, reconcile its state with
`skills/source-control/scripts/sc pr view <pr-number>` before reporting the
work item as complete. Treat the normalized PR state as authoritative:

When `implementation.use_worktree` is `true`, a merged PR is also the gate for
local worktree cleanup. After `sc pr view` confirms `merged`, verify that the
PR head is the expected implementation branch and that the recorded absolute
path is the registered worktree for that branch. Check `git status --short`
inside that worktree. If it is clean, remove only that worktree with
`git worktree remove <path>` from the primary repository, then verify that the
path and registration are gone. Never remove the primary checkout, delete the
branch as part of this cleanup, or use `--force`. If the worktree is dirty,
the path/branch cannot be matched, or removal/verification fails, preserve it
and report the exact cleanup blocker; do not claim cleanup succeeded. An open,
closed-unmerged, or otherwise unconfirmed PR never permits worktree removal.

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
- Worktree cleanup failure: preserve the worktree and report the exact path,
  observed state, and safe follow-up action; never force-remove it.

The lifecycle fixture must cover ready, in-progress, implemented, discovery,
and blocked states, and must assert exact normalized labels after successful
transitions and preservation of the last verified state after representative
failures.

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
list-valued `depends-on` field containing only positive integer implementation
issue numbers. Never accept a source-item slug in this field. In the human
readable `Dependencies` section, accept either `#<issue-number>` references or
exact source-item slugs; resolve slugs against the referenced tracker and
require each resolved child to have matching work-item provenance. A slug
without a child is a planned dependency and blocks implementation until its
child issue exists and its number is added to metadata.
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
