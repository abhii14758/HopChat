'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { registerPlatform, getPlatform, listPlatforms, clearRegistry } = require('../../core/registry');

beforeEach(() => clearRegistry());

function fakeReader() {
  return { listChats: () => [], readChat: () => ({}) };
}
function fakeWriter() {
  return { writeChat: () => ({}) };
}

test('registerPlatform then getPlatform returns the same reader/writer', () => {
  const reader = fakeReader();
  const writer = fakeWriter();
  registerPlatform('fake', { reader, writer });
  const entry = getPlatform('fake');
  assert.equal(entry.reader, reader);
  assert.equal(entry.writer, writer);
});

test('listPlatforms lists registered names', () => {
  registerPlatform('a', { reader: fakeReader(), writer: fakeWriter() });
  registerPlatform('b', { reader: fakeReader(), writer: fakeWriter() });
  assert.deepEqual(listPlatforms().sort(), ['a', 'b']);
});

test('getPlatform throws a clear error for an unknown platform', () => {
  registerPlatform('a', { reader: fakeReader(), writer: fakeWriter() });
  assert.throws(() => getPlatform('nope'), /Unknown platform "nope"/);
});

test('registerPlatform rejects a reader missing readChat', () => {
  assert.throws(
    () => registerPlatform('bad', { reader: { listChats: () => [] }, writer: fakeWriter() }),
    /must implement listChats\(\) and readChat\(\)/
  );
});
