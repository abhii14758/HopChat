'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const { registerPlatform, clearRegistry } = require('../../core/registry');
const App = require('../../ink/App');

const e = React.createElement;

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function registerFakePlatforms() {
  clearRegistry();
  registerPlatform('copilot-cli', {
    reader: {
      listChats: () => [{ id: 'chat-1', title: 'Redesign Game Table UI', updatedAt: '2026-01-01T00:00:00.000Z', cwd: 'D:\\3ofspades' }],
      readChat: (id) => ({
        sourcePlatform: 'copilot-cli',
        sourceChatId: id,
        title: 'Redesign Game Table UI',
        cwd: 'D:\\3ofspades',
        model: 'claude-sonnet-4.6',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
        turns: Array.from({ length: 738 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i}` })),
      }),
    },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
  });
  registerPlatform('claude-code', {
    reader: { listChats: () => [], readChat: () => { throw new Error('should not read target'); } },
    writer: { writeChat: () => ({ newChatId: 'new-id-123', resumeCommand: 'claude --resume new-id-123' }) },
  });
}

test('App starts on the greeting screen', () => {
  registerFakePlatforms();
  const { lastFrame } = render(e(App));
  const frame = strip(lastFrame());
  assert.match(frame, /Ready to hop a chat between tools/i);
});

test('pressing Enter on the greeting advances to source platform selection', async () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  await tick();
  stdin.write('\r');
  const frame = strip(lastFrame());
  assert.match(frame, /copilot-cli/);
  assert.match(frame, /claude-code/);
});

test('full flow: greeting -> source -> destination -> chat list -> confirm -> success', async () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));

  await tick(); stdin.write('\r'); await tick(); // greeting -> select source
  stdin.write('\r'); await tick(); // select copilot-cli (first item) -> select destination
  stdin.write('\r'); await tick(); // select claude-code (only item) -> browse chats
  stdin.write('\r'); await tick(); // select the one fake chat -> confirm

  let frame = strip(lastFrame());
  assert.match(frame, /Confirm migration/);
  assert.match(frame, /Redesign Game Table UI/);
  assert.match(frame, /738/);

  stdin.write('y'); await tick(); // confirm -> success

  frame = strip(lastFrame());
  assert.match(frame, /Migrated "Redesign Game Table UI" from copilot-cli to claude-code/);
  assert.match(frame, /claude --resume new-id-123/);
});

test('pressing Esc from the chat list exits to a goodbye screen', async () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  await tick(); stdin.write('\r'); await tick(); // greeting -> select source
  stdin.write('\r'); await tick(); // select copilot-cli -> select destination
  stdin.write('\r'); await tick(); // select claude-code -> browse chats
  stdin.write('\x1b'); await tick(); // Esc -> exit
  const frame = strip(lastFrame());
  assert.match(frame, /See you next hop/i);
});
