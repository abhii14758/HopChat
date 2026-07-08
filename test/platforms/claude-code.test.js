'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { listChats, readChat, sanitizeCwdToProjectDir } = require('../../platforms/claude-code/reader');
const fs = require('node:fs');
const { writeChat } = require('../../platforms/claude-code/writer');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'claude-code');

function withFakeHome(fn) {
  const original = os.homedir;
  os.homedir = () => FIXTURE_ROOT;
  try {
    return fn();
  } finally {
    os.homedir = original;
  }
}

test('sanitizeCwdToProjectDir replaces non-alphanumerics with dashes', () => {
  assert.equal(
    sanitizeCwdToProjectDir('C:\\Users\\25070102\\Desktop\\IFP\\mybot_frontend'),
    'C--Users-25070102-Desktop-IFP-mybot-frontend'
  );
});

test('listChats finds the fixture session', () => {
  const chats = withFakeHome(() => listChats());
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, 'fixture-session-001');
});

test('readChat condenses tool_use into narrations and skips tool_result-only turns', () => {
  const ir = withFakeHome(() => readChat('fixture-session-001'));
  assert.equal(ir.turns.length, 3);
  assert.equal(ir.turns[0].text, 'List files in src/');
  assert.equal(ir.turns[1].role, 'assistant');
  assert.deepEqual(ir.turns[1].toolNarrations, ['Called glob']);
  assert.equal(ir.turns[2].text, 'Found 3 files: index.js, app.js, utils.js.');
  assert.equal(ir.model, 'claude-sonnet-4.6');
  assert.equal(ir.gitBranch, 'main');
});

test('readChat throws a clear error for an unknown session id', () => {
  assert.throws(() => withFakeHome(() => readChat('does-not-exist')), /No Claude Code chat found/);
});

test('writeChat writes a session file readChat can parse back', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-1',
    title: 'Round trip',
    cwd: 'C:\\repo\\other-project',
    gitBranch: 'dev',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there', toolNarrations: ['Called grep'] },
    ],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      assert.equal(result.resumeCommand, `claude --resume ${newChatId}`);
      const readBack = readChat(newChatId);
      assert.equal(readBack.turns[0].text, 'Hello');
      assert.match(readBack.turns[1].text, /Hi there/);
      assert.match(readBack.turns[1].text, /Called grep/);
    });
  } finally {
    const projectDir = path.join(FIXTURE_ROOT, '.claude', 'projects', sanitizeCwdToProjectDir(ir.cwd));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('readChat throws a clear user-facing error when the chat has no cwd', () => {
  const projectDir = path.join(FIXTURE_ROOT, '.claude', 'projects', 'sample-project');
  const file = path.join(projectDir, 'fixture-no-cwd.jsonl');
  try {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      file,
      '{"type":"user","message":{"role":"user","content":"hi"},"uuid":"u1","timestamp":"2026-01-01T00:00:00.000Z","sessionId":"fixture-no-cwd","gitBranch":"main"}\n'
    );
    withFakeHome(() => {
      assert.throws(() => readChat('fixture-no-cwd'), /no working directory/);
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
});

module.exports = { withFakeHome, FIXTURE_ROOT };
