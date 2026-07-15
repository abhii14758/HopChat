'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { listChats, readChat } = require('../../platforms/copilot-cli/reader');
const { writeChat } = require('../../platforms/copilot-cli/writer');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'copilot-cli');

function withFakeHome(fn) {
  const originalHomedir = os.homedir;
  os.homedir = () => FIXTURE_ROOT;
  try {
    return fn();
  } finally {
    os.homedir = originalHomedir;
  }
}

test('listChats finds the fixture chat', () => {
  const chats = withFakeHome(() => listChats());
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, 'fixture-chat-001');
  assert.equal(chats[0].title, 'Sample Fixture Chat');
});

test('readChat parses turns and condenses tool calls into narrations', () => {
  const ir = withFakeHome(() => readChat('fixture-chat-001'));
  assert.equal(ir.sourcePlatform, 'copilot-cli');
  assert.equal(ir.turns.length, 2);
  assert.equal(ir.turns[0].role, 'user');
  assert.equal(ir.turns[0].text, 'List files in src/');
  assert.equal(ir.turns[1].role, 'assistant');
  assert.match(ir.turns[1].text, /Found 3 files/);
  assert.deepEqual(ir.turns[1].toolNarrations, ['Called glob', 'glob finished (ok)']);
});

test('readChat throws a clear error for an unknown chat id', () => {
  assert.throws(() => withFakeHome(() => readChat('does-not-exist')), /No Copilot CLI chat found/);
});

test('readChat rejects a chat id containing a path separator or ".." (path-traversal guard)', () => {
  assert.throws(() => withFakeHome(() => readChat('../evil')), /Invalid chat id/);
  assert.throws(() => withFakeHome(() => readChat('..\\evil')), /Invalid chat id/);
});

test('readChat skips a malformed/truncated events.jsonl line instead of throwing', () => {
  const chatDir = path.join(FIXTURE_ROOT, '.copilot', 'session-state', 'fixture-corrupt-line');
  try {
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(
      chatDir + path.sep + 'workspace.yaml',
      'id: fixture-corrupt-line\ncwd: C:\\repo\nname: Corrupt line chat\ncreated_at: 2026-01-01T00:00:00.000Z\nupdated_at: 2026-01-01T00:00:02.000Z\n'
    );
    const lines = [
      '{"type":"session.start","data":{"sessionId":"fixture-corrupt-line","version":1},"id":"e1","timestamp":"2026-01-01T00:00:00.000Z","parentId":null}',
      '{"type":"user.message","data":{"content":"hi"}"id":"e2"', // truncated/invalid JSON -- simulates a CLI killed mid-write
      '{"type":"user.message","data":{"content":"still readable"},"id":"e3","timestamp":"2026-01-01T00:00:01.000Z","parentId":"e1"}',
    ];
    fs.writeFileSync(chatDir + path.sep + 'events.jsonl', lines.join('\n') + '\n');

    withFakeHome(() => {
      const ir = readChat('fixture-corrupt-line');
      assert.equal(ir.turns.length, 1);
      assert.equal(ir.turns[0].text, 'still readable');
    });
  } finally {
    fs.rmSync(chatDir, { recursive: true, force: true });
  }
});

test('writeChat produces a chat that readChat can parse back with the same turns', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-1',
    title: 'Round trip test',
    cwd: 'C:\\repo',
    gitBranch: 'main',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there', toolNarrations: ['Called glob'] },
    ],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      assert.equal(result.resumeCommand, `copilot --resume=${newChatId}`);
      const readBack = readChat(newChatId);
      assert.equal(readBack.turns.length, 2);
      assert.equal(readBack.turns[0].text, 'Hello');
      assert.match(readBack.turns[1].text, /Hi there/);
      assert.match(readBack.turns[1].text, /Called glob/);
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', newChatId), { recursive: true, force: true });
    }
  }
});

test('writeChat preserves the model field through a round trip', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-2',
    title: 'Model round trip',
    cwd: 'C:\\repo',
    model: 'claude-opus-4.1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'Hi' }],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      const readBack = readChat(newChatId);
      assert.equal(readBack.model, 'claude-opus-4.1');
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', newChatId), { recursive: true, force: true });
    }
  }
});

