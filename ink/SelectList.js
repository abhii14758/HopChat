'use strict';

const React = require('react');
const { useState } = React;
const { Box, Text, useInput } = require('ink');

const e = React.createElement;

const VISIBLE_ROWS = 6;

// Reusable arrow-key-navigable list. Two modes via `filterable`:
// - false (default): short fixed list like platform selection; typing does nothing.
// - true: chat browser; typed chars build a live case-insensitive substring
//   filter (matched against label), arrows navigate filtered results, window
//   scrolls once filtered list exceeds VISIBLE_ROWS.
// Each item is { id, label, subtitle? }; onSelect(item) fires on Enter.
// `emptyLabel` is shown when `items` itself is empty (e.g. no local chats
// found for this platform at all) -- kept distinct from the "(no matches)"
// text shown when a filter query matches nothing, so a genuinely empty list
// doesn't read as a failed search.
function SelectList({ items, onSelect, filterable = false, emptyLabel = '(no matches)' }) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const filtered = filterable && query
    ? items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  const clampedHighlight = Math.min(highlighted, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.downArrow) {
      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
    } else if (key.upArrow) {
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (key.return) {
      if (filtered[clampedHighlight]) onSelect(filtered[clampedHighlight]);
    } else if (filterable && (key.backspace || key.delete)) {
      setQuery((q) => q.slice(0, -1));
      setHighlighted(0);
    } else if (filterable && input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow && !key.return && !key.escape && !key.backspace && !key.delete && !key.tab) {
      setQuery((q) => q + input);
      setHighlighted(0);
    }
  });

  const windowStart = Math.max(0, Math.min(clampedHighlight - Math.floor(VISIBLE_ROWS / 2), Math.max(0, filtered.length - VISIBLE_ROWS)));
  const visible = filtered.slice(windowStart, windowStart + VISIBLE_ROWS);
  const moreAbove = windowStart;
  const moreBelow = Math.max(0, filtered.length - windowStart - visible.length);

  return e(
    Box,
    { flexDirection: 'column' },
    filterable
      ? e(Text, null, e(Text, { bold: true }, '> '), query, e(Text, { dimColor: true }, '_'))
      : null,
    // Scroll indicators are keyed off whether there's actually more content
    // off-screen (items.length > VISIBLE_ROWS), not off `filterable` -- the
    // old `filterable &&` gate meant a long non-filterable list (e.g. a
    // future 3rd+ platform in the source/destination picker) would silently
    // hide extra choices with no indication they existed.
    items.length > VISIBLE_ROWS && moreAbove > 0 ? e(Text, { dimColor: true }, `▲ ${moreAbove} more above`) : null,
    filtered.length === 0
      ? e(Text, { dimColor: true }, query ? '(no matches)' : emptyLabel)
      : visible.map((item, i) => {
          const absoluteIndex = windowStart + i;
          const isSelected = absoluteIndex === clampedHighlight;
          return e(
            Box,
            { key: item.id, flexDirection: 'column' },
            e(
              Text,
              { color: isSelected ? 'cyan' : undefined, bold: isSelected },
              isSelected ? '> ' : '  ',
              item.label
            ),
            item.subtitle ? e(Text, { dimColor: true }, '    ', item.subtitle) : null
          );
        }),
    items.length > VISIBLE_ROWS && moreBelow > 0 ? e(Text, { dimColor: true }, `▼ ${moreBelow} more below`) : null
  );
}

module.exports = SelectList;
