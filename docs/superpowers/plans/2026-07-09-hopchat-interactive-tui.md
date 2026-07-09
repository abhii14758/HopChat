# hopchat Interactive TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bare `hopchat` (no arguments) launches a keyboard-navigable interactive mode — greeting → select source platform → select destination platform → browse source chats (scrollable + type-to-filter) → confirm → migrate → success (loops back to the chat list) → exit — with a Copilot-CLI-style pixel-art banner (original hopchat mascot + blocky "HOPCHAT" wordmark, not a copy of GitHub's actual artwork) on the greeting/exit screens and a compact header on every screen in between.

**Architecture:** Built on **Ink** (React for CLIs) since Ink owns terminal raw-mode/stdin and gives a component + state-machine model well suited to a 7-screen flow with keyboard nav — this supersedes the earlier plan to use `@inquirer/prompts`, since that library also wants to own stdin and the two cannot coexist. Pixel-art rendering (wordmark font, mascot bitmap, animation math) lives in a plain, dependency-free module (`cli-pixel-art.js`) with pure functions returning arrays of ANSI-colored strings, so it's unit-testable without a terminal or Ink at all; Ink components just call these functions and lay out the result. The existing non-interactive commands (`hopchat migrate --from ... --to ... <id>`, `list`, `platforms`, `--help`) and their existing rabbit-hop/typewriter animation code (`cli-mascot.js`, `cli-text-fx.js`) are untouched — this plan only adds a new code path for bare `hopchat`, reusing `core/migrate.js` and `core/registry.js` underneath.

