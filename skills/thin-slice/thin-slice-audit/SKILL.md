---
name: thin-slice-audit
version: 1.1.0
description: Audit a repository's thin-slice lifecycle records and report orphaned trackers, work items, branches, commits, and pull requests with actionable repair guidance. Use when traceability needs checking or lifecycle records may be stale or broken.
---

# Thin-slice lifecycle audit

Produce a read-only, evidence-backed report for the lifecycle represented by
`.thin-slice.yml`. The audit is a diagnostic: it never edits issues, labels,
branches, commits, pull requests, or configuration. Use `source-control` for
provider operations and Git for local repository inspection; never call
`gh`, `tea`, a raw API, or a provider connector directly.

The audit is also responsible for registered implementation worktrees. It
must classify each worktree without changing its contents, registration,
branch, or the primary checkout.

## Preconditions

Read `AGENTS.md`, `README.md`, `.thin-slice.yml`, and the applicable thin-slice
skills. Validate the configuration before inspecting lifecycle records:

```sh
pnpm run thin-slice:validate-config -- .thin-slice.yml
```

If configuration is missing, invalid, or incompatible, report that as a
blocking audit finding and stop. Do not infer labels, branch patterns, or a
provider from incomplete configuration. Run `source-control`'s provider
operation and record the provider and repository in the report.

### Validation preflight

After configuration validation and before provider record discovery, run the
repository's configured `validate` script through the configured package
manager. The `validate` entry must be present in `package.json` and must be a
well-formed, non-empty command. Capture the exact command, invocation
directory, exit status, and relevant normalized output.

Treat the preflight as a blocking gate:

- A successful command permits lifecycle record discovery.
- A missing or malformed `validate` script produces a `missing` or `invalid`
  blocking finding with the exact expected repair command and stops discovery.
- A non-zero command produces a `failure` blocking finding with the exact
  command, exit status, output, and repair guidance, then stops discovery.
- If command execution is unavailable, produce an `unverifiable` blocking
  finding naming the unavailable capability and the next operator action; do
  not treat it as a healthy result.

The preflight is read-only. It must not edit package scripts or mutate issues,
labels, branches, commits, or pull requests, including when validation fails.
Record the preflight result in the audit report before any lifecycle findings;
when it blocks, report that lifecycle discovery was not attempted.

## Scope and record discovery

Use the configured vocabulary and mappings to identify tracker issues and
work-item issues. Inspect every matching record available through the provider,
not just open issues. A work item is in scope when it has the configured
work-item label or valid `thin-slice` work-item metadata. A tracker is in scope
when it has the configured tracker label or valid tracker metadata.

For each work item, parse and retain its normalized provenance:

```text
source tracker → implementation issue → implementation branch → commits → pull request
```

Use the issue body and comments as evidence for explicit issue/URL references;
do not treat an issue title, branch name, or PR title as a substitute for a
traceability reference. Resolve branch and commit state locally with Git, and
resolve PR number, URL, base, head, and state with `source-control`. A missing
provider capability is a finding, not proof that a record is orphaned.

### Registered worktree inventory

After the validation preflight, enumerate the repository's registered
worktrees with:

```sh
git worktree list --porcelain
```

For every record, retain its canonical absolute path, branch (or detached
state), HEAD, and whether it is the primary checkout. For each non-primary
record, run `git status --short` from that worktree and compare its canonical
path and branch with the deterministic implementation branch/path expected by
the work-item contract. A missing path, unreadable status, detached HEAD,
branch collision, or path/branch mismatch is evidence to classify, not a
reason to remove or repair the record.

Correlate a candidate implementation worktree to a work item only after
checking the issue's parsed provenance and the local branch pattern. Do not
use a branch name, directory name, or PR title as a substitute for an issue
or source-tracker reference. When provider data is unavailable, preserve the
local evidence and classify the lifecycle correlation as `unverifiable`.

Classify each registered implementation worktree exactly once using the
strongest applicable state:

- `active`: canonical path exists, branch and path match the work item, the
  worktree is readable, and its lifecycle is open or otherwise in progress;
- `clean-and-merged`: the matching worktree is clean and its expected PR is
  authoritatively confirmed merged;
- `dirty`: the matching worktree has any tracked, staged, or untracked local
  change, regardless of PR state;
- `unmerged`: the matching worktree is clean but its PR is open, closed without
  merge, or has no confirmed merge evidence;
- `orphaned`: the worktree or branch has no valid matching work-item record,
  or its lifecycle record is broken;
