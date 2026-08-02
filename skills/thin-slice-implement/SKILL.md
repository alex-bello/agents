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
`node skills/thin-slice/scripts/validate-config.mjs` when it exists. Honor its
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

1. If lifecycle automation is enabled, add the in-progress label, remove the
   ready label, and record a concise start comment. If mutation fails, stop.
2. Create or check out the configured branch, such as
   `thin-slice/{issue-number}-{short-slug}`. Do not create one if disabled and
   the current branch is safe and authorized.
3. Translate the issue into a short local checklist and inspect only the code
   and tests needed for that checklist.
4. Implement the smallest complete behavior in scope. Do not pull deferred
   work into the change.
5. Run every issue-specified check and repository-required validation. Add or
   update tests required by the acceptance criteria. Perform relevant manual
   acceptance checks and record evidence.
6. Review the diff for scope, accidental changes, secrets, generated files,
   and regressions.
7. If additional work is low-risk and reversible, include only what is needed
   to preserve the stated behavior and explain it. Otherwise add the standard
   `Discovered work` comment, apply `thin-slice-needs-discovery`, and stop.
8. Commit when required by repository instructions or configuration. Otherwise
   do not commit unless authorized.
9. In `pr` mode, open a pull request only when policy allows it. If policy is
   `ask`, obtain confirmation before the external mutation. Include the issue
   reference, acceptance summary, verification results, and follow-ups.
10. Keep the issue `thin-slice-in-progress` until the pull request is merged or
    closed. Record its URL in an issue comment. Do not apply
    `thin-slice-implemented` merely because a PR was opened.

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
