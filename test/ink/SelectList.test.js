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

// Ink's `useInput` attaches its stdin `data` listener from a passive effect,
// which flushes on a later macrotask — not during the initial commit. So a
// `stdin.write(...)` issued synchronously right after `render(...)` is emitted
// before any listener exists and is lost (EventEmitter does not buffer). These
// tests `await tick()` before writing (let the listener attach) and again
// after writing (let the state update + re-render flush) before reading the
// frame. In a real terminal the effect is always attached before a keystroke,
// so this is purely a test-harness timing concern.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  assert.match(copilotLine, /^>/);
});

test('pressing down arrow moves the selection to the next item', async () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {} }));
  await tick();
  stdin.write('[B'); // down arrow (ESC [ B)
  await tick();
  const frame = strip(lastFrame());
  const lines = frame.split('\n');
  const claudeLine = lines.find((l) => l.includes('claude-code'));
  assert.match(claudeLine, /^>/);
});

test('pressing Enter calls onSelect with the currently highlighted item', async () => {
  const items = [{ id: 'a', label: 'copilot-cli' }, { id: 'b', label: 'claude-code' }];
  let selected = null;
  const { stdin } = render(e(SelectList, { items, onSelect: (item) => { selected = item; } }));
  await tick();
  stdin.write('\r');
  await tick();
  assert.equal(selected.id, 'a');
});

test('typing filters the list by substring match on label when filterable is true', async () => {
  const items = [
    { id: 'a', label: 'Redesign Game Table UI' },
    { id: 'b', label: 'Fix login bug' },
    { id: 'c', label: 'Review Codebase' },
  ];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {}, filterable: true }));
  await tick();
  stdin.write('re');
  await tick();
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
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('renders a subtitle line under each item label when provided', () => {
  const items = [{ id: 'a', label: 'Redesign Game Table UI', subtitle: 'D:\\3ofspades · 2 days ago' }];
  const { lastFrame } = render(e(SelectList, { items, onSelect: () => {} }));
  const frame = strip(lastFrame());
  assert.match(frame, /D:\\3ofspades · 2 days ago/);
});

test('renders "(no matches)" when a filter query matches nothing', async () => {
  const items = [{ id: 'a', label: 'copilot-cli' }];
  const { lastFrame, stdin } = render(e(SelectList, { items, onSelect: () => {}, filterable: true }));
  await tick();
  stdin.write('zzzzz');
  await tick();
  const frame = strip(lastFrame());
  assert.match(frame, /no matches/i);
});
