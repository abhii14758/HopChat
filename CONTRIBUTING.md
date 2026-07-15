# Contributing to hopchat

Thanks for considering a contribution. hopchat is small, has no build step, and is
designed so the most useful contribution — adding support for another AI CLI — is a
mechanical, well-defined path rather than something you have to reverse-engineer from
the source.

## Quick start

```bash
git clone https://github.com/abhii14758/HopChat.git
cd HopChat
npm install
npm test
```

No build/transpile step: everything is plain CommonJS, including the Ink components
(`React.createElement` calls, not JSX) — see "A note on the Ink/React version pins"
below before proposing a dependency bump there.

Run the CLI locally without installing it globally:

```bash
node bin/hopchat.js --help
node bin/hopchat.js            # interactive mode (needs a real terminal)
```

## Architecture map

- **`core/registry.js`** — a name → `{ reader, writer, supportedVersions }` lookup.
  `supportedVersions` is optional; see "Adding a new platform" below.
- **`core/migrate.js`** — the orchestrator: `read → validate → write`. It holds **zero**
  platform-specific logic and never will — all format quirks belong in a platform's own
  `reader.js`/`writer.js`, not here.
- **`core/ir-schema.js`** — the canonical intermediate representation (IR) every
  reader must produce and every writer must consume. This is the contract a new
  platform's `reader.js` is validated against.
- **Condensed fidelity** (a deliberate design decision, not a limitation to "fix"):
  user/assistant text is preserved exactly; tool calls are folded into short text
  narrations on the assistant turn (e.g. `Called grep`), never replayed as structured
  `tool_use` blocks. This sidesteps the fact that most platforms' tools have no
  equivalent on another platform — a PR that tries to add structured tool-call replay
  is working against the architecture, not with it.

## Adding a new platform

This is the contribution hopchat most wants. The full, mechanical checklist:

1. Copy `platforms/TEMPLATE/` to `platforms/<your-platform-name>/`.
2. Implement `reader.js`: `listChats()` and `readChat(id)`, producing IR that
   validates against `core/ir-schema.js`. Look at `platforms/copilot-cli/reader.js` or
   `platforms/claude-code/reader.js` for worked examples.
3. Implement `writer.js`: `writeChat(ir)`, returning `{ newChatId, resumeCommand }`.
   Two invariants every existing writer follows and yours must too: always mint a
   **brand-new** session id/directory (never modify an existing one), and on any
   failure, delete whatever was partially written before re-throwing.
4. Add `supported-versions.js` — copy `platforms/TEMPLATE/supported-versions.js` and
   fill in the real CLI binary name and a version range you've actually tested against.
5. Register the platform. This is currently **two** edits, not one — both are easy to
   miss since only one is obvious from `platforms/TEMPLATE/`:
   - `cli.js`: add a `registerPlatform('your-platform', { reader, writer,
     supportedVersions })` call (and a `DISPLAY_NAMES` entry).
   - That's it as of this codebase's current shape — `supportedVersions` now lives on
     the registry entry itself rather than a second hardcoded map, so there's no longer
     a separate place to keep in sync.
6. Add fixtures under `test/fixtures/<your-platform-name>/` — small, redacted, realistic
   examples of your platform's real on-disk session format. Fixtures let the whole test
   suite run without a live install of any CLI.
7. Add `test/platforms/<your-platform-name>.test.js`, and wire your reader/writer into
   `test/contract.test.js` via `core/contract-tests.js`'s `runContractTests` — the same
   shared suite every platform runs through. Passing it is the mechanical "definition of
   done" for a new adapter: it checks `listChats()` doesn't throw on an empty/missing
   session directory, `readChat()` returns schema-valid IR, `readChat()` rejects a
   path-traversal id, and a full `writeChat → readChat` round trip preserves `cwd` and
   turn content.
8. Update `README.md`'s "Supported platforms" list.

None of this requires touching `core/`. If you find yourself editing `core/migrate.js`
or `core/ir-schema.js` to add a platform, something's off — open an issue first.

### A note on version checking

If your platform's session files embed a distinct schema-version marker (separate from
the CLI's own semver — see `platforms/copilot-cli/reader.js`'s `_sessionFormatVersion`,
sourced from its `session.start` event), capture it onto the IR the same way and set
`sessionFormatVersion` in your `supported-versions.js`. `core/migrate.js` will then
hard-fail with a named "format has changed" error on a mismatch instead of silently
misparsing a session written by an incompatible format version. Not every platform's
format exposes such a marker (Claude Code's doesn't) — that's fine, this check is a
no-op when the data isn't there, not something you're required to fabricate.

### Path-traversal guard

Chat ids reach your `readChat(id)` as a raw, untrusted string (typed by hand on
`hopchat migrate <chat-id>`, or picked from an enumerated list in interactive mode).
Reject ids containing `..` or a path separator before joining them into a filesystem
path — see `assertSafeChatId` in either existing reader for the ~4-line guard. The
shared contract suite tests for this automatically, but the guard itself is on you to
add.

## Testing

- `npm test` runs everything (`node --test`, no test-framework dependency).
- Tests run entirely against fixtures under `test/fixtures/` — no live CLI install is
  required.
- The one thing a fixture can't prove is whether the real target binary actually
  accepts a hopchat-written session. Before opening a PR that adds or changes a
  **writer**, do a manual live smoke test: run a real migration, then actually run the
  target platform's own resume command and confirm it loads. Note in your PR
  description that you did this (the PR template asks for it).

## Commit messages

Loosely [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`,
`docs:`, `chore:`, `refactor:`, `test:` — optionally scoped by platform name (e.g.
`feat(claude-code): ...`). This is already how most of the project's history looks;
there's no commit-lint bot enforcing it, just a convention PR review checks for.

## A note on the Ink/React version pins

`package.json` deliberately pins `ink@^3` and `react@^17`, not the current major of
either. Ink 4+ is ESM-only, which would force converting this whole project off
CommonJS — a real cost this project hasn't decided to pay. A PR that bumps these as a
routine dependency update will be declined; a PR that proposes the ESM migration as its
own explicit, discussed change is a different conversation and welcome as an issue
first.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
