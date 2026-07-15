'use strict';

// TODO: fill in for your platform, then delete this comment block.
// - command: the CLI binary name hopchat will shell out to for `--version`
//   (e.g. 'copilot', 'claude'). Must be the bare command, resolvable on PATH.
// - range: [minVersion, maxVersion] this reader/writer pair has actually been
//   tested against. Not enforced -- an installed version outside this range
//   only produces a non-blocking warning before migration is attempted.
// - sessionFormatVersion (optional): only set this if your platform's own
//   session files embed a distinct schema-version marker separate from the
//   CLI's own semver (see platforms/copilot-cli's session.start event for a
//   real example). When set, and your reader.js captures that same value
//   onto the IR as `_sessionFormatVersion`, core/migrate.js will hard-fail
//   with a named error on a mismatch instead of silently misparsing a
//   session written by a newer/incompatible format version. Omit this field
//   entirely if your platform's format has no such marker -- that's normal,
//   not a shortcut; see claude-code/supported-versions.js's own comment.
module.exports = {
  command: 'your-cli-binary-name',
  range: ['0.0.0', '0.0.0'],
  sessionFormatVersion: 1,
};
