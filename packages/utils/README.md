# utils

Starter TypeScript library, kept as the template for future shared utilities.
It currently exports a single placeholder function (`fn()`); no app depends on
it yet.

Shared packages in this repo must stay app-agnostic and headless (no UI).
When a helper is needed by more than one app, put it here or in a new
`packages/<name>` workspace rather than importing across apps. See
[docs/architecture.md](../../docs/architecture.md).

## Development

From `packages/utils`:

```bash
vp test         # unit tests (vite-plus/test, in tests/)
vp pack         # build the library into dist/
vp pack --watch # rebuild on change
```

From the repo root: `vp run -r test` runs every workspace's tests, and
`bun run ready` is the full gate (lint, format, type check, tests, builds).
