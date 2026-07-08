# hopchat — CLI Chat Migration Tool

**Date**: 2026-07-08
**Status**: Approved (v1 scope)

## Problem

AI CLI coding assistants (GitHub Copilot CLI, Claude Code, and others) each store chat
sessions locally in their own undocumented format. There is no way to move a chat from
one tool to another — a user who starts a task in Copilot CLI and wants to continue in
Claude Code (or vice versa) has to manually re-explain context from scratch.

## Goal

A CLI tool, `hopchat`, that migrates a chat session from one supported platform to
another, writing it into the target platform's own local session storage so that
platform's native resume mechanism (`copilot --resume=<id>`, `claude --resume`, etc.)
picks it up and the user can continue the conversation as if it had started there.

## Scope (v1)

- Platforms: **GitHub Copilot CLI** and **Claude Code**, bidirectional.
- Designed for easy extension to more CLI platforms (Gemini CLI, Codex, etc.) after v1.
- Fidelity: **condensed**. Real user/assistant text turns are preserved exactly. Tool
  calls (file edits, shell commands, sub-agent runs) are narrated as short text
  descriptions folded into the assistant's turn, not replayed as structured tool-call
  blocks. This avoids the tool-mapping problem (many tools have no equivalent on the
  other platform) and keeps the target session in a format its own resume logic already
  understands natively.
- Distribution: cross-platform npm package (`npm i -g hopchat`), Node-based.

## Out of scope (v1)

- Full-fidelity tool-call replay (structured tool_use blocks reconstructed on target).
- Web app / SaaS version.
- IDE extension.
- Platforms beyond Copilot CLI and Claude Code (architecture must not block adding them
  later, but no additional readers/writers ship in v1).

## Architecture

```
hopchat/
├── cli.js                 # entry: list, migrate, platforms commands
├── core/
│   ├── ir-schema.js        # canonical IR shape + validation
│   ├── registry.js         # maps platform name -> {reader, writer}
│   ├── migrate.js          # orchestrator: read -> IR -> write, zero platform logic
│   └── contract-tests.js   # shared test suite every reader/writer must pass
├── platforms/
│   ├── TEMPLATE/
│   │   ├── reader.js       # skeleton with TODOs
│   │   └── writer.js       # skeleton with TODOs
│   ├── copilot-cli/
│   │   ├── reader.js       # scan ~/.copilot/session-state/*, parse events.jsonl -> IR
│   │   ├── writer.js       # IR -> events.jsonl + workspace.yaml + session.db
│   │   └── supported-versions.js
│   └── claude-code/
│       ├── reader.js       # scan ~/.claude/projects/*, parse transcript -> IR
│       ├── writer.js       # IR -> Claude Code's session jsonl format
│       └── supported-versions.js
└── package.json
```

Core (`migrate.js`) only ever calls `readers[from].readChat(id)` and
`writers[to].writeChat(ir)` via the registry — it holds no platform-specific logic.
All format quirks are isolated inside each platform's plugin folder. Adding platform #5
later means adding one new folder under `platforms/`, registering it, and nothing else
in the codebase changes.

## Intermediate Representation (IR)

```js
{
  sourcePlatform: "copilot-cli",
  sourceChatId: "8910cf9b-...",
  title: "Plan Workflow Builder Microservice",
  cwd: "C:\\Users\\...\\mybot_frontend",
  gitBranch: "dev_abhi_ifp",
  model: "claude-sonnet-4.6",
  createdAt: "2026-07-03T05:38:53.780Z",
  updatedAt: "2026-07-08T04:38:37.689Z",
  turns: [
    { role: "user", text: "..." },
    {
      role: "assistant",
      text: "...",
      toolNarrations: ["Ran grep for X", "Edited src/foo.js"]
    }
  ]
}
```

`toolNarrations` are condensed one-line summaries built from the source platform's
tool-call events. The writer folds them into the assistant turn's text — they are never
written as structured tool_use blocks on the target side.

## Reader / Writer Interface

```js
// every platform's reader.js exports:
{
  listChats() -> [{ id, title, updatedAt, cwd }]
  readChat(id) -> IR
}

// every platform's writer.js exports:
{
  writeChat(ir) -> { newChatId, resumeCommand }
}
```

## CLI Commands

```
hopchat list <platform>
  → table: id | title | updatedAt | cwd

hopchat migrate --from <platform> --to <platform> <chat-id>
  → validates both platforms are registered
  → reader.readChat(id) -> IR
  → writer.writeChat(IR)
  → prints resumeCommand (e.g. "claude --resume=<new-id>")

hopchat platforms
  → lists all registered platform names
```

## Error Handling / Format-Drift Risk

Both source formats are undocumented internals. The biggest real risk is a platform
updating its storage schema and silently breaking a reader or writer. Mitigations:

1. **Installed CLI version check** — shell out to `copilot --version` / `claude
   --version`, compare against a small compatibility range each platform plugin ships
   (`supportedVersions: ["1.0.60", "1.0.70"]`). Mismatch → warn and mark output
   "unverified," still attempt the parse.
2. **Embedded session-format version check** — the authoritative check. Read the
   version field inside the session file itself (e.g. Copilot's `session.start` event
   has `"version":1`). Unknown version → hard error naming the expected vs. found
   version, not a silent bad parse.
3. **Dry-run before writing** — the source chat is fully parsed into IR before the
   target is touched at all. Parse failure = target platform untouched.
4. **Non-destructive writes** — the writer always creates a brand-new session directory
   / ID on the target platform; it never modifies an existing session. A failed write
   leaves a partial new directory, which `hopchat` cleans up and reports as a failure —
   the target platform's existing sessions are never put at risk.

Compatibility ranges live inside each platform plugin (`supported-versions.js`), so
bumping support for a new release means editing one small file, not touching core.

## Testing

- **Unit** — each reader/writer tested against redacted fixture files (real captured
  `events.jsonl` / transcript samples). No live CLI install required to run the suite.
- **Contract tests** — `core/contract-tests.js` runs against every registered platform
  in CI: valid IR shape returned, `listChats()` doesn't crash on an empty/missing
  session directory, round-trip doesn't drop required fields. Anyone adding a new
  platform runs this once to know their plugin is wired correctly.
- **Round-trip test** — Copilot → Claude Code → Copilot on a fixture chat, diff the
  turn text before/after. Catches silent data loss introduced by the condensed-
  narration step.
- **Live smoke test (manual, not CI)** — run a real migration on an actual local chat,
  then actually execute the target platform's own resume command and confirm it loads.
  This is the only check that proves the reverse-engineered format still matches the
  real binary's expectations.

## Naming

Product name: **hopchat**. npm package and CLI binary both named `hopchat`.
