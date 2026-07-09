'use strict';

const React = require('react');
const { Box, Text } = require('ink');

const e = React.createElement;

// Reuses the exact wording already shipped in cli.js's non-interactive migrate
// command: Claude Code's --resume only finds a session from that session's own
// project directory, so this reminder is shown identically in both code paths.
function SuccessPanel({ title, from, to, cwd, resumeCommand }) {
  return e(
    Box,
    { flexDirection: 'column', borderStyle: 'single', borderColor: 'green', padding: 1 },
    e(Text, { color: 'green', bold: true }, '✔ Migrated "', title, '" from ', from, ' to ', to, '.'),
    cwd
      ? e(Box, { flexDirection: 'column', marginTop: 1 },
          e(Text, null, 'cd into: ', e(Text, { bold: true }, cwd)),
          e(Text, { dimColor: true }, "  (Claude Code only resumes from the chat's own project directory)")
        )
      : null,
    e(Box, { marginTop: 1 },
      e(Text, null, 'Resume with: '), e(Text, { bold: true }, resumeCommand)
    )
  );
}

module.exports = SuccessPanel;