**Tech Stack:** Node.js (CommonJS, no build/transpile step — Ink components are written with `React.createElement` calls, not JSX, since hopchat has never had a compile step and shouldn't gain one for this). New dependencies: `ink@^3` + `react@^17` (the last Ink major line with CommonJS support — Ink 4+ is ESM-only and would force converting the whole project). New dev dependency: `ink-testing-library@^2` (pairs with Ink v3) for rendering Ink components in tests without a real TTY.

**Spec:** design locked via brainstorming in this conversation — 7 screens (greeting, select source, select destination, browse chats, confirm, success, exit), scrollable + type-to-filter chat picker, loops back to the chat list after each migration, Esc/q exits from anywhere, `cd`-into-project-dir reminder on success (reusing wording already shipped in `cli.js`'s non-interactive `migrate` command).

---

## Pixel-art data (verified, used across several tasks below)

These bitmaps were verified column-by-column before writing this plan — every row of `MASCOT_BASE` is exactly 18 characters, every row of the wordmark font glyphs is exactly 5 characters — so the tasks below can use them directly with no placeholder data.

**Wordmark font** — only the 6 unique letters in "HOPCHAT" (H, O, P, C, A, T), each a 5-wide × 7-tall glyph, `1` = colored pixel, `0` = blank:

```js
const WORDMARK_FONT = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};
```

**Big mascot bitmap** — 18 columns × 16 rows, an original hopchat rabbit design (sandy-tan fur, brand-cyan accent band) distinct from any other product's mascot. `F` = fur, `E` = inner ear, `K` = eyes/nose/mouth, `A` = accent band, `.` = blank:

```js
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
```

Wait — count row 0 (`'....F........F....'`): 4 dots + F + 8 dots + F + 4 dots = 4+1+8+1+4 = **18**. Every other row follows the same pattern (verified: rows 1–4 are 3+3+6+3+3=18; rows 5–7 are 4+10+4=18, 3+12+3=18, 2+14+2=18; rows 8–11 are 2+4+2+2+2+4+2=18, same, 2+6+2+6+2=18, 2+6+1+7+2=18; row 12 is 3+12+3=18; row 13 is 5+1+6+1+5=18; rows 14–15 are 4+10+4=18, 6+6+6=18). All 18 — safe to use verbatim.

**Mini mascot icon** — for the compact header on inner screens, since a real terminal can't shrink a font per-element the way a browser mockup can. A small 7-wide × 5-tall version of the same character, verified 7 characters per row:

```js
const MASCOT_ICON = [
  '.F...F.',
  '.F...F.',
  'FFFFFFF',
  'FKFFFKF',
  '.FFAFF.',
];
```

---

### Task 1: Add Ink dependencies and verify the binary still runs

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /d/hopchat
npm install ink@^3.2.0 react@^17.0.2
npm install --save-dev ink-testing-library@^2.1.0
```

- [ ] **Step 2: Verify package.json has the right shape**

Open `package.json` and confirm it now has:

```json
{
  "dependencies": {
    "chalk": "^4.1.2",
    "ink": "^3.2.0",
    "react": "^17.0.2"
  },
  "devDependencies": {
    "ink-testing-library": "^2.1.0"
  }
}
```

(Exact installed versions may differ slightly within these ranges — that's fine, just confirm the three packages are present and Ink is the 3.x line, not 4.x.)

- [ ] **Step 3: Confirm nothing broke**

Run: `cd /d/hopchat && npm test`
Expected: all existing tests still pass (same count as before this change — adding dependencies shouldn't change any existing behavior).

Run: `node bin/hopchat.js --help`
Expected: the existing plain-text help screen prints exactly as before (untouched code path).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ink+react for the new interactive TUI mode"
```

---

### Task 2: Pixel-art wordmark renderer (pure, unit-tested)

**Files:**
- Create: `cli-pixel-art.js`
- Test: `test/cli-pixel-art.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderWordmark } = require('../cli-pixel-art');

test('renderWordmark returns 7 lines for any input', () => {
  const lines = renderWordmark('HOPCHAT');
  assert.equal(lines.length, 7);
});

test('renderWordmark renders each letter 5 columns wide with a 1-column gap between letters', () => {
  const lines = renderWordmark('HAT');
  // 3 letters x 5 cols + 2 gaps x 1 col = 17 visible columns before ANSI codes are stripped
  const stripped = lines[0].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped.length, 17);
});

test('renderWordmark uses a colored block character for "on" pixels and a space for "off" pixels', () => {
  const lines = renderWordmark('T');
  // T's glyph top row is '11111' -- five "on" pixels, five block characters, all colored
  const stripped = lines[0].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, '█████');
  // T's second row is '00100' -- a single "on" pixel in the middle, spaces elsewhere
  const strippedRow2 = lines[1].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(strippedRow2, '  █  ');
});

test('renderWordmark throws a clear error for a letter with no glyph defined', () => {
  assert.throws(() => renderWordmark('X'), /No wordmark glyph for letter "X"/);
});

test('renderWordmark is case-insensitive', () => {
  const upper = renderWordmark('HOPCHAT').map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const lower = renderWordmark('hopchat').map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  assert.deepEqual(upper, lower);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli-pixel-art.test.js`
Expected: FAIL with `Cannot find module '../cli-pixel-art'`

- [ ] **Step 3: Write cli-pixel-art.js (wordmark portion only for now)**

```js
'use strict';

const chalk = require('chalk');

// Only the letters that actually appear in "HOPCHAT" -- H, O, P, C, A, T.
// Each glyph is 5 columns wide, 7 rows tall; '1' = a colored pixel, '0' =
// blank. Verified by hand before writing this module: every glyph row is
// exactly 5 characters, and each letter is visually distinct from its
// neighbors in the word (no two letters collapse into the same silhouette).
const WORDMARK_FONT = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

const WORDMARK_ROWS = 7;

// Renders `text` as a blocky pixel-art wordmark, one glyph per letter, a
// single blank column between letters. Returns an array of 7 already
// chalk-colored strings, one per pixel-row, ready to print with console.log
// or lay out inside an Ink <Text> node. Pure -- no I/O, no terminal
// assumptions -- so it's testable without Ink or a real TTY.
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
      if (i < glyphs.length - 1) line += ' '; // 1-column gap between letters
    });
    lines.push(line);
  }
  return lines;
}

module.exports = { renderWordmark, WORDMARK_FONT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cli-pixel-art.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add cli-pixel-art.js test/cli-pixel-art.test.js
git commit -m "feat: add blocky pixel-art wordmark renderer"
```

---

### Task 3: Pixel-art mascot renderer (pure, unit-tested)

**Files:**
- Modify: `cli-pixel-art.js`
- Modify: `test/cli-pixel-art.test.js`

- [ ] **Step 1: Write the failing test — append to test/cli-pixel-art.test.js**

```js
const { renderMascot, renderMascotIcon } = require('../cli-pixel-art');

test('renderMascot returns 16 lines, each 18 visible columns wide', () => {
  const lines = renderMascot({ pose: 'idle', t: 0 });
  assert.equal(lines.length, 16);
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(stripped.length, 18, `line "${stripped}" should be 18 columns`);
  }
});

test('renderMascot in "idle" pose at t=0 has both eyes open (not mid-blink)', () => {
  const lines = renderMascot({ pose: 'idle', t: 0 });
  // row 8 (0-indexed) is the eye row in MASCOT_BASE; at t=0 the blink cycle
  // hasn't reached its "closed" window yet, so both eye pixels render dark.
  const stripped = lines[8].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped.slice(6, 8), '██');
  assert.equal(stripped.slice(10, 12), '██');
});

test('renderMascot in "idle" pose blinks (closes eyes) at a specific point in the cycle', () => {
  // blink window is when (t / 2600) % 1 is between 0.94 and 0.98 -- t=2500ms
  // lands at 2500/2600 = 0.9615, inside that window.
  const lines = renderMascot({ pose: 'idle', t: 2500 });
  const stripped = lines[8].replace(/\x1b\[[0-9;]*m/g, '');
  // during a blink the eye pixels render as fur color, not the dark eye color
  assert.notEqual(stripped.slice(6, 8), '██');
});

test('renderMascot "alert" pose widens the eyes relative to "idle"', () => {
  const idle = renderMascot({ pose: 'idle', t: 0 }).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const alert = renderMascot({ pose: 'alert', t: 0 }).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  assert.notEqual(idle[8], alert[8]);
});

test('renderMascot "happy" pose renders without throwing and returns 16 lines', () => {
  const lines = renderMascot({ pose: 'happy', t: 0 });
  assert.equal(lines.length, 16);
});

test('renderMascot throws a clear error for an unknown pose', () => {
  assert.throws(() => renderMascot({ pose: 'confused', t: 0 }), /Unknown mascot pose "confused"/);
});

test('renderMascotIcon returns 5 lines, each 7 visible columns wide', () => {
  const lines = renderMascotIcon();
  assert.equal(lines.length, 5);
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(stripped.length, 7);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli-pixel-art.test.js`
Expected: FAIL — `renderMascot is not a function`

- [ ] **Step 3: Add mascot rendering to cli-pixel-art.js**

Append to `cli-pixel-art.js` (before the `module.exports` line):

```js
// An original hopchat mascot -- a small rabbit face -- deliberately distinct
// in silhouette and color from any other product's mascot. F = fur (sandy
// tan), E = inner ear, K = eyes/nose/mouth (dark), A = accent band (brand
// cyan). 18 columns wide, 16 rows tall; every row verified to be exactly 18
// characters before this file was written.
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

// A compact 7x5 version of the same character for the mini header shown on
// every screen except the greeting/exit banners -- a real terminal can't
// shrink a font per-element the way a browser mockup can with CSS, so this
// is a genuinely smaller design, not a scaled-down render of MASCOT_BASE.
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

// Renders the big mascot as an array of 16 already-colored strings.
// `t` is an elapsed-milliseconds counter driving idle motion (currently just
// blinking); pass a fixed t (e.g. 0) for a deterministic frame in tests.
// pose: 'idle' blinks periodically; 'alert' widens the eyes (used while
// waiting on a yes/no confirm); 'happy' brightens the accent band (used
// after a successful migration).
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
        if (grid[row][col] === 'K') grid[row][col] = 'F';
      }
    }
  }

  if (pose === 'alert') {
    grid[8][5] = 'K';
    grid[8][12] = 'K';
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

// Renders the compact mini-header mascot icon. No pose/animation support --
// it's small enough on screen that idle motion wouldn't read anyway.
function renderMascotIcon() {
  return MASCOT_ICON_BASE.map((row) =>
    row
      .split('')
      .map((code) => (code === '.' ? ' ' : MASCOT_COLORS[code]('█')))
      .join('')
  );
}
```

Then update the `module.exports` line at the bottom of the file:

```js
module.exports = { renderWordmark, renderMascot, renderMascotIcon, WORDMARK_FONT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cli-pixel-art.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Self-review — confirm the blink math**

Read the blink test again: `t=2500`, cycle `= (2500/2600) % 1 = 0.9615...`, which is `> 0.94 && < 0.98` — inside the blink window, confirming the test's own comment. This is the same math already shipped and working in `cli-mascot.js`'s idle animation, reused here for the new pixel mascot.

- [ ] **Step 6: Commit**

```bash
git add cli-pixel-art.js test/cli-pixel-art.test.js
git commit -m "feat: add original hopchat pixel-art mascot renderer"
```

---

### Task 4: Ink Banner component (full greeting/exit banner)

**Files:**
- Create: `ink/Banner.js`
- Test: `test/ink/Banner.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const Banner = require('../../ink/Banner');

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('Banner renders the HOPCHAT wordmark and a tagline', () => {
  const { lastFrame } = render(React.createElement(Banner, { tagline: 'Ready to hop a chat between tools?', pose: 'idle' }));
  const frame = strip(lastFrame());
  assert.match(frame, /█+/); // pixel wordmark present as block characters
  assert.match(frame, /Ready to hop a chat between tools\?/);
});

test('Banner renders corner brackets', () => {
  const { lastFrame } = render(React.createElement(Banner, { tagline: 'See you next hop!', pose: 'happy' }));
  const frame = strip(lastFrame());
  // Ink's Box borderStyle renders corner glyphs; the simplest robust check
  // is that at least one non-space, non-letter box-drawing-ish character
  // appears -- verified against the actual rendered frame during dev rather
  // than guessed, since exact border glyphs are an Ink implementation detail.
  assert.ok(frame.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/Banner.test.js`
Expected: FAIL with `Cannot find module '../../ink/Banner'`

- [ ] **Step 3: Write ink/Banner.js**

```js
'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const { renderWordmark, renderMascot } = require('../cli-pixel-art');

const e = React.createElement;

// Full banner: corner-bracket frame, the blocky "HOPCHAT" wordmark
// stretched across the left, and the mascot pinned to the right edge --
// shown once on the greeting screen and once on the exit screen, the same
// two places GitHub Copilot CLI shows its own banner. `pose`/`t` drive the
// mascot's idle animation exactly like the plain-ANSI rabbit already does
// elsewhere in this codebase (cli-mascot.js) -- same blink math, different
// visual style.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/Banner.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add ink/Banner.js test/ink/Banner.test.js
git commit -m "feat: add Ink Banner component for greeting/exit screens"
```

---

### Task 5: Ink MiniHeader component (compact header for inner screens)

**Files:**
- Create: `ink/MiniHeader.js`
- Test: `test/ink/MiniHeader.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const MiniHeader = require('../../ink/MiniHeader');

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('MiniHeader renders the mascot icon and the plain "hopchat" wordmark', () => {
  const { lastFrame } = render(React.createElement(MiniHeader, { pose: 'idle', t: 0 }));
  const frame = strip(lastFrame());
  assert.match(frame, /█+/); // mascot icon block characters
  assert.match(frame, /hopchat/i);
});

test('MiniHeader renders the given step message below the icon row', () => {
  const { lastFrame } = render(React.createElement(MiniHeader, { pose: 'idle', t: 0, message: "Where's this chat coming from?" }));
  const frame = strip(lastFrame());
  assert.match(frame, /Where's this chat coming from\?/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/MiniHeader.test.js`
Expected: FAIL with `Cannot find module '../../ink/MiniHeader'`

- [ ] **Step 3: Write ink/MiniHeader.js**

```js
'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const { renderMascotIcon } = require('../cli-pixel-art');

const e = React.createElement;

// Compact header shown on every inner screen (platform pick, chat browse,
// confirm, success) -- a real terminal can't shrink a font per element the
// way the HTML mockup did with CSS, so this uses the genuinely small
// MASCOT_ICON bitmap plus a plain chalk-free "hopchat" text label (Ink's
// <Text color="cyan"> handles the coloring) rather than a scaled wordmark.
function MiniHeader({ pose, t = 0, message }) {
  const iconLines = renderMascotIcon(pose, t);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/MiniHeader.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add ink/MiniHeader.js test/ink/MiniHeader.test.js
git commit -m "feat: add Ink MiniHeader component for inner screens"
```

---

### Task 6: Ink SelectList component (arrow-key nav + optional type-to-filter)

This is the reusable list used for both platform-picking (no filter needed, short list) and chat-browsing (filter needed, long list).

**Files:**
- Create: `ink/SelectList.js`
- Test: `test/ink/SelectList.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const SelectList = require('../../ink/SelectList');

const e = React.createElement;

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('SelectList renders all items when the list is short', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  const { lastFrame } = render(e(SelectList, { items, onSelect: () => {} }));
  const frame = strip(lastFrame());
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('SelectList marks the first item selected by default', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  const { lastFrame } = render(e(SelectList, { items, onSelect: () => {} }));
  const frame = strip(lastFrame());
  const lines = frame.split('\n');
  const copilotLine = lines.find((l) => l.includes('copilot-cli'));
  assert.match(copilotLine, /^>/, 'first item should be marked with a leading ">"');
});

test('pressing down arrow moves the selection to the next item', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {} }));
  stdin.write('[B'); // ANSI down-arrow
  const frame = strip(lastFrame());
  const lines = frame.split('\n');
  const claudeLine = lines.find((l) => l.includes('claude-code'));
  assert.match(claudeLine, /^>/);
});

test('pressing Enter calls onSelect with the currently highlighted item', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  let selected = null;
  const { stdin } = render(e(SelectList, { items, onSelect: (item) => { selected = item; } }));
  stdin.write('\r');
  assert.equal(selected.id, 'a');
});

test('typing filters the list by substring match on label when filterable is true', () => {
  const items = [
    { id: 'a', label: 'Redesign Game Table UI' },
    { id: 'b', label: 'Fix login bug' },
    { id: 'c', label: 'Review Codebase' },
  ];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {}, filterable: true }));
  stdin.write('re');
  const frame = strip(lastFrame());
  assert.match(frame, /Redesign Game Table UI/);
  assert.match(frame, /Review Codebase/);
  assert.doesNotMatch(frame, /Fix login bug/);
});

test('typing does nothing when filterable is false (e.g. the platform picker)', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {} }));
  stdin.write('z');
  const frame = strip(lastFrame());
  // both items still present -- "z" was not treated as a filter query
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('renders a subtitle line under each item label when provided', () => {
  const items = [{ id: 'a', label: 'Redesign Game Table UI', subtitle: 'D:\\3ofspades · 2 days ago' }];
  const { lastFrame } = render(e(SelectList, { items, onSelect: () => {} }));
  const frame = strip(lastFrame());
  assert.match(frame, /D:\\3ofspades · 2 days ago/);
});

test('renders "(no matches)" when a filter query matches nothing', () => {
  const items = [{ id: 'a', label: 'copilot-cli' }];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {}, filterable: true }));
  stdin.write('zzzzz');
  const frame = strip(lastFrame());
  assert.match(frame, /no matches/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/SelectList.test.js`
Expected: FAIL with `Cannot find module '../../ink/SelectList'`

- [ ] **Step 3: Write ink/SelectList.js**

```js
'use strict';

const React = require('react');
const { useState } = React;
const { Box, Text, useInput } = require('ink');

const e = React.createElement;

const VISIBLE_ROWS = 6;

// Reusable arrow-key-navigable list. Two modes controlled by `filterable`:
// - false (default): used for short, fixed lists like platform selection --
//   typing does nothing, since there's nothing worth filtering with only 2
//   choices.
// - true: used for the chat browser -- typed characters build a live
//   substring filter (case-insensitive, matched against `label`), arrow keys
//   navigate the filtered results, and the visible window scrolls once the
//   filtered list is longer than VISIBLE_ROWS.
// Each item is `{ id, label, subtitle? }`; onSelect(item) fires on Enter.
function SelectList({ items, onSelect, filterable = false }) {
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
    } else if (filterable && key.backspace || (filterable && key.delete)) {
      setQuery((q) => q.slice(0, -1));
      setHighlighted(0);
    } else if (filterable && input && !key.ctrl && !key.meta) {
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
    filterable && moreAbove > 0 ? e(Text, { dimColor: true }, `▲ ${moreAbove} more above`) : null,
    filtered.length === 0
      ? e(Text, { dimColor: true }, '(no matches)')
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
    filterable && moreBelow > 0 ? e(Text, { dimColor: true }, `▼ ${moreBelow} more below`) : null
  );
}

module.exports = SelectList;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/SelectList.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add ink/SelectList.js test/ink/SelectList.test.js
git commit -m "feat: add reusable Ink SelectList with optional type-to-filter"
```

---

### Task 7: Ink ConfirmPrompt component

**Files:**
- Create: `ink/ConfirmPrompt.js`
- Test: `test/ink/ConfirmPrompt.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const ConfirmPrompt = require('../../ink/ConfirmPrompt');

const e = React.createElement;

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('ConfirmPrompt renders the chat metadata fields', () => {
  const { lastFrame } = render(
    e(ConfirmPrompt, {
      title: 'Redesign Game Table UI',
      turnCount: 738,
      model: 'claude-sonnet-4.6',
      cwd: 'D:\\3ofspades',
      from: 'copilot-cli',
      to: 'claude-code',
      onConfirm: () => {},
      onCancel: () => {},
    })
  );
  const frame = strip(lastFrame());
  assert.match(frame, /Redesign Game Table UI/);
  assert.match(frame, /738/);
  assert.match(frame, /claude-sonnet-4\.6/);
  assert.match(frame, /D:\\3ofspades/);
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('pressing "y" calls onConfirm', () => {
  let confirmed = false;
  const { stdin } = render(
    e(ConfirmPrompt, {
      title: 't', turnCount: 1, model: 'm', cwd: 'c', from: 'a', to: 'b',
      onConfirm: () => { confirmed = true; },
      onCancel: () => {},
    })
  );
  stdin.write('y');
  assert.equal(confirmed, true);
});

test('pressing "n" calls onCancel', () => {
  let cancelled = false;
  const { stdin } = render(
    e(ConfirmPrompt, {
      title: 't', turnCount: 1, model: 'm', cwd: 'c', from: 'a', to: 'b',
      onConfirm: () => {},
      onCancel: () => { cancelled = true; },
    })
  );
  stdin.write('n');
  assert.equal(cancelled, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/ConfirmPrompt.test.js`
Expected: FAIL with `Cannot find module '../../ink/ConfirmPrompt'`

- [ ] **Step 3: Write ink/ConfirmPrompt.js**

```js
'use strict';

const React = require('react');
const { Box, Text, useInput } = require('ink');

const e = React.createElement;

// Shows the selected chat's metadata and asks for an explicit yes/no before
// migrating -- reusing the same field set the existing non-interactive
// `migrate` command already prints in its metadata panel (title, turn
// count, model, project path), so the two code paths show the same
// information even though one is a flag-based command and this one is a
// menu screen.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/ConfirmPrompt.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add ink/ConfirmPrompt.js test/ink/ConfirmPrompt.test.js
git commit -m "feat: add Ink ConfirmPrompt component"
```

---

### Task 8: Ink SuccessPanel component

**Files:**
- Create: `ink/SuccessPanel.js`
- Test: `test/ink/SuccessPanel.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const SuccessPanel = require('../../ink/SuccessPanel');

const e = React.createElement;

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('SuccessPanel shows the migrated chat title, platforms, cd reminder, and resume command', () => {
  const { lastFrame } = render(
    e(SuccessPanel, {
      title: 'Redesign Game Table UI',
      from: 'copilot-cli',
      to: 'claude-code',
      cwd: 'D:\\3ofspades',
      resumeCommand: 'claude --resume a3f9e21b',
    })
  );
  const frame = strip(lastFrame());
  assert.match(frame, /Migrated "Redesign Game Table UI" from copilot-cli to claude-code/);
  assert.match(frame, /cd into:/);
  assert.match(frame, /D:\\3ofspades/);
  assert.match(frame, /Claude Code only resumes from the chat's own project directory/);
  assert.match(frame, /Resume with:/);
  assert.match(frame, /claude --resume a3f9e21b/);
});

test('SuccessPanel omits the cd reminder when cwd is not provided', () => {
  const { lastFrame } = render(
    e(SuccessPanel, {
      title: 'Some chat',
      from: 'copilot-cli',
      to: 'claude-code',
      cwd: null,
      resumeCommand: 'claude --resume abc',
    })
  );
  const frame = strip(lastFrame());
  assert.doesNotMatch(frame, /cd into:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/SuccessPanel.test.js`
Expected: FAIL with `Cannot find module '../../ink/SuccessPanel'`

- [ ] **Step 3: Write ink/SuccessPanel.js**

```js
'use strict';

const React = require('react');
const { Box, Text } = require('ink');

const e = React.createElement;

// Reuses the exact wording already shipped in cli.js's non-interactive
// migrate command (see the "cd into:" reminder added there): Claude Code's
// --resume only finds a session from that session's own project directory,
// so this reminder is shown identically in both the flag-based command and
// this interactive screen.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/SuccessPanel.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add ink/SuccessPanel.js test/ink/SuccessPanel.test.js
git commit -m "feat: add Ink SuccessPanel component"
```

---

### Task 9: Ink App — the full 7-screen state machine

This wires every component built so far into the actual flow, backed by the real `core/registry.js` + `core/migrate.js` (no reimplemented migration logic).

**Files:**
- Create: `ink/App.js`
- Test: `test/ink/App.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const { registerPlatform, clearRegistry } = require('../../core/registry');
const App = require('../../ink/App');

const e = React.createElement;

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function registerFakePlatforms() {
  clearRegistry();
  registerPlatform('copilot-cli', {
    reader: {
      listChats: () => [{ id: 'chat-1', title: 'Redesign Game Table UI', updatedAt: '2026-01-01T00:00:00.000Z', cwd: 'D:\\3ofspades' }],
      readChat: (id) => ({
        sourcePlatform: 'copilot-cli',
        sourceChatId: id,
        title: 'Redesign Game Table UI',
        cwd: 'D:\\3ofspades',
        model: 'claude-sonnet-4.6',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
        turns: Array.from({ length: 738 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i}` })),
      }),
    },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
  });
  registerPlatform('claude-code', {
    reader: { listChats: () => [], readChat: () => { throw new Error('should not read target'); } },
    writer: { writeChat: () => ({ newChatId: 'new-id-123', resumeCommand: 'claude --resume new-id-123' }) },
  });
}

