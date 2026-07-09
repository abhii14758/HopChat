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
  const stripped = lines[0].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped.length, 17);
});

test('renderWordmark uses a colored block character for "on" pixels and a space for "off" pixels', () => {
  const lines = renderWordmark('T');
  const stripped = lines[0].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, '█████');
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

const { renderMascot, renderMascotIcon } = require('../cli-pixel-art');

test('renderMascot returns 8 lines, each 15 visible columns wide', () => {
  // Mascot is deliberately sized to match the wordmark's own 7-row height
  // (see cli-pixel-art.js) -- the original 16-row design rendered much
  // taller than "HOPCHAT" once measured through Ink's real layout engine.
  const lines = renderMascot({ pose: 'idle', t: 0 });
  assert.equal(lines.length, 8);
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(stripped.length, 15, `line "${stripped}" should be 15 columns`);
  }
});

test('renderMascot in "idle" pose at t=0 has both eyes open (not mid-blink)', () => {
  const lines = renderMascot({ pose: 'idle', t: 0 });
  const stripped = lines[4].replace(/\x1b\[[0-9;]*m/g, '');
  // eye row is row 4 in the 8-row mascot; K sits at columns 4 and 10
  assert.equal(stripped[4], '█');
  assert.equal(stripped[10], '█');
});

test('renderMascot in "idle" pose blinks (closes eyes) at a specific point in the cycle', () => {
  const lines = renderMascot({ pose: 'idle', t: 2500 });
  const stripped = lines[4].replace(/\x1b\[[0-9;]*m/g, '');
  // blinking sets the eye pixels to blank (space), not just a different
  // color -- verified distinguishable from open eyes even with chalk's
  // colors stripped entirely, which is what happens in this test environment
  assert.equal(stripped[4], ' ');
  assert.equal(stripped[10], ' ');
});

test('renderMascot "alert" pose widens the eyes relative to "idle"', () => {
  const idle = renderMascot({ pose: 'idle', t: 0 }).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const alert = renderMascot({ pose: 'alert', t: 0 }).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
  assert.notEqual(idle[4], alert[4]);
});

test('renderMascot "happy" pose renders without throwing and returns 8 lines', () => {
  const lines = renderMascot({ pose: 'happy', t: 0 });
  assert.equal(lines.length, 8);
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
