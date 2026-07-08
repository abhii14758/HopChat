'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateIR, assertValidIR } = require('../../core/ir-schema');

function validIR() {
  return {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'abc-123',
    title: 'Test chat',
    cwd: 'C:\\repo',
    gitBranch: 'main',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-07-03T05:38:53.780Z',
    updatedAt: '2026-07-08T04:38:37.689Z',
    turns: [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi', toolNarrations: ['Ran grep'] },
    ],
  };
}

test('validateIR accepts a well-formed IR', () => {
  assert.deepEqual(validateIR(validIR()), []);
});

test('validateIR rejects missing required string fields', () => {
  const ir = validIR();
  delete ir.title;
  const errors = validateIR(ir);
  assert.ok(errors.includes('IR.title must be a non-empty string'));
});

test('validateIR rejects an empty turns array', () => {
  const ir = validIR();
  ir.turns = [];
  const errors = validateIR(ir);
  assert.ok(errors.includes('IR.turns must be a non-empty array'));
});

test('validateIR rejects an invalid role', () => {
  const ir = validIR();
  ir.turns[0].role = 'system';
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('turns[0].role')));
});

test('validateIR rejects toolNarrations on a user turn', () => {
  const ir = validIR();
  ir.turns[0].toolNarrations = ['nope'];
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('only valid on assistant turns')));
});

test('assertValidIR throws with all errors joined', () => {
  const ir = validIR();
  delete ir.title;
  assert.throws(() => assertValidIR(ir), /IR\.title must be a non-empty string/);
});
