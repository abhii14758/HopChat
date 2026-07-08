'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isVersionInRange, checkCompatibility } = require('../../core/version-check');

test('isVersionInRange accepts a version inside the range', () => {
  assert.equal(isVersionInRange('1.0.65', ['1.0.60', '1.0.70']), true);
});

test('isVersionInRange rejects a version below the range', () => {
  assert.equal(isVersionInRange('1.0.10', ['1.0.60', '1.0.70']), false);
});

test('isVersionInRange rejects a version above the range', () => {
  assert.equal(isVersionInRange('1.0.99', ['1.0.60', '1.0.70']), false);
});

test('checkCompatibility marks unverified when the command is missing', () => {
  const result = checkCompatibility('hopchat-nonexistent-binary-xyz', ['1.0.0', '2.0.0']);
  assert.equal(result.installed, null);
  assert.equal(result.verified, false);
});
