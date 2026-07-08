'use strict';

const platforms = new Map();

function registerPlatform(name, { reader, writer }) {
  if (!name || typeof name !== 'string') {
    throw new Error('Platform name must be a non-empty string');
  }
  if (!reader || typeof reader.listChats !== 'function' || typeof reader.readChat !== 'function') {
    throw new Error(`Platform "${name}" reader must implement listChats() and readChat()`);
  }
  if (!writer || typeof writer.writeChat !== 'function') {
    throw new Error(`Platform "${name}" writer must implement writeChat()`);
  }
  platforms.set(name, { reader, writer });
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
