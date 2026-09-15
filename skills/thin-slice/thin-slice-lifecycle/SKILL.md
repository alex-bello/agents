---
name: thin-slice-lifecycle
version: 1.2.0
description: Orchestrate exactly one thin-slice issue from ready selection through implementation, draft pull-request review, and approval promotion without merging it.
---

# Thin-Slice Lifecycle

Process exactly one thin-slice work issue per invocation. The command accepts
either no argument or one issue number:

```text
$thin-slice-lifecycle [issue-number]
```

The outcome is: a maintainer can select one ready work item, receive an
isolated implementation, inspect structured review evidence, and have its
approved draft PR promoted to ready for human merge follow-up.

This is an orchestration skill, not an implementation shortcut. Use the
portable definitions in `agents/implementation-agent.md` and
`agents/review-agent.md`, and pass the contracts below without weakening them.
The implementation agent must use `thin-slice-implement` in `implement` mode
and must not create the PR.

## Preconditions and selection

1. Read applicable `AGENTS.md`, the repository README, and `.thin-slice.yml`.
   Validate the configuration from the repository root with:

   ```sh
   pnpm run thin-slice:validate-config -- .thin-slice.yml
   ```

   A missing, malformed, or invalid configuration is a hard stop before issue
   selection or mutation. Resolve every label through the validated mapping;
   never invent or silently substitute a label.
2. Use `skills/source-control/scripts/sc` for all provider operations. Read its
   contract first, then inspect provider, authentication, repository metadata,
   and the configured lifecycle labels.
3. With an explicit issue number, fetch exactly that issue and confirm it is a
   thin-slice work item. With no argument, list open issues using the configured
   ready label, sort by oldest `createdAt` (using issue number as a stable
   tie-breaker), and select exactly one.
4. An empty ready queue is a clean no-op with an actionable report. An
   ambiguous queue or ambiguous explicit selection is a hard stop. Never claim
   more than one issue, and never process a batch.
5. Validate work-item provenance and dependencies using the
   `thin-slice-implement` contract before branching, claiming, or delegating.
   An explicit issue with no ready label is only allowed because this is an
   explicit implementation request; report the exception. A label-selected
   issue must have the configured ready label.

## Lifecycle claim

When `implementation.automatic_lifecycle: true`, claim the selected issue by
one provider-neutral transition:

```sh
sc issue edit <issue-number> \
  --add-label <in-progress-label> \
  --remove-label <ready-label>
```

Verify the resulting labels before delegation. The successful state must retain
the stable `thin-slice` label and contain the configured in-progress label.
When `automatic_lifecycle: false`, perform selection without claiming and
report the concurrency limitation: another operator may select the same issue
until a human or later lifecycle run claims it. Do not silently mutate labels
in this mode.

If a lifecycle mutation fails, preserve the last verified label state, stop,
and report the `issue.edit` operation and provider diagnostic. Do not retry
through a provider-specific command.

## Mutation boundary and run ledger

Treat the lifecycle as a bounded command with an auditable operation ledger.
All preflight, selection, provenance, handoff, and review reads are
non-mutating. The only provider mutations permitted by this skill are:

- one configured ready-to-in-progress `sc issue edit` transition when
  `automatic_lifecycle: true`;
- one draft `sc pr create` when the configured PR policy permits it;
- exactly one structured general `sc pr comment` for each review pass when a
  PR exists; and
- one `sc pr ready` followed by `sc pr view` after an approved review.

The implementation agent may create its branch, worktree, commits, and local
verification artifacts within the implementation contract, but it cannot
perform any provider lifecycle or PR mutation. The reviewer is read-only apart
from its single general comment. Never merge, wait for merge, close the issue,
edit `AGENTS.md`, create follow-up issues, use inline review threads, or add
unconfigured labels. Record the ordered operation ledger in the structured
result so a contract fixture can assert that no extra provider mutation
occurred and that an approved run ended with `draft: false` while the issue
remained in progress.

