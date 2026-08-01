# Capability matrix

The v1 contract targets behavior confirmed for `tea` 0.14 and `gh` 2.96.

| Capability | Forgejo (`tea`) | GitHub (`gh`) |
| --- | --- | --- |
| Detect provider from Git remote | yes | yes |
| Authentication status | yes | yes |
| Repository view | yes | yes |
| Issue list/view/comments | yes | yes |
| Issue create/edit/close/comment | yes | yes |
| Pull-request list/view/comments | yes | yes |
| Pull-request diff | yes | yes |
| Pull-request checks | from pull `ci` data | `pr checks` |
| Pull-request create/comment | yes | yes |
| Pull-request checkout | yes | yes |
| Pull-request merge/close; issue delete; release | intentionally unsupported | intentionally unsupported |
| Review-thread mutation | intentionally unsupported | intentionally unsupported |

`pr checks` cannot provide perfectly identical detail: GitHub exposes individual
check runs, while Forgejo's CLI exposes the pull request's CI data. Consumers
must use the normalized `name`, `state`, `url`, and `workflow` fields when
present and must tolerate absent fields.

Provider detection recognizes `github.com` as GitHub. Other hosts are treated as
Forgejo only when their hostname appears in `tea logins list --output json`.
Pass `--provider` for GitHub Enterprise, aliases, mirrors, or ambiguous remotes.
