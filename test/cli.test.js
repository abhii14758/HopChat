'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlags, printTableRows, buildVersionWarning, run } = require('../cli');

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

function captureConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const out = [];
  const err = [];
  console.log = (...args) => out.push(args.join(' '));
  console.error = (...args) => err.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { out, err };
}

test('run prints help and exits 0 for --help, -h, help, and no command', () => {
  for (const argv of [['--help'], ['-h'], ['help'], []]) {
    process.exitCode = undefined;
    const { out } = captureConsole(() => run(argv));
    assert.match(out.join('\n'), /Usage:/);
    assert.match(out.join('\n'), /hopchat migrate --from/);
    assert.equal(process.exitCode, undefined);
  }
});

test('run sets exit code 1 and prints usage for an unknown command', () => {
  process.exitCode = undefined;
  const { err } = captureConsole(() => run(['bogus-command']));
  assert.match(err.join('\n'), /Unknown command "bogus-command"/);
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test('printTableRows truncates values longer than the column cap with an ellipsis', () => {
  const longCwd = 'C:\\' + 'a'.repeat(80);
  const lines = printTableRows([{ id: 'a1', cwd: longCwd }], ['id', 'cwd']);
  const dataLine = lines[2];
  assert.ok(!dataLine.includes(longCwd), 'the full untruncated path should not appear');
  assert.match(dataLine, /…/);
});

test('printTableRows leaves short values untouched', () => {
  const lines = printTableRows([{ id: 'a1', title: 'Short title' }], ['id', 'title']);
  assert.match(lines[2], /a1\s+Short title/);
});
