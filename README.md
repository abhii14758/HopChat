# hopchat

[![npm version](https://img.shields.io/npm/v/hopchat.svg)](https://www.npmjs.com/package/hopchat)
[![CI](https://github.com/abhii14758/HopChat/actions/workflows/ci.yml/badge.svg)](https://github.com/abhii14758/HopChat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/hopchat.svg)](LICENSE)
[![node](https://img.shields.io/node/v/hopchat.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

The only npm-installable bridge between Claude Code and GitHub Copilot CLI — carries
your chat history into each tool's own native resume command, no Python runtime, no
copy-paste. Start a task in one CLI, continue it natively in another.

## Supported platforms (v1)

- GitHub Copilot CLI
- Claude Code

Both directions. More platforms can be added by dropping a `reader.js`/`writer.js` pair into `platforms/` (see `platforms/TEMPLATE/` and [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-new-platform) for the full checklist — this is the contribution hopchat most wants).

## Install

```bash
npm install -g hopchat
```

## Usage

```bash
hopchat list copilot-cli
hopchat list claude-code
hopchat migrate --from copilot-cli --to claude-code <chat-id>
hopchat platforms
hopchat --version
```

A `migrate` shows the chat's metadata (title, turn count, model, project path) up front, then a hopping rabbit mascot travels from the source platform's name to the target's, its speech bubble narrating each stage as it goes. It lands with a happy face and the resume command for the target tool (e.g. `claude --resume <new-id>`). Run that command and the target CLI loads the migrated chat as a normal, resumable session.

Respects the [`NO_COLOR`](https://no-color.org) convention and a `--no-color` flag; set `HOPCHAT_NO_ANIMATION=1` to skip animation delays (mainly useful for scripting/CI).

### Interactive mode

Run `hopchat` with no arguments for a menu-driven flow instead of typing `--from`/`--to`/a chat id by hand:

```bash
hopchat
```

Greets you with a pixel-art banner (the same hopchat rabbit as the non-interactive
mascot, natively rendered for each surface — a moving hop transition plays on both),
then walks through 4 steps, each with its own step indicator and keyboard-shortcut
hints: pick a source platform → pick a destination → browse the source's chats (type
to filter, arrow keys to scroll) → confirm. A brief "hopping" animation plays while the
migration lands, then you're dropped back into the same chat list to pick another one.
Escape exits from anywhere; the bare `q` shortcut works everywhere *except* the chat
browser, where typing is reserved for the filter search. A failed read or migration
shows a styled error screen instead of crashing. `hopchat --help`, `hopchat list`,
`hopchat migrate ...`, and `hopchat platforms` are unchanged and still work exactly as
documented above.

### Fidelity

Migration is **condensed fidelity**: user/assistant text is preserved exactly; tool calls (file edits, shell commands, sub-agent runs) are folded into the assistant's text as short narrations (e.g. `Called grep`) rather than replayed as structured tool calls.

This keeps the migrated chat loadable by the target platform's own resume command without needing to map every tool between platforms — Copilot's `ask_user` has no Claude Code equivalent, and vice versa, so full-fidelity tool replay would be lossy or fragile. Condensed text avoids that entirely while preserving the conversation's content and intent.

## How it works

Both Copilot CLI and Claude Code store sessions as local files in undocumented formats:

- Copilot CLI: `~/.copilot/session-state/<chat-id>/` (a `workspace.yaml` + an `events.jsonl` event log)
- Claude Code: `~/.claude/projects/<sanitized-cwd>/<session-id>.jsonl`

`hopchat` reads a source platform's session into a common intermediate representation (IR), then writes that IR into the target platform's own file format so its native resume command (`copilot --resume=<id>`, `claude --resume <id>`) picks it up. Each platform is an isolated reader/writer plugin behind a registry; adding a platform is one new folder, nothing in core changes.

Because the formats are undocumented and can change between CLI releases, `hopchat` ships a per-platform version-compatibility range (see each platform's `supported-versions.js`) and warns if the installed CLI can't be verified against it. Some CLIs (Copilot CLI in particular) take a couple of seconds just to print their own `--version`, so the checked version is cached to disk for 24 hours — the first `migrate` after install or an upgrade pays that cost once, not on every run.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including the checklist for
adding a new platform — hopchat's most-wanted contribution.

```bash
git clone https://github.com/abhii14758/HopChat.git
cd HopChat
npm install
npm test
```

Tests run against fixture session files under `test/fixtures/` — no live CLI install is required for the automated test suite. The one thing a fixture can't prove is whether the real target binary actually accepts a hopchat-written session, so the final validation of any new/changed writer is a manual live smoke test against the real CLI's `--resume`.

Releases are managed with [changesets](https://github.com/changesets/changesets) — run `npx changeset` alongside a PR that changes user-facing behavior; see `CHANGELOG.md` for release history.

### Project layout

```
hopchat/
├── cli.js                  # list / migrate / platforms / --version commands + interactive-mode launcher
├── cli-mascot.js           # hopping rabbit + speech bubble animation (non-interactive migrate)
├── cli-text-fx.js          # typewriter text effect helper
├── cli-pixel-art.js        # blocky pixel wordmark + mascot renderer (interactive mode)
├── ink/                    # interactive-mode screens (Banner, MiniHeader, SelectList, ConfirmPrompt, SuccessPanel, App)
├── core/
│   ├── ir-schema.js        # canonical IR shape + validation
│   ├── registry.js         # platform name -> {reader, writer, supportedVersions}
│   ├── migrate.js          # orchestrator: read -> validate -> format-version check -> write
│   ├── version-check.js    # installed-CLI version compatibility
│   └── contract-tests.js   # shared suite every reader/writer must pass
├── platforms/
│   ├── copilot-cli/        # reader + writer + supported-versions
│   ├── claude-code/        # reader + writer + supported-versions
│   ├── TEMPLATE/           # copy-and-fill skeleton for a new platform
│   └── README.md           # the full "adding a platform" reference
├── test/                   # unit, contract, and e2e round-trip tests
├── .github/                # CI, issue templates, PR template
├── CONTRIBUTING.md
└── CHANGELOG.md
```

## Contributing

Bug reports, feature requests, and especially new platform adapters are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

MIT — see [LICENSE](LICENSE).
