'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlags, printTableRows, buildVersionWarning } = require('../cli');

test('parseFlags splits --key value pairs from positional args', () => {
  const { flags, positional } = parseFlags(['--from', 'copilot-cli', '--to', 'claude-code', 'chat-123']);
  assert.deepEqual(flags, { from: 'copilot-cli', to: 'claude-code' });
  assert.deepEqual(positional, ['chat-123']);
});

test('parseFlags handles no flags at all', () => {
  const { flags, positional } = parseFlags(['copilot-cli']);
  assert.deepEqual(flags, {});
  assert.deepEqual(positional, ['copilot-cli']);
});

test('printTableRows renders a header, separator, and one line per row', () => {
  const lines = printTableRows([{ id: 'a1', title: 'Chat One' }], ['id', 'title']);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /id\s+title/);
  assert.match(lines[2], /a1\s+Chat One/);
});

test('printTableRows returns a single line for an empty row set', () => {
  const lines = printTableRows([], ['id', 'title']);
  assert.deepEqual(lines, ['(no chats found)']);
});

const VERSIONS = { command: 'copilot', range: ['1.0.60', '1.0.70'] };

test('buildVersionWarning returns null when the version is verified and supported', () => {
  assert.equal(
    buildVersionWarning(VERSIONS, { installed: '1.0.65', supported: true, verified: true }),
    null
  );
});

test('buildVersionWarning warns when verified but outside the tested range', () => {
  const msg = buildVersionWarning(VERSIONS, { installed: '9.9.9', supported: false, verified: true });
  assert.match(msg, /outside the tested range/);
  assert.match(msg, /9\.9\.9/);
  assert.match(msg, /will still be attempted/);
});

test('buildVersionWarning warns when the installed CLI could not be verified', () => {
  const msg = buildVersionWarning(VERSIONS, { installed: null, supported: false, verified: false });
  assert.match(msg, /could not verify/);
  assert.match(msg, /will still be attempted/);
});

test('buildVersionWarning returns null when no version descriptor is provided', () => {
  assert.equal(buildVersionWarning(null, { installed: '1.0.0', supported: true, verified: true }), null);
});
