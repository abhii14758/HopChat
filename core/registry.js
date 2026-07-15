'use strict';

const platforms = new Map();

// `supportedVersions` is optional -- { command, range: [min, max], sessionFormatVersion? },
// the same shape each platform's supported-versions.js exports. Carrying it on
// the registry entry (rather than a second hardcoded map elsewhere) means any
// caller that already has a platform name -- the CLI's version-check warning,
// the Ink TUI, migrate()'s own format-version guard -- can look it up from the
// one place a platform is registered, instead of every consumer maintaining
// its own separate name -> versions map that has to be kept in sync by hand.
function registerPlatform(name, { reader, writer, supportedVersions }) {
  if (!name || typeof name !== 'string') {
    throw new Error('Platform name must be a non-empty string');
  }
  if (!reader || typeof reader.listChats !== 'function' || typeof reader.readChat !== 'function') {
    throw new Error(`Platform "${name}" reader must implement listChats() and readChat()`);
  }
  if (!writer || typeof writer.writeChat !== 'function') {
    throw new Error(`Platform "${name}" writer must implement writeChat()`);
  }
  platforms.set(name, { reader, writer, supportedVersions });
}

function getPlatform(name) {
  const entry = platforms.get(name);
  if (!entry) {
    throw new Error(`Unknown platform "${name}". Registered platforms: ${listPlatforms().join(', ') || '(none)'}`);
  }
  return entry;
}

function listPlatforms() {
  return Array.from(platforms.keys());
}

function clearRegistry() {
  platforms.clear();
}

module.exports = { registerPlatform, getPlatform, listPlatforms, clearRegistry };
