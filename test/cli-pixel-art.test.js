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
  const stripped = lines[8].replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped.slice(6, 8), '██');
  assert.equal(stripped.slice(10, 12), '██');
});

test('renderMascot in "idle" pose blinks (closes eyes) at a specific point in the cycle', () => {
  const lines = renderMascot({ pose: 'idle', t: 2500 });
  const stripped = lines[8].replace(/\x1b\[[0-9;]*m/g, '');
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