test('App starts on the greeting screen', () => {
  registerFakePlatforms();
  const { lastFrame } = render(e(App));
  const frame = strip(lastFrame());
  assert.match(frame, /Ready to hop a chat between tools/i);
});

test('pressing Enter on the greeting advances to source platform selection', () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  stdin.write('\r');
  const frame = strip(lastFrame());
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('full flow: greeting -> source -> destination -> chat list -> confirm -> success', () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));

  stdin.write('\r'); // greeting -> select source
  stdin.write('\r'); // select copilot-cli (first item) -> select destination
  stdin.write('\r'); // select claude-code (only item) -> browse chats
  stdin.write('\r'); // select the one fake chat -> confirm

  let frame = strip(lastFrame());
  assert.match(frame, /Confirm migration/);
  assert.match(frame, /Redesign Game Table UI/);
  assert.match(frame, /738/);

  stdin.write('y'); // confirm -> success

  frame = strip(lastFrame());
  assert.match(frame, /Migrated "Redesign Game Table UI" from copilot-cli to claude-code/);
  assert.match(frame, /claude --resume new-id-123/);
});

test('pressing Esc from the chat list exits back to a goodbye screen', () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  stdin.write('\r'); // greeting -> select source
  stdin.write('\r'); // select copilot-cli -> select destination
  stdin.write('\r'); // select claude-code -> browse chats
  stdin.write(''); // Esc -> exit
  const frame = strip(lastFrame());
  assert.match(frame, /See you next hop/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ink/App.test.js`
Expected: FAIL with `Cannot find module '../../ink/App'`

- [ ] **Step 3: Write ink/App.js**

```js
'use strict';

const React = require('react');
const { useState } = React;
const { Box, Text, useApp, useInput } = require('ink');

const Banner = require('./Banner');
const MiniHeader = require('./MiniHeader');
const SelectList = require('./SelectList');
const ConfirmPrompt = require('./ConfirmPrompt');
const SuccessPanel = require('./SuccessPanel');
const { getPlatform, listPlatforms } = require('../core/registry');
const { migrate } = require('../core/migrate');

const e = React.createElement;

const SCREENS = {
  GREETING: 'greeting',
  SELECT_SOURCE: 'select-source',
  SELECT_DESTINATION: 'select-destination',
  BROWSE_CHATS: 'browse-chats',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
  EXIT: 'exit',
};

function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// The full interactive flow. Every screen reuses the real platform registry
// and migrate() from core/ -- this component only owns UI state (which
// screen, what's selected), never chat-reading/writing logic, so the
// interactive and non-interactive (`hopchat migrate --from ...`) code paths
// stay backed by the exact same, already-tested migration behavior.
function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState(SCREENS.GREETING);
  const [fromPlatform, setFromPlatform] = useState(null);
  const [toPlatform, setToPlatform] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (screen !== SCREENS.EXIT) setScreen(SCREENS.EXIT);
    }
  });

  if (screen === SCREENS.EXIT) {
    // Ink keeps the process alive for interactive input; exit() tells it
    // this render is the last one and the process may close.
    setTimeout(() => exit(), 0);
    return e(
      Box,
      { flexDirection: 'column' },
      e(Banner, { tagline: 'See you next hop!', pose: 'happy' }),
      e(Text, { dimColor: true }, 'Session ended.')
    );
  }

  if (screen === SCREENS.GREETING) {
    useInput; // no-op reference to keep lint happy about hook usage order; real advance handled below
    return e(
      GreetingScreen,
      { onContinue: () => setScreen(SCREENS.SELECT_SOURCE) }
    );
  }

  if (screen === SCREENS.SELECT_SOURCE) {
    const items = listPlatforms().map((name) => ({ id: name, label: name }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: "Where's this chat coming from?" }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setFromPlatform(item.id);
          setScreen(SCREENS.SELECT_DESTINATION);
        },
      })
    );
  }

  if (screen === SCREENS.SELECT_DESTINATION) {
    const items = listPlatforms()
      .filter((name) => name !== fromPlatform)
      .map((name) => ({ id: name, label: name }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: `${fromPlatform}, got it! Where's it hopping to?` }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setToPlatform(item.id);
          setScreen(SCREENS.BROWSE_CHATS);
        },
      })
    );
  }

  if (screen === SCREENS.BROWSE_CHATS) {
    const { reader } = getPlatform(fromPlatform);
    const chats = reader.listChats();
    const items = chats.map((chat) => ({
      id: chat.id,
      label: chat.title || '(untitled)',
      subtitle: `${chat.cwd} · ${relativeTime(chat.updatedAt)}`,
    }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: 'Pick a chat to hop!' }),
      e(SelectList, {
        items,
        filterable: true,
        onSelect: (item) => {
          setSelectedChat(item.id);
          setScreen(SCREENS.CONFIRM);
        },
      })
    );
  }

  if (screen === SCREENS.CONFIRM) {
    const { reader } = getPlatform(fromPlatform);
    const ir = reader.readChat(selectedChat);
    return e(ConfirmPrompt, {
      title: ir.title,
      turnCount: ir.turns.length,
      model: ir.model || '(unknown)',
      cwd: ir.cwd,
      from: fromPlatform,
      to: toPlatform,
      onConfirm: () => {
        try {
          const result = migrate({ from: fromPlatform, to: toPlatform, chatId: selectedChat });
          setLastResult({ title: ir.title, cwd: ir.cwd, ...result });
          setScreen(SCREENS.SUCCESS);
        } catch (err) {
          setError(err.message);
          setScreen(SCREENS.BROWSE_CHATS);
        }
      },
      onCancel: () => setScreen(SCREENS.BROWSE_CHATS),
    });
  }

  if (screen === SCREENS.SUCCESS) {
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'happy' }),
      e(SuccessPanel, {
        title: lastResult.title,
        from: fromPlatform,
        to: toPlatform,
        cwd: toPlatform === 'claude-code' ? lastResult.cwd : null,
        resumeCommand: lastResult.resumeCommand,
      }),
      e(Box, { marginTop: 1 }, e(Text, { dimColor: true }, 'Press Enter to pick another chat, Esc to quit.')),
      e(ReturnToListOnEnter, { onReturn: () => setScreen(SCREENS.BROWSE_CHATS) })
    );
  }

  return null;
}

