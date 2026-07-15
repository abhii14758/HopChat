# Changelog

All notable changes to this project are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Entries for `0.1.0`–`0.4.0` are reconstructed from git history (this file didn't exist
yet at the time). Going forward, release notes are generated from `.changeset/` entries
— see the "Development" section of `README.md`.

## [0.5.0] - 2026-07-15

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
- The interactive-mode mascot rendered more than twice as tall as the wordmark; both
  the mascot bitmap and the root layout box (which expanded to the terminal's full
  width instead of shrinking to its content) are fixed.
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
