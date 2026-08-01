---
name: source-control
description: Use one deterministic command interface for routine Forgejo and GitHub repository, issue, and pull-request operations through tea or gh. Use when an agent needs to inspect repository state, list or view issues and pull requests, read comments or diffs, check CI, create, edit, or close an issue or pull request, comment, or check out a pull request.
---

# Source control

Use `scripts/sc` instead of constructing `tea`, `gh`, or HTTP API commands.
The wrapper detects Forgejo or GitHub, calls the corresponding CLI
noninteractively, and returns normalized JSON.

## Workflow

1. Run `scripts/sc provider` from the repository.
2. Run the narrowest read command that answers the request.
3. Read `references/command-contract.md` only when choosing arguments or
   interpreting failures.
4. Read `references/capability-matrix.md` only when an operation may differ
   between providers.
5. Before creating or changing anything visible to other people, confirm that
   the user requested that action. A request to inspect, diagnose, review, or
   summarize does not authorize a create or comment command.
6. Report the normalized result. Do not repeat a native CLI call merely to
   reformat its output.

## Rules

- Do not call `tea api`, `gh api`, `curl`, or provider MCP tools as a fallback.
- Do not improvise a native CLI command when `scripts/sc` reports an unsupported
  operation. Explain the missing capability instead.
- Prefer `--body-file` over inline bodies. The wrapper intentionally rejects
  interactive input.
- Pass `--repo OWNER/NAME` when the target is not the current repository.
- Pass `--provider forgejo|github` when automatic detection is ambiguous.
- Treat `issue create`, `issue close`, `issue comment`, `pr create`, and `pr comment` as
  externally visible writes.
- Do not merge pull requests, delete, release, approve, reject, or resolve
  review threads with this skill. Those operations are outside the v1 contract.

## Verification

Branch setup uses `branch create` where the provider supports it and
`branch checkout` locally. Pull-request creation and checkout use the existing
`pr` operations.

Every successful command writes one JSON object to stdout. Verify that:

- `provider` is the expected provider;
- `operation` matches the requested operation;
- repository and item identifiers match the target; and
- write results contain a URL or an explicit success indication.

Exit code `0` means success. Other stable exit codes and recovery instructions
are documented in `references/command-contract.md`.