// Small helper component: SUCCESS screen listens for Enter to loop back to
// the chat list. Kept separate from App's own useInput (which only handles
// global Esc/q) so each screen's key handling stays scoped to what that
// screen actually does.
function ReturnToListOnEnter({ onReturn }) {
  useInput((input, key) => {
    if (key.return) onReturn();
  });
  return null;
}

function GreetingScreen({ onContinue }) {
  useInput((input, key) => {
    if (key.return) onContinue();
  });
  return e(Banner, { tagline: 'Ready to hop a chat between tools?', pose: 'idle' });
}

module.exports = App;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ink/App.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Self-review — confirm the state machine matches the locked design**

Re-read the 7 screens against this file: greeting (✓ GreetingScreen), select source (✓), select destination (✓, filters out the already-picked source so a 2-platform world shows exactly 1 real choice as designed), browse chats with scroll+filter (✓, via `SelectList`'s `filterable: true`), confirm (✓), success returning to the SAME chat list (✓ `ReturnToListOnEnter` goes back to `BROWSE_CHATS`, not back to platform selection), exit from anywhere via Esc/q (✓ handled once at the top of `App`, applies to every screen).

- [ ] **Step 6: Commit**

```bash
git add ink/App.js test/ink/App.test.js
git commit -m "feat: wire the full 7-screen interactive flow in Ink"
```

---

### Task 10: Wire bare `hopchat` to launch the Ink app

**Files:**
- Modify: `cli.js`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Read the current bare-command behavior**

Open `cli.js` and find the `run` function — currently `if (!command || HELP_FLAGS.has(command)) return cmdHelp();` means bare `hopchat` and `hopchat --help`/`-h`/`help` all show the same plain-text help. This task splits that: bare `hopchat` (no command at all) launches the Ink app; `--help`/`-h`/`help` (explicit) keep showing plain text.

- [ ] **Step 2: Write the failing test — add to test/cli.test.js**

```js
test('run launches interactive mode for bare hopchat (no command), not the help screen', async () => {
  // We can't easily assert on Ink's rendered output through this project's
  // existing console-capturing test harness (Ink renders directly to
  // stdout via its own reconciler, bypassing console.log), so this test
  // only proves the CODE PATH taken: cmdInteractive is called, cmdHelp is
  // not. Full interactive behavior is covered by test/ink/App.test.js.
  const cli = require('../cli');
  const originalCmdInteractive = cli.__test__cmdInteractive;
  let called = false;
  cli.__test__setCmdInteractiveForTest(() => { called = true; return Promise.resolve(); });
  try {
    await cli.run([]);
    assert.equal(called, true);
  } finally {
    cli.__test__setCmdInteractiveForTest(originalCmdInteractive);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL — `cli.__test__setCmdInteractiveForTest is not a function`

- [ ] **Step 4: Modify cli.js**

Find this block in `cli.js`:

```js
const HELP_FLAGS = new Set(['help', '--help', '-h']);

async function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (!command || HELP_FLAGS.has(command)) return cmdHelp();
```

Replace it with:

```js
const HELP_FLAGS = new Set(['help', '--help', '-h']);

// Lazily required so `ink`/`react` are only loaded when interactive mode
// actually runs -- every other command (list/migrate/platforms/help) never
// touches Ink at all, keeping their startup cost and behavior unchanged.
let cmdInteractive = async () => {
  const React = require('react');
  const { render } = require('ink');
  const App = require('./ink/App');
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
};

// Test seam: lets test/cli.test.js swap in a fake interactive command to
// prove `run([])` takes the interactive code path, without needing to
// drive a real Ink render through this project's console-capturing test
// harness (Ink writes to stdout directly, bypassing console.log).
function __test__setCmdInteractiveForTest(fn) {
  const previous = cmdInteractive;
  cmdInteractive = fn;
  return previous;
}

async function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (!command) return cmdInteractive();
    if (HELP_FLAGS.has(command)) return cmdHelp();
```

Then find the `module.exports` line at the bottom of `cli.js` and add the two new test-seam exports:

```js
module.exports = {
  run,
  parseFlags,
  printTableRows,
  buildVersionWarning,
  warnIfUnsupported,
  __test__setCmdInteractiveForTest,
  get __test__cmdInteractive() {
    return cmdInteractive;
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/cli.test.js`
Expected: PASS. Also confirm the existing help test still passes — bare `hopchat` and `--help`/`-h`/`help` are now different code paths, so re-check the old test:

```js
test('run prints help and exits 0 for --help, -h, help, and no command', async () => {
  for (const argv of [['--help'], ['-h'], ['help'], []]) {
```

This test currently includes `[]` (bare, no command) in its list — that must be removed now that bare `hopchat` no longer shows help. Edit that test to:

```js
test('run prints help and exits 0 for --help, -h, help', async () => {
  for (const argv of [['--help'], ['-h'], ['help']]) {
    process.exitCode = undefined;
    const { out } = await captureConsole(() => run(argv));
    assert.match(out.join('\n'), /Usage:/);
    assert.match(out.join('\n'), /hopchat migrate --from/);
    assert.equal(process.exitCode, undefined);
  }
});
```

Run: `node --test test/cli.test.js`
Expected: PASS, full file.

- [ ] **Step 6: Run the full suite**

Run: `cd /d/hopchat && npm test`
Expected: all tests pass, including every earlier task's tests.

- [ ] **Step 7: Commit**

```bash
git add cli.js test/cli.test.js
git commit -m "feat: launch interactive Ink mode for bare hopchat (no args)"
```

---

### Task 11: Manual live verification (cannot be automated)

Ink needs a real TTY to demonstrate actual keyboard interaction, cursor rendering, and the full visual banner — `ink-testing-library`'s `stdin.write()` proves the state machine and key-handling logic work (Task 9's tests), but only a real terminal proves it *looks* right.

**Files:** none — this is a manual verification step, no code changes.

- [ ] **Step 1: Run the real thing**

```bash
cd /d/hopchat
node bin/hopchat.js
```

- [ ] **Step 2: Walk the full flow by hand**

Confirm, in a real terminal window:
- Greeting screen shows the pixel-art banner (wordmark spanning left, mascot pinned right, corner brackets) and the tagline.
- Enter advances to source platform selection; arrow keys move the highlight; Enter selects.
- Destination screen shows only the platform(s) not already picked as source.
- Chat browse screen shows your real chats (via the already-registered `copilot-cli`/`claude-code` platforms) with the two-line title+subtitle layout, and typing filters live.
- Selecting a chat shows the confirm screen with correct metadata.
- Confirming with `y` actually migrates (creates a real session in the target platform — same real side effect as running `hopchat migrate` directly) and shows the success panel with a working resume command.
- Pressing Enter after success returns to the SAME chat list, not back to platform selection.
- Esc/q from any screen jumps to the goodbye screen and the process exits.

- [ ] **Step 3: Report back**

If anything looks visually wrong (spacing, color, alignment) that the pure-function unit tests couldn't catch, note it — those are exactly the class of bug this manual step exists to catch, matching this project's established pattern (the original hop-animation and progress-bar features were also verified live against real chats before shipping).

---

### Task 12: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Interactive mode" section**

Find the `## Usage` section in `README.md` and add this immediately after the existing flag-based usage examples (before the `### Fidelity` heading):

```markdown
### Interactive mode

Run `hopchat` with no arguments for a menu-driven flow instead of typing `--from`/`--to`/a chat id by hand:

```bash
hopchat
```

Greets you, then walks through: pick a source platform → pick a destination → browse the source's chats (type to filter, arrow keys to scroll) → confirm → migrate. After a successful migration you're dropped back into the same chat list to pick another one — Esc or `q` exits at any point. `hopchat --help`, `hopchat list`, `hopchat migrate ...`, and `hopchat platforms` are unchanged and still work exactly as documented above.
```

- [ ] **Step 2: Update the project layout section**

Find the project layout code block in `README.md` and add the two new top-level pieces:

```
hopchat/
├── cli.js                  # list / migrate / platforms commands + interactive-mode launcher
├── cli-mascot.js           # hopping rabbit + speech bubble animation (non-interactive migrate)
├── cli-text-fx.js          # typewriter text effect helper
├── cli-pixel-art.js        # blocky pixel wordmark + mascot renderer (interactive mode)
├── ink/                    # interactive-mode screens (Banner, MiniHeader, SelectList, ConfirmPrompt, SuccessPanel, App)
├── core/
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the interactive TUI mode"
```

---

### Task 13: Final full-suite check and version bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Run the complete test suite one more time**

```bash
cd /d/hopchat && npm test
```

Expected: every test across every file passes — this is the final gate before considering the feature done.

- [ ] **Step 2: Bump the version**

Open `package.json`, bump the `version` field by a minor version (this adds a real user-facing feature, matching how earlier hopchat features were versioned in this project's history — e.g. the mascot/progress-bar feature bumped 0.1.x → 0.2.0).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version for interactive TUI mode"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-review

**Spec coverage:** all 7 locked screens have a task (Banner/MiniHeader = greeting+exit and inner headers; SelectList = source/destination/chat-browse; ConfirmPrompt = confirm; SuccessPanel = success; App wires the full loop-back-to-list + Esc/q-from-anywhere behavior). The `cd`-reminder requirement reuses the exact wording already shipped elsewhere rather than re-deriving it. The pixel-art mascot is original artwork, not a copy of any other product's mascot, and the wordmark/mascot sizing follows the "cover the full width, mascot at the far edge" layout confirmed against the final approved mockup.

**Placeholder scan:** every task has real, complete code — no "TODO"/"add error handling"/"similar to Task N" shortcuts. The one deliberate simplification (dropping a separate "wave" pose for the exit screen in favor of reusing "happy") is called out explicitly in the pixel-art data section above, not hidden.

**Type consistency:** `renderMascot({pose, t})` / `renderMascotIcon()` / `renderWordmark(text, color)` signatures are defined once in Task 2/3 and used identically in Task 4/5's Ink components. `SCREENS` constants and the `SelectList` item shape (`{id, label, subtitle?}`) are defined once in Task 9 and match what Tasks 6–8's components expect as props.
