'use strict';

const ANSI_ESCAPE = /\x1b\[[0-9;]*m/y;

// Pure: split `text` into tokens of either a single visible character or one
// complete ANSI escape sequence. Exported so the tokenizing logic (the part
// that must never split an escape code mid-sequence) is unit-testable
// without needing a real TTY or timers.
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    ANSI_ESCAPE.lastIndex = i;
    const match = ANSI_ESCAPE.exec(text);
    if (match) {
      tokens.push({ type: 'ansi', value: match[0] });
      i += match[0].length;
    } else {
      tokens.push({ type: 'char', value: text[i] });
      i += 1;
    }
  }
  return tokens;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Print `text` one visible character at a time, `charDelayMs` apart. ANSI
// color/style escape sequences are written instantly (never delayed
// mid-sequence) so colors apply cleanly instead of flickering as each byte
// of an escape code lands. Falls back to an instant single write when
// stdout isn't a TTY (piped, CI, tests) or charDelayMs is 0 -- a
// per-character delay only makes sense as a human-facing effect live.
async function typewrite(text, { charDelayMs = 12 } = {}) {
  if (!process.stdout.isTTY || charDelayMs <= 0) {
    process.stdout.write(text);
    return;
  }
  for (const token of tokenize(text)) {
    process.stdout.write(token.value);
    if (token.type === 'char') await sleep(charDelayMs);
  }
}

async function typewriteLine(text, opts) {
  await typewrite(text, opts);
  process.stdout.write('\n');
}

module.exports = { tokenize, typewrite, typewriteLine };
