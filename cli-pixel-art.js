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

const MASCOT_BASE = [
  '....F........F....',
  '...FEF......FEF...',
  '...FEF......FEF...',
  '...FEF......FEF...',
  '...FEF......FEF...',
  '....FFFFFFFFFF....',
  '...FFFFFFFFFFFF...',
  '..FFFFFFFFFFFFFF..',
  '..FFFFKKFFKKFFFF..',
  '..FFFFKKFFKKFFFF..',
  '..FFFFFFKKFFFFFF..',
  '..FFFFFFKFFFFFFF..',
  '...FFFFFFFFFFFF...',
  '.....FAAAAAAF.....',
  '....FFFFFFFFFF....',
  '......FFFFFF......',
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

  const blinkCycle = (t / 2600) % 1;
  const blinking = blinkCycle > 0.94 && blinkCycle < 0.98;
  if (blinking) {
    for (const row of [8, 9]) {
      for (let col = 0; col < grid[row].length; col++) {
        if (grid[row][col] === 'K') grid[row][col] = '.';
      }
    }
  }

  if (pose === 'alert') {
    grid[8][1] = 'K';
    grid[8][16] = 'K';
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