The orchestrator must enforce these boundaries against requested operations,
not only trust the agent's prose or handoff. Implementation requests are
limited to local branch/worktree changes, commits, and verification; requests
for `issue.edit`, issue comments or closure, label changes, `pr.create`,
`pr.comment`, `pr.ready`, merge, or other provider mutation are rejected with
an actionable diagnostic before provider state changes. Review requests are
read-only except for one structured general `pr.comment` tied to the active
review pass and an existing PR. A duplicate, unmatched, inline, or otherwise
malformed comment request is rejected before `sc pr comment`. Every rejected
request preserves the last verified issue, PR, label, and operation-ledger
state, and must not be retried through another interface.

## Implementation handoff

Delegate one implementation pass to the implementation agent. The prompt must
include the selected issue, repository, current lifecycle state, source
tracker context, configuration path, and any prior remediation findings. The
agent must invoke `thin-slice-implement` in `implement` mode for exactly this
issue, run the repository and issue verification, and leave PR creation to this
orchestrator. It may use the configured branch or worktree, but it must not
create, edit, promote, merge, or comment on a PR.

Require this strict result; reject a missing, duplicated, or malformed field as
a failed handoff and keep the issue in progress:

```yaml
issue: 123
repository: owner/name
branch_or_worktree: /absolute/path or branch-name
base_commit: abcdef1234567890
commits:
  - sha: 0123456789abcdef
    subject: "Implement the behavior (#123)"
changed_files:
  - path/to/file.ts
verification:
  tests:
    - command: pnpm test
      status: passed
      evidence: "..."
  acceptance:
    - criterion: "..."
      status: passed
      evidence: "..."
  manual_evidence:
    status: not-applicable
    evidence: "..."
status: ready-for-review
```

`status` must be one of `ready-for-review`, `blocked`, `needs-discovery`, or
`failed`. A ready-for-review result requires the issue number, branch/worktree,
base commit, at least one commit, changed files, and verification evidence.
Reject results that claim success without an implementation commit after the
recorded base. Report malformed handoffs with the missing field and do not
guess values.

## Draft pull request policy

Prepare the PR title and body from the implementation handoff, issue contract,
source tracker, acceptance results, verification commands, changed files, and
discovered work. Use a unique managed temporary directory outside the
repository, inspect the exact body for secrets and accidental paths, and clean
it up after the provider operation. Do not stage or commit the body file.

Honor `.thin-slice.yml` exactly:

- `pull_request.creation: never` performs a local review of the implementation
  branch/worktree without creating a PR. There is no PR to comment on or
  promote; report the local review evidence and stop after the review decision.
- `pull_request.creation: ask` presents the complete prepared draft-PR title,
  base, head, labels, and body summary, then requires confirmation immediately
  before `sc pr create --draft`.
- `pull_request.creation: automatic` creates the draft automatically with
  `sc pr create --draft` after all implementation gates pass.

Resolve the default branch using the existing implementation precedence and
require one unambiguous base. The head must equal the implementation branch
and the draft PR must include the configured PR label when one is configured.
Verify normalized PR number, URL, base, head, and `draft: true` after creation.
Keep the issue in progress; opening a draft PR is not implementation or
approval.

## Review handoff and comments

Delegate read-only review to the dedicated review agent after draft creation,
or against the local base-to-head diff when PR creation is `never`. The review
agent may inspect issue/PR metadata, commits, diff, tests, and evidence. It may
make no code, branch, commit, label, issue, or PR-state changes. When a PR
exists, its only permitted mutation is exactly one structured general PR comment per review pass through `sc pr comment`; it must not use inline review
threads, approvals, changes-requested state, or merge operations.

Require this strict review result:

```yaml
issue: 123
pr: 456
pass: 1
approval: approved # approved | changes-requested | blocked | failed
findings:
  - severity: blocking # blocking | high | medium | low
    file: path/to/file.ts
    line: 42
    title: "..."
    evidence: "..."
    required_change: "..."
recurring_patterns:
  - tag: missing-acceptance-evidence
    evidence: "..."
comment:
  posted: true
  url: https://host/owner/name/pulls/456#issuecomment-...
status: approved
```

The `findings` list is severity-ranked and every finding requires a file/line
reference, evidence, and required change. `approval: approved` is valid only
when no blocking or high-severity finding remains. A review comment must
contain the pass number, approval status, findings, required changes, evidence,
and recurring-pattern tags. For `never`, set `pr: null` and `comment.posted:
false` with a reason rather than fabricating a PR comment.

