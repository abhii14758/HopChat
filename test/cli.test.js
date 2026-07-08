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

function withTerminalWidth(columns, fn) {
  const original = process.stdout.columns;
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
  }
}

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

test('printTableRows adapts flexible column width to a narrow terminal', () => {
  const longTitle = 'A'.repeat(200);
  withTerminalWidth(80, () => {
    const lines = printTableRows([{ id: 'a1', title: longTitle }], ['id', 'title']);
    for (const line of lines) {
      assert.ok(line.length <= 80, `line exceeds terminal width: "${line}" (${line.length} chars)`);
    }
    assert.match(lines[2], /…/);
  });
});

test('printTableRows gives flexible columns more room on a wide terminal', () => {
  const title = 'A'.repeat(100);
  withTerminalWidth(200, () => {
    const lines = printTableRows([{ id: 'a1', title }], ['id', 'title']);
    assert.ok(lines[2].includes(title), 'title should fit untruncated on a wide terminal');
  });
});

test('printTableRows falls back to a default width when not a TTY (columns undefined)', () => {
  withTerminalWidth(undefined, () => {
    const lines = printTableRows([{ id: 'a1', title: 'Chat One' }], ['id', 'title']);
    assert.match(lines[2], /a1\s+Chat One/);
  });
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

test('printTableRows truncates values longer than the available column width with an ellipsis', () => {
  const longCwd = 'C:\\' + 'a'.repeat(200);
  withTerminalWidth(80, () => {
    const lines = printTableRows([{ id: 'a1', cwd: longCwd }], ['id', 'cwd']);
    const dataLine = lines[2];
    assert.ok(!dataLine.includes(longCwd), 'the full untruncated path should not appear');
    assert.match(dataLine, /…/);
  });
});

test('printTableRows never truncates id, even on a narrow terminal, since it must stay copy-pasteable', () => {
  const realUuid = '01e0c97e-66dc-4869-9e6a-bf1e205ce6d2';
  withTerminalWidth(60, () => {
    const lines = printTableRows([{ id: realUuid, title: 'Something long here' }], ['id', 'title']);
    assert.ok(lines[2].includes(realUuid), 'the full id must always be present, uncut, for copy-paste into migrate');
  });
});

test('printTableRows caps updatedAt at its fixed width regardless of terminal size', () => {
  const longUpdatedAt = 'x'.repeat(100);
  withTerminalWidth(300, () => {
    const lines = printTableRows([{ id: 'a1', updatedAt: longUpdatedAt }], ['id', 'updatedAt']);
    assert.ok(!lines[2].includes(longUpdatedAt), 'updatedAt longer than its fixed cap should be truncated even on a wide terminal');
  });
});

test('printTableRows keeps every line within the terminal width even when id + gutters barely fit', () => {
  const realUuid = '01e0c97e-66dc-4869-9e6a-bf1e205ce6d2';
  withTerminalWidth(45, () => {
    const lines = printTableRows(
      [{ id: realUuid, title: 'Some title', updatedAt: '2026-01-01T00:00:00.000Z', cwd: 'C:\\some\\long\\path' }],
      ['id', 'title', 'updatedAt', 'cwd']
    );
    assert.ok(lines[2].includes(realUuid), 'id still uncut even in this extreme narrow case');
  });
});

test('printTableRows leaves short values untouched', () => {
  const lines = printTableRows([{ id: 'a1', title: 'Short title' }], ['id', 'title']);
  assert.match(lines[2], /a1\s+Short title/);
});
