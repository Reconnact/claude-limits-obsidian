# claude-limits-obsidian

## Workflow

- Every change belongs to a GitHub issue; open one first. A small fix found along the way goes into the same branch and is named in the PR description.
- Work on a branch `<issue-nr>-<short-slug>`, never on `main`.
- Once `make test` passes, open a pull request with `Closes #<nr>` and request a review from @Reconnact, who merges. Don't merge your own.
- Commits, issues and PRs are in English. A commit message is one sentence that says what changes and why, see `git log`.

## What the plugin relies on in the page

`main.js` puts `index.html` and `limits.js` from a [claude-limits](https://github.com/Reconnact/claude-limits) clone (on the Mac) or their copy in the vault (on the phone) into an iframe's `srcdoc`. A change in claude-limits to any of these breaks the view or the code block:

- strings rewritten in `index.html` (`page()`): `<script src="limits.js"></script>`, every `new URLSearchParams(location.search)`, and `history.replaceState(null, '', a.href);`
- the loader: one `<script>` per data file, added through `document.head.append` once its `onload` and `onerror` are set; the shim finds the file by the last path segment of its `src` before `?`
- `Limits.render`, wrapped to restore the scroll position, and a global `refresh()`, called when new data arrives
- `nav a[href]` links whose `href` is the page's query, starting with `?`
- selectors a code block hides or restyles: `main`, `.tiles`, `.controls`, `.navs`, `figure`, `.projects`, `#split`
- the chart's height as `clamp(…, …vh, …)`, which a code block cuts down to its minimum

A new dependency on the page goes here and into the list in claude-limits' CLAUDE.md. `make test` reads the page from a claude-limits clone, `~/claude-limits` unless `CLAUDE_LIMITS_REPO` says otherwise; it catches the strings, not the selectors.
