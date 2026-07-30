---
name: thin-slice-planning
description: Turn a product, system, or feature idea into the smallest complete, demonstrable deliverable and a prioritized set of follow-up tickets. Use when a user wants to get an idea moving without losing important requirements to an oversized specification.
---

# Thin-slice planning

Plan the smallest complete deliverable that proves an idea works for a real
user. Keep the first slice narrow, end-to-end, and shippable in an appropriate
environment. Preserve important concerns by making them explicit follow-up work
rather than silently dropping them or adding them to the initial scope.

## Input

Accept an idea, desired outcome, or rough project description. The request may
be as short as: “I want to make an agent harness from scratch.”

Use information already supplied by the user and repository before asking
questions. Ask only questions whose answers would materially change the first
deliverable, such as the intended user, a mandatory integration, a hard
constraint, or what constitutes proof that it works. If those details are
unknown, state the assumption and choose the smallest reversible option.

## Core rules

1. Define success as one observable user outcome, not a list of capabilities.
   A user must be able to start, complete, and observe the value of the slice.
2. Include the complete path required for that outcome: input, core behavior,
   usable output, and a way to verify it. Do not propose a disconnected
   prototype, architecture-only work, or a collection of stubs as the first
   deliverable.
3. Treat constraints as in-scope only when the first slice cannot safely or
   honestly work without them. Examples include legal obligations, irreversible
   data-loss protection, essential authentication, and a user-stated hard
   requirement.
4. Prefer a local, manual, single-user, or mocked boundary when it proves the
   same core value. Do not add scale, automation, configurability, abstraction,
   multi-tenancy, integrations, dashboards, analytics, or production operations
   unless they are necessary to the first user outcome.
5. Never discard a meaningful requirement merely to reduce scope. Move it to a
   follow-up ticket, identify its dependency or risk, and explain why it is not
   needed in the first slice.
6. Avoid speculative design. Name only the components, interfaces, and data
   structures required to implement the slice. Prefer a simple implementation
   that can be replaced once real usage teaches something new.

## Workflow

1. Restate the idea as a single outcome in this form:

   `A <specific user> can <complete one action> and observe <valuable result>.`

   If the user or result is unknown, make the narrowest reasonable assumption
   and label it.

2. Identify the essential path. List only the minimum steps from the user’s
   input to the observable result. Remove each item that can be deferred without
   breaking that path.

3. Write a first-deliverable boundary with three short lists:

   - **In scope:** the necessary capabilities and implementation constraints.
   - **Explicitly out of scope:** tempting additions deliberately deferred.
   - **Assumptions:** decisions made because information was absent.

4. Test completeness. Confirm that the slice has all of the following:

   - A clear user or operator.
   - A real input and a visible result.
   - One end-to-end happy path that can be demonstrated.
   - A concrete acceptance check that someone can perform.
   - Safe handling of any material failure mode that would make the demo
     misleading, unsafe, or destructive.

   If any condition is absent, add only what is needed to satisfy it.

5. Produce a compact implementation plan. Split it into the fewest ordered
   tasks that each produce a checkable artifact or behavior. Do not turn each
   file, class, or configuration value into a separate task unless it can be
   independently assigned or verified.

6. Convert deferred concerns into follow-up tickets. Each ticket must include:

   - A concise title.
   - Why it matters.
   - The trigger for doing it (for example, “before external users,” “when
     connecting a second provider,” or “after three manual runs”).
   - Dependencies or risk, if applicable.

   Group tickets into **next**, **before broader release**, and **later**. Put
   security, privacy, compliance, reliability, observability, and scalability
   in the appropriate group based on the actual exposure and trigger; do not
   imply that they are unimportant.

7. End with one recommendation for the immediate next action: the smallest
   implementation or validation task that begins the slice.

## Required output

Use this structure, adapting its length to the idea:

```md
## Smallest complete deliverable

**Outcome:** A ... can ... and observe ...

### Scope

- In scope: ...
- Explicitly out of scope: ...
- Assumptions: ...

### Acceptance check

1. ...
2. ...
3. ...

### Implementation tasks

1. ...
2. ...

## Follow-up tickets

### Next

- **[Title]** — Why it matters; trigger; dependency/risk.

### Before broader release

- ...

### Later

- ...

## Start here

...
```

Keep the first deliverable and its task list short enough that a small team or
one developer could start immediately. If it cannot be described clearly,
identify the one uncertainty blocking a thin slice and ask a focused question.

## Example

For “make an agent harness from scratch,” do not begin with a multi-agent
orchestrator, pluggable providers, durable queues, a web dashboard, or a full
evaluation platform. A valid first slice could let one operator submit one
prompt through a command-line command, run it through one configured model,
persist the transcript locally, and inspect the final result. Provider
abstraction, tool execution, retries, evaluations, a UI, multi-user access,
and deployment would become explicitly prioritized tickets unless the user has
made one of them mandatory.

## Failure handling

- If the user asks for a comprehensive specification, use this skill only when
  they also want a smallest viable first delivery; otherwise plan the requested
  comprehensive scope.
- If the proposed first slice cannot meet a legal, safety, security, privacy,
  or data-integrity requirement, make that requirement in-scope and say why.
- If a hard requirement makes a thin slice impractical, say so plainly, present
  the smallest compliant alternative, and list the constraint that caused the
  expansion.
