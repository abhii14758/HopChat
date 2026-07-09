'use strict';

const React = require('react');
const { Box, Text, useInput } = require('ink');

const e = React.createElement;

// Shows the selected chat's metadata and asks for an explicit yes/no before
// migrating -- reuses the same field set the existing non-interactive migrate
// command already prints (title, turn count, model, project path).
function ConfirmPrompt({ title, turnCount, model, cwd, from, to, onConfirm, onCancel }) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onConfirm();
    else if (input === 'n' || input === 'N' || key.escape) onCancel();
  });

  return e(
    Box,
    { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', padding: 1 },
    e(Text, { bold: true }, 'Confirm migration'),
    e(Box, { marginTop: 1, flexDirection: 'column' },
      e(Text, null, 'Chat      "', title, '"'),
      e(Text, null, 'Turns     ', String(turnCount)),
      e(Text, null, 'Model     ', model),
      e(Text, null, 'Project   ', cwd)
    ),
    e(Box, { marginTop: 1 },
      e(Text, { color: 'cyan' }, from), e(Text, null, '  -------->  '), e(Text, { color: 'cyan' }, to)
    ),
    e(Box, { marginTop: 1 },
      e(Text, null, 'Migrate this chat?   '),
      e(Text, { color: 'green', bold: true }, '[Y]es'),
      e(Text, null, '   [N]o   [Esc] cancel')
    )
  );
}

module.exports = ConfirmPrompt;
