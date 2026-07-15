'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function sessionRoot() {
  return path.join(os.homedir(), '.cursor', 'chats');
}

function assertSafeChatId(id) {
  if (typeof id !== 'string' || id.length === 0 || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error(`Invalid chat id "${id}"`);
  }
}

function parseChatFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse chat file at ${filePath}: invalid JSON`);
  }
  return data;
}

function extractToolNarrations(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  return toolCalls.map((tc) => {
    const name = tc.name || 'tool';
    const status = tc.status === 'failed' ? `failed: ${tc.error || 'unknown error'}` : 'ok';
    return `Called ${name}`;
  });
}

function listChats() {
  const root = sessionRoot();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      try {
        const data = parseChatFile(filePath);
        return {
          id: data.id || entry.name.slice(0, -'.json'.length),
          title: data.title || '(untitled)',
          updatedAt: data.updatedAt || null,
          cwd: data.cwd || null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readChat(id) {
  assertSafeChatId(id);
  const filePath = path.join(sessionRoot(), `${id}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`No Cursor CLI chat found with id "${id}" in ${sessionRoot()}`);
  }

  const data = parseChatFile(filePath);

  if (!data.cwd) {
    throw new Error(
      `Chat "${id}" has no working directory (cwd) recorded and cannot be migrated. The target platform needs a cwd to place the migrated session.`
    );
  }

  const turns = [];
  if (Array.isArray(data.messages)) {
    for (const msg of data.messages) {
      if (msg.role === 'user') {
        turns.push({ role: 'user', text: msg.content || '' });
      } else if (msg.role === 'assistant') {
        const turn = { role: 'assistant', text: msg.content || '' };
        const narrations = extractToolNarrations(msg.toolCalls);
        if (narrations.length > 0) turn.toolNarrations = narrations;
        turns.push(turn);
      }
    }
  }

  if (turns.length === 0) {
    throw new Error(`Chat "${id}" has no readable turns`);
  }

  return {
    sourcePlatform: 'cursor-cli',
    sourceChatId: id,
    title: data.title || '(untitled)',
    cwd: data.cwd,
    gitBranch: data.gitBranch || undefined,
    model: data.model || undefined,
    createdAt: data.createdAt || new Date(0).toISOString(),
    updatedAt: data.updatedAt || new Date(0).toISOString(),
    turns,
  };
}

module.exports = { listChats, readChat, sessionRoot, assertSafeChatId, parseChatFile };
