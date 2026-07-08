'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getInstalledVersion, isVersionInRange, checkCompatibility } = require('../../core/version-check');

test('getInstalledVersion returns null for a nonexistent command', () => {
  assert.equal(getInstalledVersion('hopchat-nonexistent-binary-xyz'), null);
});

test('getInstalledVersion extracts a version string from a real command', () => {
  const version = getInstalledVersion('node');
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test('isVersionInRange accepts a version inside the range', () => {
  assert.equal(isVersionInRange('1.0.65', ['1.0.60', '1.0.70']), true);
});

test('isVersionInRange rejects a version below the range', () => {
  assert.equal(isVersionInRange('1.0.10', ['1.0.60', '1.0.70']), false);
});

test('isVersionInRange rejects a version above the range', () => {
  assert.equal(isVersionInRange('1.0.99', ['1.0.60', '1.0.70']), false);
});

test('isVersionInRange accepts boundary values inclusively', () => {
  assert.equal(isVersionInRange('1.0.60', ['1.0.60', '1.0.70']), true);
  assert.equal(isVersionInRange('1.0.70', ['1.0.60', '1.0.70']), true);
});

test('isVersionInRange returns false for a falsy version', () => {
  assert.equal(isVersionInRange(null, ['1.0.60', '1.0.70']), false);
  assert.equal(isVersionInRange('', ['1.0.60', '1.0.70']), false);
});

test('checkCompatibility marks unverified when the command is missing', () => {
  const result = checkCompatibility('hopchat-nonexistent-binary-xyz', ['1.0.0', '2.0.0']);
  assert.equal(result.installed, null);
  assert.equal(result.verified, false);
});

test('checkCompatibility reports supported:true for a real command inside its range', () => {
  const version = getInstalledVersion('node');
  const [major, minor, patch] = version.split('.').map(Number);
  const result = checkCompatibility('node', [`${major}.0.0`, `${major}.999.999`]);
  assert.equal(result.installed, version);
  assert.equal(result.verified, true);
  assert.equal(result.supported, true);
});
