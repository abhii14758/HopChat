'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  renderFrame,
  speechBubbleLines,
  poseForPhase,
  RABBIT_POSES,
  RABBIT_WIDTH,
  RABBIT_HEIGHT,
  MAX_ARC_ROWS,
} = require('../cli-mascot');

test('speechBubbleLines wraps text in a box sized to the longest line', () => {
  const lines = speechBubbleLines(['short', 'a longer line here']);
  assert.equal(lines.length, 4); // top border + 2 body + bottom border
  const width = 'a longer line here'.length;
  assert.equal(lines[0], ' ' + '_'.repeat(width + 2));
  assert.equal(lines[3], ' ' + '-'.repeat(width + 2));
  assert.equal(lines[1], `| short${' '.repeat(width - 5)} |`);
  assert.equal(lines[2], `| a longer line here |`);
});

test('speechBubbleLines handles a single line', () => {
  const lines = speechBubbleLines(['hello']);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /\| hello \|/);
});

test('renderFrame includes a track line with fromLabel and toLabel at opposite ends', () => {
  const frame = renderFrame({
    x: 0,
    trackWidth: 30,
    fromLabel: 'copilot-cli',
    toLabel: 'claude-code',
    arcRows: 0,
    pose: 'grounded',
    bubbleLines: ['hopping...'],
  });
  const trackLine = frame[frame.length - 1];
  assert.match(trackLine, /^copilot-cli/);
  assert.match(trackLine, /claude-code$/);
});

test('renderFrame clamps x so the mascot never renders past the track width', () => {
  const trackWidth = 30;
  const farFrame = renderFrame({ x: 1000, trackWidth, fromLabel: 'a', toLabel: 'b', arcRows: 0, pose: 'grounded', bubbleLines: ['x'] });
  const clampedFrame = renderFrame({
    x: trackWidth - RABBIT_WIDTH,
    trackWidth,
    fromLabel: 'a',
    toLabel: 'b',
    arcRows: 0,
    pose: 'grounded',
    bubbleLines: ['x'],
  });
  // an x far past the track should render identically to the max valid x
  assert.deepEqual(farFrame, clampedFrame);
});

test('renderFrame raises the mascot rows as arcRows increases (the hop arc)', () => {
  // Only look at the mascot's own column range (0..RABBIT_WIDTH) on each
  // row, ignoring the bubble entirely, so the bubble's borders (which occupy
  // every row regardless of mascot height) can't mask the arc.
  const mascotColumn = (line) => line.slice(0, RABBIT_WIDTH);
  const firstMascotRow = (frame) => frame.slice(0, -1).findIndex((line) => mascotColumn(line).trim().length > 0);

  const grounded = renderFrame({ x: 0, trackWidth: 30, fromLabel: 'a', toLabel: 'b', arcRows: 0, pose: 'grounded', bubbleLines: ['x'] });
  const peak = renderFrame({ x: 0, trackWidth: 30, fromLabel: 'a', toLabel: 'b', arcRows: MAX_ARC_ROWS, pose: 'airborne', bubbleLines: ['x'] });

  assert.ok(firstMascotRow(peak) < firstMascotRow(grounded), 'mascot should appear higher up at arc peak');
});

test('renderFrame uses the happy pose when requested', () => {
  const frame = renderFrame({
    x: 0,
    trackWidth: 30,
    fromLabel: 'a',
    toLabel: 'b',
    arcRows: 0,
    pose: 'happy',
    bubbleLines: ['done'],
  });
  const joined = frame.join('\n');
  assert.match(joined, /\^\.\^/);
});

test('renderFrame shows every bubble line even when the bubble is taller than the mascot', () => {
  const frame = renderFrame({
    x: 0,
    trackWidth: 30,
    fromLabel: '',
    toLabel: '',
    arcRows: 0,
    pose: 'grounded',
    bubbleLines: ['first line of text', 'second line of text', 'third line of text'],
  });
  const joined = frame.join('\n');
  assert.match(joined, /first line of text/);
  assert.match(joined, /second line of text/);
  assert.match(joined, /third line of text/);
});

test('every pose is no wider than RABBIT_WIDTH and no taller than RABBIT_HEIGHT', () => {
  for (const pose of Object.values(RABBIT_POSES)) {
    assert.ok(pose.length <= RABBIT_HEIGHT, `pose has ${pose.length} rows, expected <= ${RABBIT_HEIGHT}`);
    for (const line of pose) {
      assert.ok(line.length <= RABBIT_WIDTH, `line "${line}" exceeds RABBIT_WIDTH`);
    }
  }
});

test('poseForPhase returns squash at takeoff/landing, airborne at height, grounded otherwise', () => {
  assert.equal(poseForPhase(0, 0), 'squash');
  assert.equal(poseForPhase(1, 0), 'squash');
  assert.equal(poseForPhase(0.5, MAX_ARC_ROWS), 'airborne');
  assert.equal(poseForPhase(0.5, 0), 'grounded');
});
