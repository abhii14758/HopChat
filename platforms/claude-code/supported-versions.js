'use strict';

// sessionFormatVersion is declared for symmetry with copilot-cli's descriptor
// but is currently inert: claude-code's session files don't embed a distinct
// schema-version marker separate from the writing CLI's own semver (only
// `version` -- the CLI's version string -- is captured, as `_cliVersion` in
// reader.js), so core/migrate.js's format-version hard-check has nothing
// comparable to check it against and silently no-ops for this platform. If a
// future Claude Code release adds a real embedded format marker, capture it
// onto the IR as `_sessionFormatVersion` in reader.js and this field starts
// being enforced automatically -- see core/migrate.js's
// assertFormatVersionSupported for how copilot-cli already uses this.
module.exports = {
  command: 'claude',
  range: ['2.1.150', '2.1.220'],
  sessionFormatVersion: 1,
};
