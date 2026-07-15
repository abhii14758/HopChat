'use strict';

// Keeps the HOPPING interstitial and the mascot's idle-blink timer
// deterministic (zero-delay, no live setInterval) -- mirrors the same seam
// cli.js's non-interactive hop animation already uses in test/cli.test.js.
process.env.HOPCHAT_NO_ANIMATION = '1';

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

// The confirm -> hopping -> success transition crosses an async onConfirm
// handler (it awaits the same version-check promises the non-interactive
// CLI awaits) plus two separate React effect-flush cycles (HOPPING's own
// mount effect, then the resulting re-render into SUCCESS) -- polling for
// the expected frame is more robust than guessing an exact tick() count,
// and still fails fast (2s) instead of hanging if something regresses.
async function waitForFrame(getFrame, pattern, timeoutMs = 2000) {
  const start = Date.now();
  while (!pattern.test(getFrame())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForFrame: "${pattern}" never matched. Last frame:\n${getFrame()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

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

  stdin.write('y'); // confirm -> hopping -> success
  await waitForFrame(() => strip(lastFrame()), /Migrated "Redesign Game Table UI" from copilot-cli to claude-code/);

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

test('typing "q" while filtering the chat list does not exit the app (regression: it used to)', async () => {
  // registerFakePlatforms()'s one fake chat is titled "Redesign Game Table
  // UI" -- lowercased it contains no "q", so typing "q" here can only ever
  // be a (harmless, zero-match) filter keystroke, never an accidental real
  // match. The bug this guards against: the global exit handler used to
  // treat a bare "q" as "exit" on every screen, including this one, where
  // SelectList's filterable mode is simultaneously listening for the same
  // keystroke to build its search query -- so typing "q" while searching
  // silently killed the whole app instead of typing a letter.
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  await tick(); stdin.write('\r'); await tick(); // greeting -> select source
  stdin.write('\r'); await tick(); // select copilot-cli -> select destination
  stdin.write('\r'); await tick(); // select claude-code -> browse chats
  stdin.write('q'); await tick();
  const frame = strip(lastFrame());
  assert.doesNotMatch(frame, /See you next hop/i, 'typing "q" while filtering must not exit the app');
  assert.match(frame, /Pick a chat to hop/i, 'should still be on the chat-browse screen');
});

test('pressing Esc still exits from the chat list even while filtering', async () => {
  registerFakePlatforms();
  const { lastFrame, stdin } = render(e(App));
  await tick(); stdin.write('\r'); await tick();
  stdin.write('\r'); await tick();
  stdin.write('\r'); await tick();
  stdin.write('redesign'); await tick(); // type a filter query first
  stdin.write('\x1b'); await tick(); // Esc should still exit
  const frame = strip(lastFrame());
  assert.match(frame, /See you next hop/i);
});

test('an empty chat list shows a distinct message from a failed filter search', async () => {
  registerFakePlatforms();
  const { getPlatform, clearRegistry, registerPlatform } = require('../../core/registry');
  clearRegistry();
  registerPlatform('copilot-cli', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
  });
  registerPlatform('claude-code', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('unused'); } },
  });
  const { lastFrame, stdin } = render(e(App));
  await tick(); stdin.write('\r'); await tick();
  stdin.write('\r'); await tick();
  stdin.write('\r'); await tick();
  const frame = strip(lastFrame());
  assert.match(frame, /No copilot-cli chats found here yet/i);
  assert.doesNotMatch(frame, /\(no matches\)/, 'an empty list is not the same thing as a failed search');
});

test('a reader failure while browsing chats shows a styled error screen instead of crashing', async () => {
  const { clearRegistry, registerPlatform } = require('../../core/registry');
  clearRegistry();
  registerPlatform('copilot-cli', {
    reader: {
      listChats: () => {
        throw new Error('permission denied reading session directory');
      },
      readChat: () => { throw new Error('unused'); },
    },
    writer: { writeChat: () => { throw new Error('unused'); } },
  });
  registerPlatform('claude-code', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('unused'); } },
  });
  const { lastFrame, stdin } = render(e(App));
  await tick(); stdin.write('\r'); await tick(); // greeting -> select source
  stdin.write('\r'); await tick(); // select copilot-cli -> select destination
  stdin.write('\r'); // select claude-code -> browse chats (reader throws here)
  await waitForFrame(() => strip(lastFrame()), /Something went wrong/i);
  const frame = strip(lastFrame());
  assert.match(frame, /Something went wrong/i);
  assert.match(frame, /permission denied reading session directory/);
});
