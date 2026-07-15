'use strict';

const { test } = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { runContractTests } = require('../core/contract-tests');
const copilotReader = require('../platforms/copilot-cli/reader');
const copilotWriter = require('../platforms/copilot-cli/writer');
const claudeReader = require('../platforms/claude-code/reader');
const claudeWriter = require('../platforms/claude-code/writer');
const cursorReader = require('../platforms/cursor-cli/reader');
const cursorWriter = require('../platforms/cursor-cli/writer');

const COPILOT_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'copilot-cli');
const CLAUDE_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'claude-code');
const CURSOR_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'cursor-cli');

function sampleIR(sourcePlatform, cwd) {
  return {
    sourcePlatform,
    sourceChatId: 'contract-test',
    title: 'Contract test chat',
    cwd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hello' }],
  };
}

test('copilot-cli platform contract', async (t) => {
  const original = os.homedir;
  os.homedir = () => COPILOT_FIXTURE_ROOT;
  try {
    await runContractTests(t, {
      name: 'copilot-cli',
      reader: copilotReader,
      writer: copilotWriter,
      existingChatId: 'fixture-chat-001',
      sampleIRForWrite: sampleIR('copilot-cli', 'C:\\repo\\contract-test'),
      cleanupWrite: (result) =>
        fs.rmSync(path.join(COPILOT_FIXTURE_ROOT, '.copilot', 'session-state', result.newChatId), {
          recursive: true,
          force: true,
        }),
    });
  } finally {
    os.homedir = original;
  }
});

test('claude-code platform contract', async (t) => {
  const original = os.homedir;
  os.homedir = () => CLAUDE_FIXTURE_ROOT;
  const cwd = 'C:\\repo\\contract-test';
  try {
    await runContractTests(t, {
      name: 'claude-code',
      reader: claudeReader,
      writer: claudeWriter,
      existingChatId: 'fixture-session-001',
      sampleIRForWrite: sampleIR('claude-code', cwd),
      cleanupWrite: () =>
        fs.rmSync(path.join(CLAUDE_FIXTURE_ROOT, '.claude', 'projects', claudeReader.sanitizeCwdToProjectDir(cwd)), {
          recursive: true,
          force: true,
        }),
    });
  } finally {
    os.homedir = original;
  }
});

test('cursor-cli platform contract', async (t) => {
  const original = os.homedir;
  os.homedir = () => CURSOR_FIXTURE_ROOT;
  try {
    await runContractTests(t, {
      name: 'cursor-cli',
      reader: cursorReader,
      writer: cursorWriter,
      existingChatId: 'fixture-chat-001',
      sampleIRForWrite: sampleIR('cursor-cli', 'C:\\repo\\contract-test'),
      cleanupWrite: (result) =>
        fs.rmSync(path.join(CURSOR_FIXTURE_ROOT, '.cursor', 'chats', `${result.newChatId}.json`), {
          force: true,
        }),
    });
  } finally {
    os.homedir = original;
  }
});
