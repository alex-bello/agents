---
name: sdlc-wayfinder
version: 1.0.0
description: Lead planning and requirements analysis from a raw idea to one approved, issue-backed SDLC feature specification.
---

# SDLC Wayfinder

Guide the user from an underspecified idea to an approved requirements record.
Use the shared `sdlc` contract and validate `.sdlc.yml` before asking refinement
questions.

## Planning conversation

Read `AGENTS.md`, `README.md`, `SDLC.md`, and relevant application code or
documentation when repository evidence can answer a question. Ask small batches
of questions that can change the user, problem, outcome, behavior, scope,
permissions, data, reliability, security, acceptance, or sequencing.

Produce a complete requirements specification containing outcome, scope and
non-goals, user behavior, alternate/error states, functional and
non-functional requirements, acceptance criteria, verification strategy, risks,
decisions, deferred work, and immediate next action.

Planning and requirements require explicit human approval. Do not create an
issue while the requirements are still under discussion.

## Feature issue creation

After approval, show the exact title, repository, labels, and complete body.
Create exactly one feature issue labeled `sdlc`, `sdlc-feature`, and
`sdlc-requirements` after explicit confirmation. Use `sc issue create
--body-file` with a managed temporary file, verify the normalized result, and
leave the complete specification recoverable if creation fails.

The body must contain one strict block:

```md
<!-- sdlc-record
schema: 1
kind: feature
phase: requirements
status: requirements-approved
flavor: thin-slice
children: []
dependencies: []
run_id: null
-->
```

Do not create child issues in this skill. Child generation belongs to
`sdlc-design` after design approval.

## Failure handling

Do not invent labels, requirements, provider operations, or child records. On
provider, configuration, or payload failure, stop without retrying through
another interface and report the exact remediation.
