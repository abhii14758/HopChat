'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const { renderMascotIcon } = require('../cli-pixel-art');

const e = React.createElement;

// Compact header shown on every inner screen. A real terminal can't shrink a
// font per element, so this uses the genuinely small MASCOT_ICON bitmap plus a
// plain colored "hopchat" text label rather than a scaled wordmark.
function MiniHeader({ pose, t = 0, message }) {
  const iconLines = renderMascotIcon();

  return e(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    e(
      Box,
      { flexDirection: 'row', gap: 1 },
      e(
        Box,
        { flexDirection: 'column' },
        ...iconLines.map((line, i) => e(Text, { key: `icon-${i}` }, line))
      ),
      e(Text, { color: 'cyan', bold: true }, 'hopchat')
    ),
    message ? e(Box, { marginTop: 1 }, e(Text, null, message)) : null
  );
}

module.exports = MiniHeader;
