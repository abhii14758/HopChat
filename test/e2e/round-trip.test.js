'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { registerPlatform, clearRegistry } = require('../../core/registry');
const { migrate } = require('../../core/migrate');
const copilotReader = require('../../platforms/copilot-cli/reader');
const copilotWriter = require('../../platforms/copilot-cli/writer');
const claudeReader = require('../../platforms/claude-code/reader');
const claudeWriter = require('../../platforms/claude-code/writer');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'copilot-cli');

test('round trip: copilot-cli -> claude-code -> copilot-cli keeps conversation content readable', () => {
  clearRegistry();
  registerPlatform('copilot-cli', { reader: copilotReader, writer: copilotWriter });
  registerPlatform('claude-code', { reader: claudeReader, writer: claudeWriter });

  const originalHomedir = os.homedir;
  os.homedir = () => FIXTURE_ROOT;

  const cleanupTasks = [];
  try {
    const toClaudeCode = migrate({ from: 'copilot-cli', to: 'claude-code', chatId: 'fixture-chat-001' });
    cleanupTasks.push(() =>
      fs.rmSync(
        path.join(FIXTURE_ROOT, '.claude', 'projects', claudeReader.sanitizeCwdToProjectDir('C:\\repo\\sample-project')),
        { recursive: true, force: true }
      )
    );

    const backToCopilot = migrate({ from: 'claude-code', to: 'copilot-cli', chatId: toClaudeCode.newChatId });
    cleanupTasks.push(() =>
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', backToCopilot.newChatId), {
        recursive: true,
        force: true,
      })
    );

    const finalIR = copilotReader.readChat(backToCopilot.newChatId);

    assert.equal(finalIR.turns.length, 2);
    assert.equal(finalIR.turns[0].role, 'user');
    assert.equal(finalIR.turns[0].text, 'List files in src/');
    assert.equal(finalIR.turns[1].role, 'assistant');
    assert.match(finalIR.turns[1].text, /Found 3 files: index\.js, app\.js, utils\.js\./);
    assert.match(finalIR.turns[1].text, /Called glob/);
  } finally {
    os.homedir = originalHomedir;
    clearRegistry();
    for (const cleanup of cleanupTasks) cleanup();
  }
});
