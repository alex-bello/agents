---
name: sdlc-audit
version: 1.0.0
description: Perform a read-only audit of SDLC feature records, dependencies, work items, branches, commits, pull requests, and reconciliation state.
---

# SDLC audit

Validate `.sdlc.yml` before discovery. Use the source-control wrapper and Git
read-only commands to inspect feature issues, child issues, metadata, labels,
dependencies, branches, worktrees, commits, PRs, reviewer evidence, and
reconciliation records.

Verify the chain:

```text
feature → design item → work item → branch/worktree → commits → PR → merge → reconciliation
```

Query for `sdlc`, then locally validate type, state, provenance, dependency
integrity, and cross-feature references. Report missing, duplicate, stale,
cyclic, mismatched, unsafe, or unverifiable relationships with one concrete
repair action. Distinguish waiting dependencies from blocked records and from
healthy records.

The audit is strictly read-only. It never edits issues, labels, comments,
branches, worktrees, PRs, configuration, or legacy thin-slice records.
