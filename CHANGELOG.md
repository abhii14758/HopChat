# Changelog

## 0.5.0

### Minor Changes

- e996ec2: Interactive mode: fixed the "q" key exiting the app while typing in the chat-browser
  filter (Escape still exits from anywhere), added a styled error screen instead of an
  uncaught crash on a failed read/migrate, wired the same advisory version-compatibility
  check the non-interactive `migrate` already had into the confirm step, and added a step
  indicator with keyboard-shortcut hints to every screen.

  CLI: fixed `--no-color` swallowing the next argument (e.g. a chat id) instead of acting
  as a boolean flag, added `NO_COLOR` environment variable support, added `--version`/`-v`,
  and `hopchat platforms` now shows each platform's full display name and local chat count
  instead of two bare identifiers.

- e996ec2: Added a hard error when a source session's embedded format-version marker doesn't match
  what hopchat's reader was built against (active today for copilot-cli; a no-op for
  platforms without such a marker), instead of silently misparsing a session written by an
  incompatible CLI version.

  Chat ids are now validated before being used in a filesystem path, closing a local
  path-traversal read primitive in `hopchat migrate <chat-id>`. A malformed line in a
  Copilot CLI session file is now skipped instead of crashing the whole read.

### Patch Changes

- e996ec2: Redesigned the interactive-mode mascot bitmap to match the wordmark's height (it
  previously rendered more than twice as tall, producing an oversized banner) and fixed
  the root layout box expanding to the terminal's full width instead of shrinking to its
  content.

All notable changes to this project are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Entries for `0.1.0`–`0.4.0` are reconstructed from git history (this file didn't exist
yet at the time). Going forward, release notes are generated from `.changeset/` entries
— see the "Development" section of `README.md`.

## [Unreleased]

### Added

- `--version`/`-v` flag; `hopchat --help` now shows the real installed version instead
  of a hardcoded string.
- `hopchat platforms` now shows each platform's full display name and local chat count.
- A styled error screen in interactive mode, instead of an unhandled crash.
- A step indicator and keyboard-shortcut hints on every interactive screen.
- A brief "hopping" transition between confirming and completing an interactive
  migration.
- `NO_COLOR` environment variable support.
- Interactive mode's migrate now runs the same advisory version-compatibility check
  the non-interactive `migrate` command already did.
- A hard error when a source session's embedded format version doesn't match what
  hopchat's reader was built against (currently active for copilot-cli).
- `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR
  templates, and CI.

### Fixed

- Interactive mode: pressing "q" while filtering the chat list no longer exits the app.
- `--no-color` no longer consumes the next command-line argument.
- A malformed line in a Copilot CLI session file no longer crashes the whole read.
- Chat ids are validated before being used in a filesystem path.

## [0.4.0] - 2026-07-09

### Added

- Interactive Ink-based TUI mode for bare `hopchat` (7-screen flow: greeting, select
  source, select destination, browse/filter chats, confirm, success, exit).
- Original pixel-art wordmark and mascot renderer for the interactive mode.

## [0.3.1] - 2026-07-08

### Added

- Non-interactive hopping-rabbit mascot animation and typewriter text effect for
  `migrate`.

## [0.2.0] - 2026-07-08

### Added

- Installed-CLI version-compatibility check with a 24-hour on-disk cache.

## [0.1.1] - 2026-07-08

### Fixed

- Early packaging fixes.

## [0.1.0] - 2026-07-08

### Added

- Initial release: `list`, `migrate --from --to`, and `platforms` commands for
  GitHub Copilot CLI ⇄ Claude Code, condensed-fidelity migration.
