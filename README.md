# hopchat

Migrate AI CLI chat sessions between tools — start a task in one CLI, continue it natively in another.

## Supported platforms (v1)

- GitHub Copilot CLI
- Claude Code

Both directions. More platforms can be added by dropping a `reader.js`/`writer.js` pair into `platforms/` (see `platforms/TEMPLATE/`).

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
```

A `migrate` shows the chat's metadata (title, turn count, model, project path) up front, a progress bar while the migration runs, then the resume command for the target tool (e.g. `claude --resume <new-id>`). Run that command and the target CLI loads the migrated chat as a normal, resumable session.

### Fidelity

Migration is **condensed fidelity**: user/assistant text is preserved exactly; tool calls (file edits, shell commands, sub-agent runs) are folded into the assistant's text as short narrations (e.g. `Called grep`) rather than replayed as structured tool calls.

This keeps the migrated chat loadable by the target platform's own resume command without needing to map every tool between platforms — Copilot's `ask_user` has no Claude Code equivalent, and vice versa, so full-fidelity tool replay would be lossy or fragile. Condensed text avoids that entirely while preserving the conversation's content and intent.

## How it works

Both Copilot CLI and Claude Code store sessions as local files in undocumented formats:

- Copilot CLI: `~/.copilot/session-state/<chat-id>/` (a `workspace.yaml` + an `events.jsonl` event log)
- Claude Code: `~/.claude/projects/<sanitized-cwd>/<session-id>.jsonl`

`hopchat` reads a source platform's session into a common intermediate representation (IR), then writes that IR into the target platform's own file format so its native resume command (`copilot --resume=<id>`, `claude --resume <id>`) picks it up. Each platform is an isolated reader/writer plugin behind a registry; adding a platform is one new folder, nothing in core changes.

Because the formats are undocumented and can change between CLI releases, `hopchat` ships a per-platform version-compatibility range (see each platform's `supported-versions.js`) and warns if the installed CLI can't be verified against it.

## Development

```bash
git clone https://github.com/abhii14758/HopChat.git
cd HopChat
npm test
```

Tests run against fixture session files under `test/fixtures/` — no live CLI install is required for the automated test suite. The one thing a fixture can't prove is whether the real target binary actually accepts a hopchat-written session, so the final validation of any new/changed writer is a manual live smoke test against the real CLI's `--resume`.

### Project layout

```
hopchat/
├── cli.js                  # list / migrate / platforms commands
├── core/
│   ├── ir-schema.js        # canonical IR shape + validation
│   ├── registry.js         # platform name -> {reader, writer}
│   ├── migrate.js          # orchestrator: read -> validate -> write
│   ├── version-check.js    # installed-CLI version compatibility
│   └── contract-tests.js   # shared suite every reader/writer must pass
├── platforms/
│   ├── copilot-cli/        # reader + writer + supported-versions
│   ├── claude-code/        # reader + writer + supported-versions
│   └── TEMPLATE/           # copy-and-fill skeleton for a new platform
└── test/                   # unit, contract, and e2e round-trip tests
```

## License

MIT
