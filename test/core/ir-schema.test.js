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
  for (const field of ['sourcePlatform', 'sourceChatId', 'title', 'cwd']) {
    const ir = validIR();
    delete ir[field];
    const errors = validateIR(ir);
    assert.ok(errors.includes(`IR.${field} must be a non-empty string`), `expected error for missing ${field}`);
  }
});

test('validateIR rejects non-ISO-8601 date strings', () => {
  for (const field of ['createdAt', 'updatedAt']) {
    const ir = validIR();
    ir[field] = 'July 8, 2026';
    const errors = validateIR(ir);
    assert.ok(errors.includes(`IR.${field} must be an ISO 8601 date string`), `expected error for non-ISO ${field}`);

    const ir2 = validIR();
    ir2[field] = '07/08/2026';
    const errors2 = validateIR(ir2);
    assert.ok(errors2.includes(`IR.${field} must be an ISO 8601 date string`), `expected error for slash-format ${field}`);
  }
});

test('validateIR rejects non-string gitBranch or model when present', () => {
  const ir = validIR();
  ir.gitBranch = 123;
  assert.ok(validateIR(ir).includes('IR.gitBranch must be a string when present'));

  const ir2 = validIR();
  ir2.model = 123;
  assert.ok(validateIR(ir2).includes('IR.model must be a string when present'));
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

test('validateIR rejects a non-string turn.text', () => {
  const ir = validIR();
  ir.turns[0].text = 42;
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('turns[0].text must be a string')));
});

test('validateIR rejects toolNarrations on a user turn', () => {
  const ir = validIR();
  ir.turns[0].toolNarrations = ['nope'];
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('only valid on assistant turns')));
});

test('validateIR rejects toolNarrations that is not an array of strings', () => {
  const ir = validIR();
  ir.turns[1].toolNarrations = [42, 'ok'];
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('toolNarrations must be an array of strings')));
});

test('assertValidIR does not throw on a valid IR', () => {
  assert.doesNotThrow(() => assertValidIR(validIR()));
});

test('assertValidIR throws with all errors joined', () => {
  const ir = validIR();
  delete ir.title;
  assert.throws(() => assertValidIR(ir), /IR\.title must be a non-empty string/);
});
