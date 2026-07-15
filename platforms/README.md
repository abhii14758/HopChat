# platforms/

Each subfolder here is an isolated reader/writer plugin for one AI CLI tool.
`core/migrate.js` never contains platform-specific logic — everything that knows
about a specific tool's on-disk format lives in that tool's own folder.

## Layout

```
platforms/
├── copilot-cli/        # reader + writer + supported-versions for GitHub Copilot CLI
├── claude-code/         # reader + writer + supported-versions for Claude Code
└── TEMPLATE/            # copy-and-fill skeleton for a new platform
```

Each real platform folder has three files:

| File | Job |
|---|---|
| `reader.js` | `listChats()` → `[{id, title, updatedAt, cwd}]`; `readChat(id)` → IR (see `core/ir-schema.js`) |
| `writer.js` | `writeChat(ir)` → `{ newChatId, resumeCommand }` |
| `supported-versions.js` | `{ command, range: [min, max], sessionFormatVersion? }` |

## Adding a new platform

See [`CONTRIBUTING.md`](../CONTRIBUTING.md#adding-a-new-platform) at the repo root for
the full numbered checklist. Short version: copy `TEMPLATE/`, implement the two
functions in `reader.js` and the one in `writer.js`, add `supported-versions.js`,
register in `cli.js`, add fixtures and a test file, run `core/contract-tests.js`'s
shared suite against your new platform via `test/contract.test.js`.

## Why a shared contract suite instead of trusting each platform's own tests

`core/contract-tests.js` runs the identical assertions against every registered
platform: `listChats()` doesn't throw on a missing/empty session directory,
`readChat()` returns schema-valid IR, `readChat()` rejects a path-traversal chat id,
and a full `writeChat → readChat` round trip preserves `cwd` and turn content. Passing
it is what proves a new adapter is wired correctly — it's mechanical, not subjective,
so a maintainer reviewing a new-platform PR has a clear pass/fail bar instead of having
to manually reason about a format they may not know either.

## Two things every reader must get right that aren't obvious from `TEMPLATE/`

1. **Reject unsafe chat ids.** A chat id reaches `readChat(id)` as a raw string typed
   on the command line — never join it into a filesystem path without first rejecting
   `..` and path separators. See `assertSafeChatId` in either real reader.
2. **A malformed/truncated session line shouldn't crash the whole parse.** Real session
   files can pick up a stray partial line if the source CLI is killed mid-write — wrap
   per-line `JSON.parse` in try/catch and skip the bad line, don't let it propagate.

## Two things every writer must get right

1. **Always mint a brand-new session id/directory.** Never modify an existing session
   — a failed or buggy write must never be able to corrupt a real, existing chat on the
   target platform.
2. **Clean up on failure.** If `writeChat` fails partway through, delete whatever was
   partially written before re-throwing, so a failed migration doesn't leave orphaned
   files behind.
