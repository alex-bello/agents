---
name: sdlc-orchestrate
version: 1.0.0
description: Orchestrate one or more SDLC work items through isolated implementation, bounded review remediation, draft PR promotion, and dependency-aware scheduling.
---

# SDLC orchestration

Use the shared `sdlc` contract, `sdlc-implement`, and portable SDLC agent
definitions. Never merge automatically.

## Modes

Manual mode is `$sdlc-orchestrate <work-item-id>` and processes exactly one
selected work item. Batch mode is `$sdlc-orchestrate --batch` and is intended
for scheduled execution.

Validate `.sdlc.yml`, require a positive configured `max_concurrency`, acquire
the runtime scheduler lock, create a run ID, query for `sdlc`, and locally
filter to open issues with `sdlc-work-item`, `ready`, valid provenance, and no
active claim. Select eligible items deterministically by dependency readiness,
creation time, and issue number.

Dependencies are explicit issue references and may cross features. A dependency
is satisfied only when its PR is verified merged and reconciliation recorded it
as `complete`. Leave waiting items queued. Cycles, missing dependencies,
malformed records, and ambiguous ownership are reported without delegation.

Batch mode requires isolated worktrees when more than one worker is configured.
Claim each item by transitioning `ready` to `in-progress`, recording the run ID
and worker in durable feature metadata, and re-reading provider state before
delegation. Skip stale or already-owned claims. Independent failures do not
cancel unrelated workers.

For each claimed item, delegate `sdlc-implement`, validate its handoff, create
one draft PR, and launch the configured review panel. The default panel is
`general` plus `risk-security-operability`. Reviewers are read-only and return
structured findings; the orchestrator posts exactly one aggregate general PR
comment per pass.

Union findings conservatively: blocking/high findings request remediation;
medium/low findings do not. Remediate on the same branch/worktree for exactly
two passes maximum. On approval, promote the draft with `sc pr ready` and
verify `draft: false`. Do not merge, close the feature, or claim completion
before reconciliation.

Persist per-item branch, worktree, PR, review, remediation, and result state in
the feature record. On interruption or provider failure, preserve the last
verified state, release only the owned runtime lock, and resume without
duplicating completed mutations. Report run ID, lock result, selected/waiting/
skipped items, dependency decisions, workers, handoffs, PRs, review passes,
failures, and final per-item states.