- `missing`: the recorded canonical path does not exist or is no longer
  registered;
- `unverifiable`: required local or provider evidence could not be obtained;

Report the exact path, branch, HEAD, status output, matched issue/tracker (if
any), PR state (if available), and one safe follow-up for every record. A
`clean-and-merged` record may recommend `git worktree remove <canonical-path>`
after an operator confirms the evidence, but the audit must never execute that
command. Never use `--force`, delete the implementation branch, or treat a
dirty, mismatched, open, closed-unmerged, missing, or unverifiable record as
safe to remove.

## Findings

Report one finding per broken relationship. At minimum check:

- tracker metadata points to an existing tracker with the configured tracker
  label and expected feature-group/source-item entry;
- the implementation issue exists, has the configured work-item label, and
  its `source-tracker` agrees with the tracker reference;
- the expected implementation branch exists locally or as a remote branch,
  follows the configured branch pattern, and is associated with the work item;
- every implementation commit after the branch base references the
  implementation issue in its subject or body;
- every recorded PR exists, points from the expected implementation branch to
  the repository default branch, and explicitly references both the work item
  and source tracker;
- lifecycle state is coherent: an implemented work item has a merged PR,
  while an open or closed-unmerged PR is not reported as implemented;
- each tracker, work item, branch, commit, and PR belongs to at most one
  lifecycle chain unless the record explicitly documents a supported
  relationship.
- every registered implementation worktree is classified as `active`,
  `clean-and-merged`, `dirty`, `unmerged`, `orphaned`, `missing`, or
  `unverifiable`, with its canonical path, branch, status, and lifecycle
  evidence;
- a clean worktree is recommended for manual cleanup only when its matching PR
  is confirmed merged, while all unsafe or incomplete states preserve the
  worktree and identify the blocker.

Classify each finding as `missing`, `invalid`, `mismatched`, `duplicate`, or
`unverifiable`. Include the record identifier, observed evidence, expected
relationship, and a concrete repair action. Examples of useful actions are
“add `source-tracker: 123` to issue #45”, “restore or rename branch
`thin-slice/45-cache-results`”, “amend commit abc1234 to reference #45”, and
“update the PR traceability section to include tracker #123”. Never prescribe
deleting a record as the default repair.

## Output contract

Return a deterministic report in this shape:

```text
Thin-slice lifecycle audit
Repository: owner/name
Provider: forgejo|github
Configuration: valid|blocked
Summary: <records checked>; <findings>; <unverifiable checks>

Validation preflight: <exact command>; <working directory>; exit <status>;
result <success|missing|invalid|failure|unverifiable>

Findings
- [invalid] work item #45 → tracker: observed #999; expected existing tracker #123.
  Evidence: <issue URL and relevant field/metadata>
  Repair: <one concrete action>

Worktrees
- [clean-and-merged] <canonical path> → branch ... → issue #45 → PR #67 (merged)
  Evidence: status clean; registered path and branch match; PR state confirmed merged
  Repair: after review, an operator may run `git worktree remove <canonical-path>`

Healthy chains
- tracker #123 → issue #45 → branch ... → commits ... → PR #67 (merged)

Unverifiable checks
- <capability or unavailable evidence and the next command/operator action>
```

Sort findings by issue number, then relationship (`tracker`, `issue`,
`branch`, `worktree`, `commit`, `pull-request`), then identifier. Sort
worktrees by canonical absolute path and healthy chains by tracker number. Use
`0 findings` explicitly for a clean audit. Distinguish
“no records found” from “all records are healthy”, and do not claim complete
coverage when provider or Git evidence was unavailable.

## Deterministic worktree fixtures

Focused fixtures must use isolated temporary Git repositories and a stubbed
normalized provider response; they must not call a live provider or mutate the
repository under audit. Cover at least healthy active, clean-and-merged,
dirty, unmerged, orphaned, missing-path, and unavailable-provider cases. Each
fixture must assert the canonical path, branch, classification, observed
status, safe follow-up, and unchanged primary checkout. The merged case must
assert that the report contains `git worktree remove` as guidance while the
fixture's registered worktree and branch remain until the test performs any
explicit teardown. Refusal cases must assert that no force-removal command is
used and that the registered worktree remains available.

The report is the only output mutation: do not add labels, comments, issues,
commits, or pull requests. Preserve enough URLs, numbers, SHAs, branch names,
and observed values that an operator can repair each finding without repeating
the entire audit.
