---
name: thin-slice-wayfinder
description: Lead an iterative product and engineering discovery conversation, then turn a fully refined idea into a detailed thin-slice specification saved as one repository issue. Use when a user has a rough software idea and wants gaps identified, decisions made, and implementation work organized before coding.
---

# Wayfinder: idea to implementation-ready specification

Guide the user from an underspecified idea to one approved, issue-backed
specification. Combine small, testable engineering changes with thin-slice
thinking: preserve the complete intended outcome, but divide delivery into
the smallest useful, human-verifiable increments.

This skill owns discovery and specification. Use the `thin-slice` skill for its
planning principles and the `source-control` skill for repository issue
operations. Do not create an issue until the user has reviewed the proposed
spec and explicitly confirms the exact title and repository write.

## 1. Establish context

Read applicable `AGENTS.md`, `README.md`, and relevant local skills. Inspect the
repository read-only when that can answer a question more reliably than asking
the user. Identify the repository and issue provider.

Restate the idea as:

`A <specific user> can <complete one action> and observe <valuable result>.`

If the user, result, or repository is unknown, ask about it. Do not invent a
material product decision merely to keep moving.

## 2. Run the discovery conversation

Ask follow-up questions in small batches, normally no more than three at a
time. Each question must close a gap that could change behavior, scope,
acceptance, risk, architecture, or sequencing. Keep a running decision log.

Cover these areas as applicable:

- user, problem, desired outcome, and evidence of value;
- primary happy path from input to observable result;
- boundaries, permissions, roles, and failure states;
- data ownership, persistence, privacy, security, and destructive actions;
- external systems, environment constraints, and compatibility;
- performance, reliability, accessibility, and operational expectations;
- how a person can demonstrate or test the result;
- what is deferred and what event would make it necessary.

Use repository evidence to avoid asking about existing conventions, but ask the
user about product intent and unknown business rules. Stop asking questions
once remaining unknowns can be handled as reversible, clearly labeled
assumptions. Summarize the understanding and assumptions before drafting.

## 3. Draft the specification

Produce one complete Markdown specification with these sections:

1. **Outcome** — user, problem, and valuable result.
2. **Scope boundary** — in scope, explicitly out of scope, and assumptions.
3. **User experience and behavior** — happy path, alternate paths, validation,
   errors, permissions, and empty/loading states.
4. **Requirements** — numbered functional and non-functional requirements;
   each must be observable or testable.
5. **Thin-slice implementation plan** — dependency-ordered feature groups.
   Every item is a `- [ ]` checkbox with one primary purpose, changed
   behavior/artifact, and a human-verifiable acceptance check. The first item
   must form a complete demonstrable path, not an architecture-only stub.
6. **Verification strategy** — manual demonstration plus focused automated
   checks where appropriate, including failure and boundary cases.
7. **Risks and decisions** — decision, rationale, alternatives rejected, and
   unresolved risks.
8. **Follow-up work** — grouped as next, before broader release, and later;
   include why it matters and its trigger.
9. **Immediate next action** — the smallest safe implementation or validation
   step.

Before presenting it, check for one clear user and observable result, a
complete happy path, performable acceptance criteria, no unjustified
speculation, and appropriate placement of security, privacy, integrity, and
safety work. If a check fails, ask the smallest question needed to repair it;
do not silently broaden scope.

## 4. Review and save as an issue

Present the full draft and assumptions for correction. Incorporate feedback and
repeat the completeness checks until the user accepts the content.

Immediately before writing, show the exact issue title, repository/provider,
labels, and that exactly one issue will be created with no child issues or
comments. Ask for explicit confirmation of that exact operation.

After confirmation, follow `source-control`: run `scripts/sc provider`, use a
temporary body file, and invoke `scripts/sc issue create --body-file`. Never
call `gh`, `tea`, a raw API, or a provider connector directly. Verify the
normalized result has the expected provider, repository, operation, number, and
URL.

Use existing labels only. Do not assume labels can be created. Do not create
child issues as part of this skill; offer that later through `thin-slice`.

Append this metadata block to the issue body:

```md
<!-- thin-slice-wayfinder-spec
schema: 1
kind: specification
status: refined
source: thin-slice-wayfinder
labels: [thin-slice-wayfinder, thin-slice]
-->
```

## Output and failure handling

Before creation, return the current spec in the conversation so it is
reviewable and recoverable. After success, report the issue number and URL and
retain the immediate next action.

If provider detection, authentication, label handling, or issue creation fails,
do not retry through another interface or claim success. Preserve the final
Markdown spec, report the exact failure, and state the single remediation
needed. If the user declines, leave the spec in the conversation and perform
no remote mutation.
