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

test('pressing "y" calls onConfirm', async () => {
  let confirmed = false;
  const { stdin } = render(
    e(ConfirmPrompt, {
      title: 't', turnCount: 1, model: 'm', cwd: 'c', from: 'a', to: 'b',
      onConfirm: () => { confirmed = true; },
      onCancel: () => {},
    })
  );
  // Ink's useInput attaches its stdin listener in a passive effect; let React
  // flush it before driving input through ink-testing-library's sync stdin.
  await new Promise(resolve => setImmediate(resolve));
  stdin.write('y');
  assert.equal(confirmed, true);
});

test('pressing "n" calls onCancel', async () => {
  let cancelled = false;
  const { stdin } = render(
    e(ConfirmPrompt, {
      title: 't', turnCount: 1, model: 'm', cwd: 'c', from: 'a', to: 'b',
      onConfirm: () => {},
      onCancel: () => { cancelled = true; },
    })
  );
  await new Promise(resolve => setImmediate(resolve));
  stdin.write('n');
  assert.equal(cancelled, true);
});
