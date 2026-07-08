'use strict';

const { execFileSync } = require('node:child_process');

function getInstalledVersion(command, versionFlag = '--version') {
  try {
    const output = execFileSync(command, [versionFlag], { encoding: 'utf8' });
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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

function checkCompatibility(command, supportedRange) {
  const installed = getInstalledVersion(command);
  if (installed === null) {
    return { installed: null, supported: false, verified: false };
  }
  const supported = isVersionInRange(installed, supportedRange);
  return { installed, supported, verified: true };
}

module.exports = { getInstalledVersion, isVersionInRange, checkCompatibility };
