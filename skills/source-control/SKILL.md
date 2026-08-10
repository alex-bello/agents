---
name: source-control
version: 1.1.0
description: Use Git for local source-control operations and one deterministic command interface for Forgejo and GitHub repository, issue, and pull-request operations. Use when an agent needs to inspect repository state, manage branches, list or view issues and pull requests, read comments or diffs, check CI, create, edit, or close an issue or pull request, comment, or check out a pull request.
---

# Source control

Use native `git` for operations built into Git. Use `scripts/sc` instead of
constructing `tea`, `gh`, or HTTP API commands for provider-level operations.
The wrapper detects Forgejo or GitHub, calls the corresponding CLI
noninteractively, and returns normalized JSON.

Git-native operations include status, diff, log, show, remotes, fetch, pull,
push, branch creation/listing, switch/checkout, add, commit, merge, rebase,
and tags. `scripts/sc` is for provider metadata and collaboration operations
such as issues, labels, pull requests, checks, and comments.

Use `scripts/sc issue edit <number> --add-label <name>` and
`--remove-label <name>` for label mutations. Repeat either option for multiple
labels; the wrapper translates these options to the native GitHub or Forgejo
CLI syntax.

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
- Do not improvise a provider CLI command when `scripts/sc` reports an
  unsupported operation. Explain the missing capability instead.
- Prefer `--body-file` over inline bodies. The wrapper intentionally rejects
  interactive input.
- Pass `--repo OWNER/NAME` when the target is not the current repository.
- Pass `--provider forgejo|github` when automatic detection is ambiguous.
- Treat `issue create`, `issue close`, `issue comment`, `pr create`, and `pr comment` as
  externally visible writes.
- Do not merge pull requests, delete, release, approve, reject, or resolve
  review threads with this skill. Those operations are outside the v1 contract.

## Verification

Use Git to create and switch local branches, then push them with Git before
using `scripts/sc pr create`. Pull-request checkout uses the existing
`pr checkout` operation because it
also fetches provider-hosted pull-request state.

Every successful command writes one JSON object to stdout. Verify that:

- `provider` is the expected provider;
- `operation` matches the requested operation;
- repository and item identifiers match the target; and
- write results contain a URL or an explicit success indication.

Exit code `0` means success. Other stable exit codes and recovery instructions
are documented in `references/command-contract.md`.
