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

  // Every reader ultimately joins a chat id into a filesystem path under its
  // platform's session-storage root. This is the shared guardrail: any new
  // platform added via platforms/TEMPLATE/ inherits this check automatically
  // just by passing the contract suite, without its author needing to know
  // path-traversal is a risk here in the first place.
  await t.test(`${name} contract: readChat rejects an id containing path separators or ".."`, () => {
    assert.throws(() => reader.readChat('../evil'));
    assert.throws(() => reader.readChat('..\\evil'));
    assert.throws(() => reader.readChat('foo/../../evil'));
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

  // Both the shape checks above pass just as easily for a writer that
  // silently drops or mangles content on the way out -- this is the check
  // that actually proves round-trip fidelity, so a new third-party platform
  // added via platforms/TEMPLATE/ can't pass the shared suite while
  // corrupting turns or cwd. Deliberately does NOT assert on `title`:
  // claude-code's format has no native title field at all, so its reader
  // derives one from the first user turn's text by design (see
  // parseSessionFile in platforms/claude-code/reader.js) -- title fidelity
  // is real for platforms that do have a native title field (copilot-cli's
  // workspace.yaml `name`), but it's a platform-specific guarantee, not part
  // of the universal reader/writer contract every platform must satisfy.
  await t.test(`${name} contract: writeChat -> readChat preserves cwd and turn content`, () => {
    const result = writer.writeChat(sampleIRForWrite);
    try {
      const readBack = reader.readChat(result.newChatId);
      assert.equal(readBack.cwd, sampleIRForWrite.cwd);
      assert.equal(readBack.turns.length, sampleIRForWrite.turns.length);
      sampleIRForWrite.turns.forEach((turn, i) => {
        assert.equal(readBack.turns[i].role, turn.role);
        assert.match(readBack.turns[i].text, new RegExp(turn.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      });
    } finally {
      if (cleanupWrite) cleanupWrite(result);
    }
  });
}

module.exports = { runContractTests };
