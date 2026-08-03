# Command contract

Run provider commands as:

```sh
scripts/sc [global options] <resource> <action> [arguments]
```

Global options must precede the resource:

| Option | Meaning |
| --- | --- |
| `--provider auto\|forgejo\|github` | Override provider detection |
| `--repo OWNER/NAME` | Target a repository other than the current repository |
| `--remote NAME` | Select the Git remote used for detection; default `origin` |
| `--limit N` | Maximum list results; default `30`, maximum `100` |

## Commands

| Command | Required arguments | Optional arguments |
| --- | --- | --- |
| `provider` | none | none |
| `capabilities` | none | none |
| `auth status` | none | none |
| `repo view` | none | none |
| `label list` | none | none |
| `label create` | `--name TEXT` | `--color HEX`, `--description TEXT` |
| `issue list` | none | `--state open\|closed\|all`, repeated `--label NAME` |
| `issue view` | `NUMBER` | none |
| `issue comments` | `NUMBER` | none |
| `issue create` | `--title TEXT`, `--body-file PATH` | repeated `--label NAME` |
| `issue edit` | `NUMBER`, `--body-file PATH` | none |
| `issue close` | `NUMBER` | none |
| `issue comment` | `NUMBER`, `--body-file PATH` | none |
| `pr list` | none | `--state open\|closed\|all` |
| `pr view` | `NUMBER` | none |
| `pr comments` | `NUMBER` | none |
| `pr edit` | `NUMBER`, `--body-file PATH` | none |
| `pr diff` | `NUMBER` | none |
| `pr checks` | `NUMBER` | none |
| `pr create` | `--base BRANCH`, `--head BRANCH`, `--title TEXT`, `--body-file PATH` | `--draft`, repeated `--label NAME` |
| `pr comment` | `NUMBER`, `--body-file PATH` | none |
| `pr checkout` | `NUMBER` | none |

Create, edit, close, and comment commands are externally visible writes. Checkout
changes the local worktree. Use them only when the user's request authorizes the
effect.

## Output

The wrapper writes exactly one JSON object to stdout:

```json
{
  "provider": "github",
  "operation": "issue.list",
  "repository": "owner/name",
  "items": []
}
```

Common item fields are `number`, `title`, `body`, `state`, `author`, `url`,
`labels`, `createdAt`, and `updatedAt`. Fields unavailable from a provider are
`null` or omitted. Provider-specific response objects are not exposed.

`pr diff` is JSON with a `diff` string. `auth status` contains
`authenticated`. Create, edit, and comment operations contain `success` and,
when the native CLI returns one, `url`. Issue close contains `number` and
`success`.

## Exit codes

| Code | Meaning | Recovery |
| --- | --- | --- |
| `0` | Success | none |
| `2` | Invalid command or arguments | correct the invocation |
| `3` | Provider could not be detected | pass `--provider` |
| `4` | Unsupported operation or capability | report the limitation |
| `5` | Required executable or file is missing | install/configure it or correct the path |
| `6` | Authentication failed | authenticate the selected native CLI |
| `7` | Native CLI command failed | read stderr; do not fall back to a raw API |
| `8` | Native output could not be normalized | report the incompatible output |

Diagnostics go to stderr. Credentials and authenticated remote URLs must never
be included in stdout.
