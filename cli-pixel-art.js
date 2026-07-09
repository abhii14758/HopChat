'use strict';

const chalk = require('chalk');

const WORDMARK_FONT = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

const WORDMARK_ROWS = 7;

function renderWordmark(text, color = chalk.cyan) {
  const letters = text.toUpperCase().split('');
  const glyphs = letters.map((letter) => {
    const glyph = WORDMARK_FONT[letter];
    if (!glyph) {
      throw new Error(`No wordmark glyph for letter "${letter}"`);
    }
    return glyph;
  });

  const lines = [];
  for (let row = 0; row < WORDMARK_ROWS; row++) {
    let line = '';
    glyphs.forEach((glyph, i) => {
      for (const bit of glyph[row]) {
        line += bit === '1' ? color('█') : ' ';
      }
      if (i < glyphs.length - 1) line += ' ';
    });
    lines.push(line);
  }
  return lines;
}

// A compact 8-row mascot deliberately sized to match the wordmark's own
// 7-row height (see renderWordmark) -- the original 16-row design rendered
// visually much taller than "HOPCHAT" once both were drawn as real terminal
// block characters (confirmed by measuring the actual Ink-rendered frame,
// not guessed from CSS), which is what the banner mockup failed to predict.
const MASCOT_BASE = [
  '.FEF.......FEF.',
  '.FEF.......FEF.',
  '.FFF.......FFF.',
  '..FFFFFFFFFFF..',
  '..FFKFFFFFKFF..',
  '..FFFFFKFFFFF..',
  '..FAAAAAAAAAF..',
  '...FFFFFFFFF...',
];

const MASCOT_ICON_BASE = [
  '.F...F.',
  '.F...F.',
  'FFFFFFF',
  'FKFFFKF',
  '.FFAFF.',
];

const MASCOT_COLORS = {
  F: chalk.hex('#e8b878'),
  E: chalk.hex('#f7d9a8'),
  K: chalk.hex('#3a2a20'),
  A: chalk.cyan,
};
const MASCOT_HAPPY_ACCENT = chalk.hex('#8af0e6');

const VALID_POSES = new Set(['idle', 'alert', 'happy']);

function renderMascot({ pose, t }) {
  if (!VALID_POSES.has(pose)) {
    throw new Error(`Unknown mascot pose "${pose}"`);
  }

  const grid = MASCOT_BASE.map((row) => row.split(''));

  // Eye row (row 4) has K at columns 4 and 10 -- see MASCOT_BASE above.
  // Blinking sets eyes to '.' (blank), not 'F' (fur) -- F and K both render
  // as the same '█' block character and only differ by color, which chalk
  // strips entirely outside a real TTY (as in this test environment), so a
  // blink that swapped K for F would be visually and textually
  // indistinguishable from open eyes. Blanking to '.' makes it a real,
  // detectable space character either way.
  const blinkCycle = (t / 2600) % 1;
  const blinking = blinkCycle > 0.94 && blinkCycle < 0.98;
  if (blinking) {
    for (let col = 0; col < grid[4].length; col++) {
      if (grid[4][col] === 'K') grid[4][col] = '.';
    }
  }

  if (pose === 'alert') {
    // Blank the fur pixel immediately flanking each eye so "wide eyes" is a
    // real shape change (a solid run of block characters interrupted by a
    // gap), not just a re-color of cells that were already solid fur --
    // color-only recoloring produced zero visible difference from idle once
    // verified against the actual rendered string, since F and K both draw
    // the same '█' character and only differ by ANSI color.
    grid[4][3] = '.';
    grid[4][11] = '.';
  }

  return grid.map((row) =>
    row
      .map((code) => {
        if (code === '.') return ' ';
        if (pose === 'happy' && code === 'A') return MASCOT_HAPPY_ACCENT('█');
        return MASCOT_COLORS[code]('█');
      })
      .join('')
  );
}

function renderMascotIcon() {
  return MASCOT_ICON_BASE.map((row) =>
    row
      .split('')
      .map((code) => (code === '.' ? ' ' : MASCOT_COLORS[code]('█')))
      .join('')
  );
}

module.exports = { renderWordmark, renderMascot, renderMascotIcon, WORDMARK_FONT };
