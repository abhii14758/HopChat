'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, typewrite, typewriteLine } = require('../cli-text-fx');

test('tokenize splits plain text into one token per character', () => {
  const tokens = tokenize('abc');
  assert.deepEqual(tokens, [
    { type: 'char', value: 'a' },
    { type: 'char', value: 'b' },
    { type: 'char', value: 'c' },
  ]);
});

test('tokenize keeps a full ANSI escape sequence as one token, never splitting it', () => {
  const tokens = tokenize('\x1b[36mhi\x1b[39m');
  assert.deepEqual(tokens, [
    { type: 'ansi', value: '\x1b[36m' },
    { type: 'char', value: 'h' },
    { type: 'char', value: 'i' },
    { type: 'ansi', value: '\x1b[39m' },
  ]);
});

test('tokenize handles text with no ANSI codes at all', () => {
  const tokens = tokenize('');
  assert.deepEqual(tokens, []);
});

test('tokenize handles back-to-back ANSI codes with no visible characters between them', () => {
  const tokens = tokenize('\x1b[1m\x1b[36mX');
  assert.deepEqual(tokens, [
    { type: 'ansi', value: '\x1b[1m' },
    { type: 'ansi', value: '\x1b[36m' },
    { type: 'char', value: 'X' },
  ]);
});

test('typewrite writes the full text in one shot when stdout is not a TTY', async () => {
  const original = process.stdout.write;
  const originalIsTTY = process.stdout.isTTY;
  let written = '';
  process.stdout.write = (chunk) => {
    written += chunk;
    return true;
  };
  process.stdout.isTTY = false;
  try {
    await typewrite('hello \x1b[36mworld\x1b[39m');
  } finally {
    process.stdout.write = original;
    process.stdout.isTTY = originalIsTTY;
  }
  assert.equal(written, 'hello \x1b[36mworld\x1b[39m');
});

test('typewrite writes instantly when charDelayMs is 0, even with isTTY true', async () => {
  const original = process.stdout.write;
  const originalIsTTY = process.stdout.isTTY;
  let written = '';
  process.stdout.write = (chunk) => {
    written += chunk;
    return true;
  };
  process.stdout.isTTY = true;
  try {
    await typewrite('fast', { charDelayMs: 0 });
  } finally {
    process.stdout.write = original;
    process.stdout.isTTY = originalIsTTY;
  }
  assert.equal(written, 'fast');
});

test('typewriteLine appends a trailing newline', async () => {
  const original = process.stdout.write;
  const originalIsTTY = process.stdout.isTTY;
  let written = '';
  process.stdout.write = (chunk) => {
    written += chunk;
    return true;
  };
  process.stdout.isTTY = false;
  try {
    await typewriteLine('done');
  } finally {
    process.stdout.write = original;
    process.stdout.isTTY = originalIsTTY;
  }
  assert.equal(written, 'done\n');
});
