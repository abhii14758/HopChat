'use strict';

const assert = require('node:assert/strict');
const { assertValidIR } = require('./ir-schema');

async function runContractTests(t, { name, reader, writer, existingChatId, sampleIRForWrite, cleanupWrite }) {
  // Each t.test() call must be awaited before returning: Node's test runner
  // schedules subtest bodies to run after the *parent* test callback returns.
  // If the caller mutates ambient state (e.g. os.homedir) for the duration of
  // this call and restores it in a `finally` once this function resolves,
  // failing to await here would let that restoration happen before the
  // subtests actually execute, silently invalidating the mutation.
  await t.test(`${name} contract: listChats returns an array without throwing`, () => {
    const chats = reader.listChats();
    assert.ok(Array.isArray(chats));
  });

  await t.test(`${name} contract: readChat returns IR that passes schema validation`, () => {
    const ir = reader.readChat(existingChatId);
    assertValidIR(ir);
  });

  await t.test(`${name} contract: writeChat returns newChatId and resumeCommand`, () => {
    const result = writer.writeChat(sampleIRForWrite);
    try {
      assert.equal(typeof result.newChatId, 'string');
      assert.ok(result.newChatId.length > 0);
      assert.equal(typeof result.resumeCommand, 'string');
      assert.ok(result.resumeCommand.length > 0);
    } finally {
      if (cleanupWrite) cleanupWrite(result);
    }
  });
}

module.exports = { runContractTests };
