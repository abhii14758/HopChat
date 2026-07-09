'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const { renderWordmark, renderMascot } = require('../cli-pixel-art');

const e = React.createElement;

// Full banner: corner-bracket frame, the blocky "HOPCHAT" wordmark
// stretched across the left, and the mascot pinned to the right edge --
// shown once on the greeting screen and once on the exit screen. `pose`/`t`
// drive the mascot's idle animation exactly like the plain-ANSI rabbit does
// elsewhere in this codebase (cli-mascot.js).
function Banner({ tagline, pose, t = 0 }) {
  const wordmarkLines = renderWordmark('HOPCHAT');
  const mascotLines = renderMascot({ pose, t });

  return e(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: 'gray', paddingX: 2, paddingY: 1 },
    e(
      Box,
      { flexDirection: 'row', justifyContent: 'space-between' },
      e(
        Box,
        { flexDirection: 'column', flexGrow: 1 },
        ...wordmarkLines.map((line, i) => e(Text, { key: `wm-${i}` }, line))
      ),
      e(
        Box,
        { flexDirection: 'column', marginLeft: 2 },
        ...mascotLines.map((line, i) => e(Text, { key: `m-${i}` }, line))
      )
    ),
    e(Box, { marginTop: 1 }, e(Text, { dimColor: true }, tagline))
  );
}

module.exports = Banner;
