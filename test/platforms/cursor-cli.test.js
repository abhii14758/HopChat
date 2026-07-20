'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { listChats, readChat } = require('../../platforms/cursor-cli/reader');
const { writeChat } = require('../../platforms/cursor-cli/writer');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'cursor-cli');

function withFakeHome(fn) {
  const original = os.homedir;
  os.homedir = () => FIXTURE_ROOT;
  try {
    return fn();
  } finally {
    os.homedir = original;
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
  assert.equal(ir.sourcePlatform, 'cursor-cli');
  assert.equal(ir.turns.length, 2);
  assert.equal(ir.turns[0].role, 'user');
  assert.equal(ir.turns[0].text, 'List files in src/');
  assert.equal(ir.turns[1].role, 'assistant');
  assert.match(ir.turns[1].text, /I found 3 files/);
  assert.deepEqual(ir.turns[1].toolNarrations, ['Called glob']);
});

test('readChat throws a clear error for an unknown chat id', () => {
  assert.throws(() => withFakeHome(() => readChat('does-not-exist')), /No Cursor CLI chat found/);
});

test('readChat rejects a chat id containing a path separator or ".." (path-traversal guard)', () => {
  assert.throws(() => withFakeHome(() => readChat('../evil')), /Invalid chat id/);
  assert.throws(() => withFakeHome(() => readChat('..\\evil')), /Invalid chat id/);
});

test('writeChat produces a chat that readChat can parse back with the same turns', () => {
  const ir = {
    sourcePlatform: 'cursor-cli',
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
      assert.equal(result.resumeCommand, `cursor --resume ${newChatId}`);
      const readBack = readChat(newChatId);
      assert.equal(readBack.turns.length, 2);
      assert.equal(readBack.turns[0].text, 'Hello');
      assert.match(readBack.turns[1].text, /Hi there/);
      assert.match(readBack.turns[1].text, /Called glob/);
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.cursor', 'chats', `${newChatId}.json`), { force: true });
    }
  }
});

test('writeChat preserves the model field through a round trip', () => {
  const ir = {
    sourcePlatform: 'cursor-cli',
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
      fs.rmSync(path.join(FIXTURE_ROOT, '.cursor', 'chats', `${newChatId}.json`), { force: true });
    }
  }
});

test('writeChat and readChat round-trip a POSIX-style cwd correctly', () => {
  const ir = {
    sourcePlatform: 'cursor-cli',
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
      fs.rmSync(path.join(FIXTURE_ROOT, '.cursor', 'chats', `${newChatId}.json`), { force: true });
    }
  }
});

module.exports = { withFakeHome, FIXTURE_ROOT };
