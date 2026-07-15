---
"hopchat": minor
---

Added a hard error when a source session's embedded format-version marker doesn't match
what hopchat's reader was built against (active today for copilot-cli; a no-op for
platforms without such a marker), instead of silently misparsing a session written by an
incompatible CLI version.

Chat ids are now validated before being used in a filesystem path, closing a local
path-traversal read primitive in `hopchat migrate <chat-id>`. A malformed line in a
Copilot CLI session file is now skipped instead of crashing the whole read.
