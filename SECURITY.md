# Security Policy

## Supported versions

hopchat is pre-1.0 with a single maintainer. Only the latest published npm version
receives security fixes.

## What hopchat touches

hopchat reads and writes local chat session files on your own machine — under
`~/.copilot/session-state/` and `~/.claude/projects/` (or their Windows equivalents).
Migrated data never leaves your local filesystem: hopchat makes no network requests
itself (the one shell-out it does, an optional `--version` check on the installed
Copilot CLI / Claude Code binary, is local process execution, not a network call).

## Reporting a vulnerability

Please use GitHub's [private vulnerability reporting](https://github.com/abhii14758/HopChat/security/advisories/new)
rather than opening a public issue, especially for anything related to path handling
or arbitrary file read/write, since hopchat's core job is filesystem I/O against
another tool's session storage.

If private reporting isn't available for some reason, email
abhibhimani14758@gmail.com instead.

You can expect an initial response within 3 business days. This is a solo-maintainer
project — please be patient, and thank you for reporting responsibly.
