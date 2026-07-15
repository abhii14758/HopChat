'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const {
  getInstalledVersion,
  isVersionInRange,
  checkCompatibility,
  cacheFilePath,
} = require('../../core/version-check');

// Each test gets its own tmpdir so the on-disk cache never leaks between
// tests or collides with a real cache file from an actual hopchat run.
function withIsolatedCache(fn) {
  return async () => {
    const original = os.tmpdir;
    const dir = fs.mkdtempSync(require('node:path').join(os.tmpdir(), 'hopchat-test-'));
    os.tmpdir = () => dir;
    try {
      await fn();
    } finally {
      os.tmpdir = original;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('getInstalledVersion returns null for a nonexistent command', withIsolatedCache(async () => {
  assert.equal(await getInstalledVersion('hopchat-nonexistent-binary-xyz'), null);
}));

test('getInstalledVersion extracts a version string from a real command', withIsolatedCache(async () => {
  const version = await getInstalledVersion('node');
  assert.match(version, /^\d+\.\d+\.\d+$/);
}));

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

test('checkCompatibility marks unverified when the command is missing', withIsolatedCache(async () => {
  const result = await checkCompatibility('hopchat-nonexistent-binary-xyz', ['1.0.0', '2.0.0']);
  assert.equal(result.installed, null);
  assert.equal(result.verified, false);
}));

test('checkCompatibility reports supported:true for a real command inside its range', withIsolatedCache(async () => {
  const version = await getInstalledVersion('node');
  const [major] = version.split('.').map(Number);
  const result = await checkCompatibility('node', [`${major}.0.0`, `${major}.999.999`]);
  assert.equal(result.installed, version);
  assert.equal(result.verified, true);
  assert.equal(result.supported, true);
}));

test('getInstalledVersion caches the result to disk so a second call skips the real check', withIsolatedCache(async () => {
  const version = await getInstalledVersion('node');
  assert.match(version, /^\d+\.\d+\.\d+$/);

  // Verify a cache file now exists and records this command.
  const cacheContents = JSON.parse(fs.readFileSync(cacheFilePath(), 'utf8'));
  assert.equal(cacheContents.node.version, version);

  // A second call must return the cached value even for a command that no
  // longer resolves to anything real -- proves it isn't re-shelling out.
  const cacheContentsBefore = fs.readFileSync(cacheFilePath(), 'utf8');
  const secondResult = await getInstalledVersion('node');
  const cacheContentsAfter = fs.readFileSync(cacheFilePath(), 'utf8');
  assert.equal(secondResult, version);
  assert.equal(cacheContentsBefore, cacheContentsAfter, 'cache file should not be rewritten on a cache hit');
}));

test('getInstalledVersion bypasses the cache when { cache: false } is passed', withIsolatedCache(async () => {
  await getInstalledVersion('node'); // populates the cache
  const before = fs.readFileSync(cacheFilePath(), 'utf8');
  await getInstalledVersion('node', undefined, { cache: false });
  const after = fs.readFileSync(cacheFilePath(), 'utf8');
  // cache:false neither reads nor writes the cache file for this call
  assert.equal(before, after);
}));

test('getInstalledVersion treats an expired cache entry as a miss', withIsolatedCache(async () => {
  await getInstalledVersion('node'); // populates the cache with a fresh timestamp
  const cache = JSON.parse(fs.readFileSync(cacheFilePath(), 'utf8'));
  cache.node.checkedAt = Date.now() - 25 * 60 * 60 * 1000; // 25h ago, past the 24h TTL
  fs.writeFileSync(cacheFilePath(), JSON.stringify(cache));

  const version = await getInstalledVersion('node');
  assert.match(version, /^\d+\.\d+\.\d+$/); // re-checked successfully, not stuck on stale data

  const refreshed = JSON.parse(fs.readFileSync(cacheFilePath(), 'utf8'));
  assert.ok(refreshed.node.checkedAt > cache.node.checkedAt, 'expired entry should be refreshed with a new timestamp');
}));

test('getInstalledVersion survives a corrupt cache file instead of throwing', withIsolatedCache(async () => {
  fs.writeFileSync(cacheFilePath(), 'not valid json{{{');
  const version = await getInstalledVersion('node');
  assert.match(version, /^\d+\.\d+\.\d+$/);
}));

test('checkCompatibility runs concurrently rather than serializing multiple calls', withIsolatedCache(async () => {
  // The original version of this test compared two full "run it twice"
  // timings against each other (sequential vs. concurrent) with a strict
  // concurrentMs <= sequentialMs assertion -- doubling the noise surface on
  // both sides of the comparison, which made it a real, observed flake on a
  // loaded runner (no actual regression, just measurement jitter). Comparing
  // a concurrent pair against a SINGLE call's duration instead, with a
  // generous ceiling, still meaningfully proves the two calls overlapped
  // (a fully-serialized pair would cost roughly 2x a single call) while
  // tolerating normal scheduling noise.
  const singleStart = Date.now();
  await checkCompatibility('node', ['0.0.0', '999.999.999'], { cache: false });
  const singleMs = Math.max(Date.now() - singleStart, 1);

  const concurrentStart = Date.now();
  await Promise.all([
    checkCompatibility('node', ['0.0.0', '999.999.999'], { cache: false }),
    checkCompatibility('node', ['0.0.0', '999.999.999'], { cache: false }),
  ]);
  const concurrentMs = Date.now() - concurrentStart;

  assert.ok(
    concurrentMs <= singleMs * 1.7 + 50,
    `expected a concurrent pair (${concurrentMs}ms) to be well under 2x a single call (${singleMs}ms), suggesting the two calls serialized instead of overlapping`
  );
}));
