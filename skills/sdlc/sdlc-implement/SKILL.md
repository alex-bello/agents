---
name: sdlc-implement
version: 1.0.0
description: Implement exactly one provenance-linked SDLC work item, verify it, and return an evidence-complete handoff without creating a pull request.
---

# SDLC implementation

Process exactly one `sdlc-work-item`. Validate `.sdlc.yml`, provenance,
dependencies, worktree safety, and lifecycle state before changing code.

Implement the issue’s complete approved boundary according to its flavor. Run
the configured tests, acceptance checks, relevant manual evidence, and diff
review. Use PNPM for package and project commands. Every commit must reference
the work-item issue when configured and must be after the recorded base commit.

The implementation agent owns only local branch/worktree changes, commits, and
verification. It must not create or edit issues, labels, comments, pull
requests, review state, or configuration.

Return exactly one structured JSON/YAML handoff with `schema: 1`,
`kind: implementation-handoff`, `feature`, `work_item`, `repository`,
`branch_or_worktree`, `base_commit`, `commits`, `changed_files`, `verification`,
and `status`. `status` is `ready-for-review`, `blocked`, `needs-discovery`, or
`failed`. A ready handoff requires a post-base commit, no uncommitted changes,
and passed required evidence. Unknown fields, missing fields, malformed paths,
or claims of success without evidence are rejected.

Preserve the branch/worktree and exact failure evidence when blocked. Never
retry an out-of-bound provider mutation through another interface.
