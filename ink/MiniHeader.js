'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const { renderMascotIcon } = require('../cli-pixel-art');

const e = React.createElement;

// Compact header shown on every inner screen. A real terminal can't shrink a
// font per element, so this uses the genuinely small MASCOT_ICON bitmap plus a
// plain colored "hopchat" text label rather than a scaled wordmark.
// `step`/`totalSteps` (both optional, both required together) render a
// breadcrumb ("Step 2 of 4") next to the wordmark -- the flow has 4 screens
// where the user makes a choice (source, destination, browse, confirm); the
// greeting and success/exit screens aren't counted since they're not a
// choice being made. `hints` is an optional trailing line of keyboard
// shortcuts, kept as plain dim text consistent with the rest of the app's
// dim-for-secondary-info convention.
function MiniHeader({ pose, t = 0, message, step, totalSteps, hints }) {
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
      e(Text, { color: 'cyan', bold: true }, 'hopchat'),
      step && totalSteps ? e(Text, { dimColor: true }, `  ·  Step ${step} of ${totalSteps}`) : null
    ),
    message ? e(Box, { marginTop: 1 }, e(Text, null, message)) : null,
    hints ? e(Box, { marginTop: 1 }, e(Text, { dimColor: true }, hints)) : null
  );
}

module.exports = MiniHeader;
