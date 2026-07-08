'use strict';

const chalk = require('chalk');

// A hopping rabbit -- "hop" for the motion between platforms, the speech
// bubble for "chat". Four poses give the hop real vertical physics instead
// of a horizontal slide: grounded (legs down, feet planted), airborne (ears
// swept back, legs tucked -- shown near the peak of each hop's arc), squash
// (compressed on landing impact between hops), and happy (grounded, eyes
// ^.^, shown once the mascot reaches the target).
const RABBIT_POSES = {
  grounded: [' (\\(\\  ', ' (-.-) ', 'o_(")(")'],
  airborne: [' \\(\\_  ', ' (-.-) ', ' (")(") '],
  squash: ['        ', '(-.-)  ', '(">.<")='],
  happy: [' (\\(\\  ', ' (^.^) ', 'o_(")(")'],
};
const RABBIT_HEIGHT = RABBIT_POSES.grounded.length;
const RABBIT_WIDTH = Math.max(...Object.values(RABBIT_POSES).flat().map((l) => l.length));
const MAX_ARC_ROWS = 3;

function stripAnsiLength(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Wrap `lines` in a speech-bubble box.
function speechBubbleLines(lines) {
  const width = Math.max(...lines.map(stripAnsiLength));
  const top = ' ' + '_'.repeat(width + 2);
  const bottom = ' ' + '-'.repeat(width + 2);
  const body = lines.map((l) => `| ${l}${' '.repeat(width - stripAnsiLength(l))} |`);
  return [top, ...body, bottom];
}

// Pure: one full animation frame as an array of plain-text lines.
//
// The mascot moves on two independent axes: `x` (horizontal position along
// a track of `trackWidth` running from `fromLabel` to `toLabel`) and
// `arcRows` (0 = grounded, up to `maxArcRows` = peak of the hop -- shifts
// the mascot's rows up within a fixed-height "stage" so the hop actually
// arcs instead of translating sideways at a constant height). The speech
// bubble is pinned to the top rows of that same stage and follows the
// mascot's x position, so it doesn't jump around vertically as the mascot
// hops but still visually travels with it.
//
// No terminal/ANSI I/O here -- kept separate so the frame math is
// unit-testable without a real TTY.
function renderFrame({ x, trackWidth, fromLabel, toLabel, arcRows = 0, pose = 'grounded', bubbleLines, maxArcRows = MAX_ARC_ROWS }) {
  const mascot = RABBIT_POSES[pose] || RABBIT_POSES.grounded;
  const bubble = speechBubbleLines(bubbleLines);

  const clampedX = Math.max(0, Math.min(x, trackWidth - RABBIT_WIDTH));
  const indent = ' '.repeat(clampedX);
  const blankMascotRow = ' '.repeat(RABBIT_WIDTH);

  const trackLine = `${fromLabel}${' '.repeat(Math.max(1, trackWidth - fromLabel.length - toLabel.length))}${toLabel}`;

  const stageHeight = maxArcRows + RABBIT_HEIGHT;
  const clampedArcRows = Math.max(0, Math.min(arcRows, maxArcRows));
  const mascotTopRow = stageHeight - RABBIT_HEIGHT - clampedArcRows;
  // Pin the bubble's top row level with the mascot's head (one row above its
  // topmost row) so it always sits right beside the mascot as it rises and
  // falls through the arc, rather than staying fixed at the top of the stage.
  const bubbleTopRow = Math.max(0, mascotTopRow - 1);

  const totalRows = Math.max(stageHeight, bubbleTopRow + bubble.length);
  const lines = [];
  for (let row = 0; row < totalRows; row++) {
    const mascotRowIndex = row - mascotTopRow;
    const mascotCell = mascotRowIndex >= 0 && mascotRowIndex < mascot.length ? mascot[mascotRowIndex] : blankMascotRow;
    const bubbleRowIndex = row - bubbleTopRow;
    const bubbleCell = bubbleRowIndex >= 0 && bubbleRowIndex < bubble.length ? bubble[bubbleRowIndex] : '';
    lines.push(bubbleCell ? `${indent}${mascotCell.padEnd(RABBIT_WIDTH)}   ${bubbleCell}` : `${indent}${mascotCell}`);
  }
  lines.push(trackLine);
  return lines;
}

function moveCursorUp(n) {
  if (n > 0) process.stdout.write(`\x1b[${n}A`);
}
function clearLine() {
  process.stdout.write('\x1b[2K\r');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HOPS_PER_LEG = 2;
const STEPS_PER_HOP = 6;

// One sine-arc hop: arcRows rises and falls smoothly across the hop's
// duration, and the pose reflects where in the arc the mascot currently is
// -- squash right at takeoff/landing (phase 0 or 1), airborne near the peak,
// grounded in between.
function poseForPhase(phase, arcRows) {
  if (arcRows === 0 && (phase < 0.12 || phase > 0.88)) return 'squash';
  if (arcRows > 0) return 'airborne';
  return 'grounded';
}

// Animate the rabbit hopping from `fromLabel` to `toLabel`. `stages` is an
// ordered list of { bubbleLines } shown one per leg of the hop. Stage 0 is
// shown at rest (the mascot hasn't started moving -- it's still "reading"
// at the source); each subsequent stage is one leg of hopping motion,
// arriving with a `happy` pose on the very last frame. Falls back to a
// single static frame when stdout isn't a TTY (piped, CI, tests) since
// cursor-movement escapes would just spam a log file there.
async function animateHopBetween({ fromLabel, toLabel, stages, trackWidth = 46, stepMs = 90, happy = true }) {
  if (!process.stdout.isTTY) {
    const frame = renderFrame({
      x: trackWidth - RABBIT_WIDTH,
      trackWidth,
      fromLabel,
      toLabel,
      arcRows: 0,
      maxArcRows: 0, // static frame, no hop in progress: no arc headroom needed
      pose: happy ? 'happy' : 'grounded',
      bubbleLines: stages[stages.length - 1]?.bubbleLines ?? [],
    });
    for (const line of frame) console.log(chalk.cyan(line));
    return;
  }

  const usableWidth = trackWidth - RABBIT_WIDTH;
  const legWidth = stages.length > 1 ? usableWidth / (stages.length - 1) : 0;
  let printedLines = 0;

  const draw = async (x, arcRows, pose, bubbleLines) => {
    const frame = renderFrame({ x, trackWidth, fromLabel, toLabel, arcRows, pose, bubbleLines });
    moveCursorUp(printedLines);
    for (const line of frame) {
      clearLine();
      process.stdout.write(chalk.cyan(line) + '\n');
    }
    printedLines = frame.length;
    await sleep(stepMs);
  };

  // Stage 0: at rest at the start, showing its bubble text, before any hop begins.
  if (stages.length > 0) {
    await draw(0, 0, 'grounded', stages[0].bubbleLines);
  }

  for (let stageIndex = 1; stageIndex < stages.length; stageIndex++) {
    const legStartX = legWidth * (stageIndex - 1);
    const isLastStage = stageIndex === stages.length - 1;

    for (let hop = 0; hop < HOPS_PER_LEG; hop++) {
      for (let step = 0; step < STEPS_PER_HOP; step++) {
        const phase = step / (STEPS_PER_HOP - 1);
        const arcRows = Math.round(MAX_ARC_ROWS * Math.sin(phase * Math.PI));
        const x = legStartX + legWidth * (hop + phase) / HOPS_PER_LEG;
        const isFinalFrame = isLastStage && hop === HOPS_PER_LEG - 1 && step === STEPS_PER_HOP - 1;
        const pose = isFinalFrame && happy ? 'happy' : poseForPhase(phase, arcRows);
        await draw(x, arcRows, pose, stages[stageIndex].bubbleLines);
      }
    }
  }
}

// Non-animated, single-frame mascot for places that don't need a hop (e.g.
// the help screen) -- always safe to call, animated or not.
function printStaticMascot(bubbleLines, happy = false) {
  const frame = renderFrame({
    x: 0,
    trackWidth: RABBIT_WIDTH,
    fromLabel: '',
    toLabel: '',
    arcRows: 0,
    maxArcRows: 0, // no hop happening here, so reserve no headroom for an arc peak
    pose: happy ? 'happy' : 'grounded',
    bubbleLines,
  });
  // Drop the (empty) track line for the standalone greeting use case.
  for (const line of frame.slice(0, -1)) console.log(chalk.cyan(line));
}

module.exports = {
  renderFrame,
  speechBubbleLines,
  animateHopBetween,
  printStaticMascot,
  poseForPhase,
  RABBIT_POSES,
  RABBIT_WIDTH,
  RABBIT_HEIGHT,
  MAX_ARC_ROWS,
};
