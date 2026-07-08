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

test('registerPlatform rejects a writer missing writeChat', () => {
  assert.throws(
    () => registerPlatform('bad', { reader: fakeReader(), writer: {} }),
    /must implement writeChat\(\)/
  );
});

test('registerPlatform rejects an empty or non-string name', () => {
  assert.throws(
    () => registerPlatform('', { reader: fakeReader(), writer: fakeWriter() }),
    /Platform name must be a non-empty string/
  );
});

test('getPlatform lists "(none)" when the registry is empty', () => {
  assert.throws(() => getPlatform('anything'), /Registered platforms: \(none\)/);
});

test('clearRegistry removes all registered platforms', () => {
  registerPlatform('a', { reader: fakeReader(), writer: fakeWriter() });
  clearRegistry();
  assert.deepEqual(listPlatforms(), []);
  assert.throws(() => getPlatform('a'), /Unknown platform "a"/);
});
