---
"hopchat": minor
---

Interactive mode: fixed the "q" key exiting the app while typing in the chat-browser
filter (Escape still exits from anywhere), added a styled error screen instead of an
uncaught crash on a failed read/migrate, wired the same advisory version-compatibility
check the non-interactive `migrate` already had into the confirm step, and added a step
indicator with keyboard-shortcut hints to every screen.

CLI: fixed `--no-color` swallowing the next argument (e.g. a chat id) instead of acting
as a boolean flag, added `NO_COLOR` environment variable support, added `--version`/`-v`,
and `hopchat platforms` now shows each platform's full display name and local chat count
instead of two bare identifiers.
