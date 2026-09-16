---
name: sdlc-reconcile
version: 1.0.0
description: Reconcile one SDLC feature after merges by verifying linked pull requests, updating child states and feature checkboxes, and preserving durable lifecycle evidence.
---

# SDLC reconciliation

Run `$sdlc-reconcile <feature-issue-id>`. Read the feature metadata, linked
child issues, pull requests, comments, and merge state through
`skills/source-control/scripts/sc`. Verify every relationship before mutation.

For each child whose PR is verified merged, update its managed state to
`complete`, close it when `close_child_on_merge` is enabled, and check the exact
corresponding feature checkbox. Never mark a child complete for an open or
closed-but-unmerged PR. Leave unresolved, blocked, or missing links unchanged
and report them.

When every child is verified complete, transition the feature to `complete` and
close it only when `close_feature_on_complete` is enabled. Otherwise leave final
feature closure for the maintainer. Append one structured reconciliation record
and update durable metadata. The command is idempotent: re-running it must
produce no duplicate checkboxes, labels, closures, or evidence.

Legacy thin-slice records may be inspected and reported, but must not be
converted automatically.