Record every review pass when a PR exists, including approved passes and
remediation passes. If comment posting fails, preserve the PR and in-progress
issue state, report the exact provider failure, and stop; do not retry or claim
that the pass was recorded.

## Bounded remediation contract

The orchestrator keeps a per-run review ledger containing the selected issue,
PR, review pass number, remediation-pass count, verified lifecycle state,
structured comment result, findings, and recurring-pattern evidence. The count
is incremented before each remediation handoff and is never reset by a stale,
duplicate, malformed, or failed result.

Classify each review result before taking the next action:

- An approved result has no `blocking` or `high` finding. Medium and low
  findings are non-blocking observations: report them in the structured
  evidence, perform no remediation, and continue to the configured promotion
  boundary.
- A result with a blocking or high finding requests remediation only when the
  remediation-pass count is below two. Pass the complete ranked findings and
  recurring-pattern evidence to the same implementation agent, then require a
  fresh implementation handoff and review pass.
- When the second remediation pass still leaves a blocking or high finding,
  stop with an unresolved summary. Do not delegate a third pass, promote the
  draft, close the issue, create a follow-up issue, or edit `AGENTS.md`.
  Preserve the draft PR, the in-progress lifecycle state, every review
  comment, the two-pass count, and the final findings for human follow-up.
- A failed remediation, malformed handoff or review result, provider failure,
  missing evidence, or lost PR state is conservative failure. Do not claim
  approval or promotion; preserve the last verified issue, PR, label, comment,
  and ledger state, and report the exact failure and next operator action.

Each valid review pass may record exactly one structured general comment after
handoff validation. A rejected, duplicate, or failed comment mutation records
no new pass comment and never retries through another interface. Recurring
patterns are normalized to the review schema's lowercase kebab-case tags,
deduplicated by tag, sorted lexicographically, and reported with counts and
supporting evidence so the same evidence produces stable output across runs.
Pattern reports are advisory only and must not mutate repository instructions
or create work automatically.

## Remediation and promotion

If the review is approved, promote the draft immediately with:

```sh
sc pr ready <pr-number>
sc pr view <pr-number>
```

The source-control wrapper maps promotion to `gh pr ready <number>` on GitHub
and `tea pulls edit <number> --ready` on Forgejo. Require the follow-up
`sc pr view` result to have `draft: false`, the expected head branch, and the
same PR number and URL. If verification fails, preserve the draft and report
the mismatch. Do not merge, close, or wait for merge.

If the review requests changes, delegate remediation to the same implementation
agent on the same branch/worktree with the complete structured findings. A
remediation pass must use `thin-slice-implement` in `implement` mode, verify
the new commits against the original base, and return the full implementation
handoff again. Run at most two remediation passes. Each pass receives one
review comment and one new review handoff; do not combine passes or silently
drop findings.

After two unsuccessful remediation passes, leave the draft PR available for
human follow-up, keep the issue in `thin-slice-in-progress`, and stop. Do not
promote an unapproved PR. If implementation or review becomes blocked or needs
discovery, preserve the last verified lifecycle state and report the exact
blocker.

Recurring review patterns are for human consideration only. Report recurring-pattern tags, counts, and evidence in the final result; never edit `AGENTS.md`, alter skill
instructions, or create follow-up issues automatically.

## Required report

Report one issue only, including:

- selection mode, repository/provider, issue URL/number, and ready-label
  evidence;
- whether automatic lifecycle claimed the issue or the concurrency limitation
  when it did not;
- implementation agent status, branch/worktree, base commit, commits, changed
  files, and verification results;
- PR creation policy, draft PR URL/number if created, and each review pass with
  its comment URL or local-review reason;
- remediation count, final approval status, recurring-pattern tags and
  evidence, promotion result and verified `draft: false` when approved; and
- the final state: promoted and awaiting human merge, unresolved and in
  progress, blocked, needs discovery, or no eligible issue.

Never report a merge, implemented label, or completed lifecycle unless this
invocation actually verified it. The PR remains open after promotion; merge
reconciliation belongs to existing lifecycle tooling.