test('readChat keeps an assistant turn that has tool activity but no text', () => {
  const events = [
    { type: 'session.start', data: { sessionId: 'fixture-tool-only', version: 1 }, id: 'e1', timestamp: '2026-01-01T00:00:00.000Z', parentId: null },
    { type: 'user.message', data: { content: 'Run a command' }, id: 'e2', timestamp: '2026-01-01T00:00:01.000Z', parentId: 'e1' },
    { type: 'tool.execution_start', data: { toolCallId: 't1', toolName: 'bash', turnId: '0' }, id: 'e3', timestamp: '2026-01-01T00:00:02.000Z', parentId: 'e2' },
    { type: 'tool.execution_complete', data: { toolCallId: 't1', success: true, turnId: '0' }, id: 'e4', timestamp: '2026-01-01T00:00:03.000Z', parentId: 'e3' },
    { type: 'assistant.turn_end', data: { turnId: '0' }, id: 'e5', timestamp: '2026-01-01T00:00:04.000Z', parentId: 'e4' },
  ];

  const chatDir = path.join(FIXTURE_ROOT, '.copilot', 'session-state', 'fixture-tool-only');
  try {
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(
      path.join(chatDir, 'workspace.yaml'),
      'id: fixture-tool-only\ncwd: C:\\repo\ncreated_at: 2026-01-01T00:00:00.000Z\nupdated_at: 2026-01-01T00:00:04.000Z\nname: Tool only\n'
    );
    fs.writeFileSync(path.join(chatDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    withFakeHome(() => {
      const ir = readChat('fixture-tool-only');
      assert.equal(ir.turns.length, 2);
      assert.equal(ir.turns[1].role, 'assistant');
      assert.deepEqual(ir.turns[1].toolNarrations, ['Called bash', 'bash finished (ok)']);
    });
  } finally {
    fs.rmSync(chatDir, { recursive: true, force: true });
  }
});

test('readChat throws a clear user-facing error when the chat has no cwd', () => {
  const chatDir = path.join(FIXTURE_ROOT, '.copilot', 'session-state', 'fixture-no-cwd');
  try {
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(
      path.join(chatDir, 'workspace.yaml'),
      'id: fixture-no-cwd\ngit_root: C:\\repo\nname: No cwd chat\ncreated_at: 2026-01-01T00:00:00.000Z\nupdated_at: 2026-01-01T00:00:00.000Z\n'
    );
    fs.writeFileSync(
      path.join(chatDir, 'events.jsonl'),
      '{"type":"session.start","data":{"sessionId":"fixture-no-cwd","version":1},"id":"e1","timestamp":"2026-01-01T00:00:00.000Z","parentId":null}\n' +
        '{"type":"user.message","data":{"content":"hi"},"id":"e2","timestamp":"2026-01-01T00:00:01.000Z","parentId":"e1"}\n'
    );
    withFakeHome(() => {
      assert.throws(() => readChat('fixture-no-cwd'), /no working directory/);
    });
  } finally {
    fs.rmSync(chatDir, { recursive: true, force: true });
  }
});

test('writeChat round-trips a title and cwd containing special characters exactly', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-special',
    title: 'Has: a colon, "a quote", a \\backslash, and\na newline',
    cwd: 'C:\\repo with space',
    gitBranch: 'feature/x:y',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hi' }],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      const readBack = readChat(newChatId);
      assert.equal(readBack.title, ir.title, 'title preserved exactly (colon/quote/backslash/newline)');
      assert.equal(readBack.cwd, ir.cwd, 'cwd with space preserved');
      assert.equal(readBack.gitBranch, ir.gitBranch, 'branch with colon preserved');
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', newChatId), { recursive: true, force: true });
    }
  }
});

test('writeChat and readChat round-trip a POSIX-style cwd correctly', () => {
  // Every other fixture/hardcoded cwd in this test suite is Windows-shaped
  // (C:\...) -- a real Copilot CLI install on Linux/macOS would produce a
  // forward-slash, no-drive-letter path instead, and nothing previously
  // proved that case works, only that it was never Windows-assumption-broken
  // by accident.
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-posix',
    title: 'POSIX path round trip',
    cwd: '/home/alice/projects/sample-app',
    gitBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hi' }],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      const readBack = readChat(newChatId);
      assert.equal(readBack.cwd, ir.cwd);
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', newChatId), { recursive: true, force: true });
    }
  }
});

module.exports = { withFakeHome, FIXTURE_ROOT };
