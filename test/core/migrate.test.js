'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { registerPlatform, clearRegistry } = require('../../core/registry');
const { migrate } = require('../../core/migrate');

beforeEach(() => clearRegistry());

function validIR(overrides = {}) {
  return {
    sourcePlatform: 'fake-source',
    sourceChatId: 'chat-1',
    title: 'Test',
    cwd: 'C:\\repo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hi' }],
    ...overrides,
  };
}

test('migrate reads from source and writes to target, returning the writer result', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: (id) => validIR({ sourceChatId: id }) },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
  });
  let writtenIR = null;
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('should not read target'); } },
    writer: {
      writeChat: (ir) => {
        writtenIR = ir;
        return { newChatId: 'new-1', resumeCommand: 'fake --resume new-1' };
      },
    },
  });

  const result = migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' });

  assert.equal(result.newChatId, 'new-1');
  assert.equal(result.resumeCommand, 'fake --resume new-1');
  assert.equal(writtenIR.sourceChatId, 'chat-1');
});

test('migrate throws before writing anything if the source produces invalid IR', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: () => ({ sourcePlatform: 'fake-source' }) },
    writer: { writeChat: () => { throw new Error('should never be called'); } },
  });
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('should never be called'); } },
  });

  assert.throws(
    () => migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' }),
    /Invalid IR/
  );
});

test('migrate throws a clear error for an unregistered platform', () => {
  assert.throws(() => migrate({ from: 'nope', to: 'also-nope', chatId: 'x' }), /Unknown platform "nope"/);
});

test('migrate hard-fails with a named error when the source IR\'s embedded format version does not match the platform\'s declared one', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: (id) => validIR({ sourceChatId: id, _sessionFormatVersion: 2 }) },
    writer: { writeChat: () => { throw new Error('should never write -- format check must fail first'); } },
    supportedVersions: { command: 'fake', range: ['1.0.0', '1.0.0'], sessionFormatVersion: 1 },
  });
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('should never write'); } },
  });

  assert.throws(
    () => migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' }),
    /format version 1.*format version 2/s
  );
});

test('migrate proceeds normally when the embedded format version matches', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: (id) => validIR({ sourceChatId: id, _sessionFormatVersion: 1 }) },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
    supportedVersions: { command: 'fake', range: ['1.0.0', '1.0.0'], sessionFormatVersion: 1 },
  });
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => ({ newChatId: 'new-1', resumeCommand: 'fake --resume new-1' }) },
  });

  const result = migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' });
  assert.equal(result.newChatId, 'new-1');
});

test('migrate does not check format version when the platform declares none (no false positives for platforms without a format marker)', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: (id) => validIR({ sourceChatId: id }) }, // no _sessionFormatVersion at all
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
    supportedVersions: { command: 'fake', range: ['1.0.0', '1.0.0'] }, // no sessionFormatVersion declared
  });
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => ({ newChatId: 'new-1', resumeCommand: 'fake --resume new-1' }) },
  });

  const result = migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' });
  assert.equal(result.newChatId, 'new-1');
});
