'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const execFileAsync = promisify(execFile);

// A version check only needs the CLI's --version output. Real-world CLIs
// like Copilot CLI are themselves Node apps that take ~2s just to boot and
// print their version -- that cost is inherent to the target binary and
// can't be shortened by how hopchat spawns it, so it's cached (see below)
// rather than eliminated. The timeout below is a safety net against a
// genuinely hung process, not a tuning knob for the common case.
const CHECK_TIMEOUT_MS = 5000;

// Persist checked versions across separate `hopchat` invocations so the
// ~2s(+) cost of shelling out to a slow CLI is paid once per day per
// command, not on every single migrate. os.tmpdir() is read fresh on every
// call (not cached in a module-level const) so tests can monkeypatch it the
// same way other modules in this codebase monkeypatch os.homedir().
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function cacheFilePath() {
  return path.join(os.tmpdir(), 'hopchat-version-cache.json');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFilePath(), 'utf8'));
  } catch {
    return {}; // missing file, corrupt JSON, permissions -- cache is best-effort
  }
}

function writeCache(cache) {
  try {
    fs.writeFileSync(cacheFilePath(), JSON.stringify(cache));
  } catch {
    // Best-effort: a failed cache write must never fail the version check itself.
  }
}

function getCachedVersion(command) {
  const entry = readCache()[command];
  if (!entry) return undefined;
  if (Date.now() - entry.checkedAt > CACHE_TTL_MS) return undefined;
  return entry.version; // may itself be null, meaning "checked, not installed"
}

function setCachedVersion(command, version) {
  const cache = readCache();
  cache[command] = { version, checkedAt: Date.now() };
  writeCache(cache);
}

async function runVersionCommand(command, versionFlag) {
  try {
    // `command` must be a trusted, hardcoded value (never user input) — shell:true
    // is required so npm-installed .cmd/.bat shims resolve correctly on Windows.
    const { stdout } = await execFileAsync(command, [versionFlag], {
      encoding: 'utf8',
      shell: true,
      timeout: CHECK_TIMEOUT_MS,
    });
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Returns the installed version string, or null if the command isn't
// installed / didn't print a recognizable version. Cached per command for
// CACHE_TTL_MS; pass { cache: false } to force a fresh check (used by tests
// that need to observe the real, uncached behavior).
async function getInstalledVersion(command, versionFlag = '--version', { cache = true } = {}) {
  if (cache) {
    const cached = getCachedVersion(command);
    if (cached !== undefined) return cached;
  }
  const version = await runVersionCommand(command, versionFlag);
  if (cache) setCachedVersion(command, version);
  return version;
}

function isVersionInRange(version, [min, max]) {
  if (!version) return false;
  const parts = (v) => v.split('.').map(Number);
  const cmp = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  };
  const v = parts(version);
  return cmp(v, parts(min)) >= 0 && cmp(v, parts(max)) <= 0;
}

async function checkCompatibility(command, supportedRange, opts) {
  const installed = await getInstalledVersion(command, undefined, opts);
  if (installed === null) {
    return { installed: null, supported: false, verified: false };
  }
  const supported = isVersionInRange(installed, supportedRange);
  return { installed, supported, verified: true };
}

module.exports = {
  getInstalledVersion,
  isVersionInRange,
  checkCompatibility,
  cacheFilePath,
  CACHE_TTL_MS,
};
