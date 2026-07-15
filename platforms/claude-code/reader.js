'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

function extractToolNarrations(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block && block.type === 'tool_use')
    .map((block) => `Called ${block.name}`);
}

function isToolResultOnly(content) {
  return Array.isArray(content) && content.length > 0 && content.every((block) => block && block.type === 'tool_result');
}

// See platforms/copilot-cli/reader.js's assertSafeChatId for why this exists:
// a crafted sessionId containing ".." or a path separator would otherwise
// let path.join in findSessionFile() escape ~/.claude/projects/ entirely.
function assertSafeChatId(id) {
  if (typeof id !== 'string' || id.length === 0 || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error(`Invalid chat id "${id}"`);
  }
}

function findSessionFile(sessionId) {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return null;
  for (const projectDir of fs.readdirSync(root)) {
    const candidate = path.join(root, projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseSessionFile(filePath, sessionId) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);

  const turns = [];
  let cwd = '';
  let gitBranch;
  let model;
  let createdAt = null;
  let updatedAt = null;
  let cliVersion;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.timestamp) {
      if (!createdAt) createdAt = entry.timestamp;
      updatedAt = entry.timestamp;
    }
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;
    if (entry.version && !cliVersion) cliVersion = entry.version;

    if (entry.type === 'user' && entry.message) {
      if (entry.isMeta) continue;
      if (isToolResultOnly(entry.message.content)) continue;
      const text = extractText(entry.message.content);
      if (text.trim()) turns.push({ role: 'user', text });
    } else if (entry.type === 'assistant' && entry.message) {
      if (!model && entry.message.model) model = entry.message.model;
      const text = extractText(entry.message.content);
      const toolNarrations = extractToolNarrations(entry.message.content);
      if (text.trim() || toolNarrations.length > 0) {
        const turn = { role: 'assistant', text: text.trim() || '(tool activity only)' };
        if (toolNarrations.length > 0) turn.toolNarrations = toolNarrations;
        turns.push(turn);
      }
    }
  }

  const firstUserTurn = turns.find((t) => t.role === 'user');
  const title = firstUserTurn ? firstUserTurn.text.slice(0, 60) : '(untitled)';

  return {
    sourcePlatform: 'claude-code',
    sourceChatId: sessionId,
    title,
    cwd,
    gitBranch,
    model,
    createdAt: createdAt || new Date(0).toISOString(),
    updatedAt: updatedAt || new Date(0).toISOString(),
    turns,
    _cliVersion: cliVersion,
  };
}

function listChats() {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return [];

  const results = [];
  for (const projectDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!projectDir.isDirectory()) continue;
    const projectPath = path.join(root, projectDir.name);
    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(projectPath, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const sessionId = file.slice(0, -'.jsonl'.length);
      const ir = parseSessionFile(filePath, sessionId);
      results.push({ id: sessionId, title: ir.title, updatedAt: ir.updatedAt, cwd: ir.cwd });
    }
  }
  return results;
}

function readChat(sessionId) {
  assertSafeChatId(sessionId);
  const filePath = findSessionFile(sessionId);
  if (!filePath) {
    throw new Error(`No Claude Code chat found with session id "${sessionId}" under ${projectsRoot()}`);
  }
  const ir = parseSessionFile(filePath, sessionId);
  if (!ir.cwd) {
    throw new Error(
      `Chat "${sessionId}" has no working directory (cwd) recorded and cannot be migrated. The target platform needs a cwd to place the migrated session.`
    );
  }
  return ir;
}

function sanitizeCwdToProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

module.exports = { listChats, readChat, projectsRoot, sanitizeCwdToProjectDir, parseSessionFile, assertSafeChatId };
