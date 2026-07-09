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
