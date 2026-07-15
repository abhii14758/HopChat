'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function sessionRoot() {
  return path.join(os.homedir(), '.copilot', 'session-state');
}

// `id` reaches here as a raw, untrusted string -- typed by hand on
// `hopchat migrate <chat-id>`, or read from an untrusted source in future
// callers. Rejecting path separators and ".." before it's ever joined into a
// filesystem path closes off reading arbitrary files elsewhere on disk via a
// crafted id (e.g. "../../../../some/other/dir"). Real ids -- both this
// platform's own directory names and the UUIDs hopchat's own writer mints --
// never contain these characters, so this never rejects a legitimate id.
function assertSafeChatId(id) {
  if (typeof id !== 'string' || id.length === 0 || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error(`Invalid chat id "${id}"`);
  }
}

function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    // Unquote double-quoted values written by our own writer. Single-pass so a
    // restored backslash (from "\\") isn't re-consumed by a following "\n".
    // Bare values (e.g. legacy/real Copilot workspace.yaml files) pass through.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\(.)/g, (_m, c) => {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        return c; // covers \", \\, and any other escaped char
      });
    }
    result[key] = value;
  }
  return result;
}

function listChats() {
  const root = sessionRoot();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const workspacePath = path.join(root, entry.name, 'workspace.yaml');
      if (!fs.existsSync(workspacePath)) return null;
      const yaml = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf8'));
      return {
        id: yaml.id || entry.name,
        title: yaml.name || '(untitled)',
        updatedAt: yaml.updated_at || null,
        cwd: yaml.cwd || null,
      };
    })
    .filter(Boolean);
}

function readChat(id) {
  assertSafeChatId(id);
  const chatDir = path.join(sessionRoot(), id);
  const workspacePath = path.join(chatDir, 'workspace.yaml');
  const eventsPath = path.join(chatDir, 'events.jsonl');

  if (!fs.existsSync(workspacePath) || !fs.existsSync(eventsPath)) {
    throw new Error(`No Copilot CLI chat found with id "${id}" in ${chatDir}`);
  }

  const yaml = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf8'));
  const lines = fs.readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean);

  let model = null;
  let sessionFormatVersion = null;
  const toolNamesByCallId = new Map();
  const turnBuckets = new Map();
  const turnOrder = [];
  const finishedTurns = [];

  function bucketFor(turnId) {
    if (!turnBuckets.has(turnId)) {
      turnBuckets.set(turnId, { textParts: [], toolNarrations: [] });
      turnOrder.push(turnId);
    }
    return turnBuckets.get(turnId);
  }

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      // A single malformed/truncated line shouldn't take down the whole
      // parse -- matches claude-code's reader, which already skips bad
      // lines the same way. Real files can pick up a stray partial line if
      // the source CLI is killed mid-write.
      continue;
    }

    if (event.type === 'session.start') {
      sessionFormatVersion = event.data.version;
    } else if (event.type === 'session.model_change') {
      model = event.data.newModel;
    } else if (event.type === 'user.message') {
      finishedTurns.push({ role: 'user', text: event.data.content });
    } else if (event.type === 'assistant.message') {
      if (!model) model = event.data.model;
      const bucket = bucketFor(event.data.turnId);
      if (event.data.content) bucket.textParts.push(event.data.content);
    } else if (event.type === 'tool.execution_start') {
      toolNamesByCallId.set(event.data.toolCallId, event.data.toolName);
      const bucket = bucketFor(event.data.turnId);
      bucket.toolNarrations.push(`Called ${event.data.toolName}`);
    } else if (event.type === 'tool.execution_complete') {
      const toolName = toolNamesByCallId.get(event.data.toolCallId) || 'tool';
      const bucket = bucketFor(event.data.turnId);
      const outcome =
        event.data.success === false ? `failed: ${(event.data.error && event.data.error.message) || 'unknown error'}` : 'ok';
      bucket.toolNarrations.push(`${toolName} finished (${outcome})`);
    } else if (event.type === 'assistant.turn_end') {
      const bucket = turnBuckets.get(event.data.turnId);
      if (bucket) {
        finishedTurns.push({
          role: 'assistant',
          text: bucket.textParts.join('\n\n'),
          toolNarrations: bucket.toolNarrations,
        });
        turnBuckets.delete(event.data.turnId);
      }
    }
  }

  for (const turnId of turnOrder) {
    const bucket = turnBuckets.get(turnId);
    if (bucket) {
      finishedTurns.push({
        role: 'assistant',
        text: bucket.textParts.join('\n\n'),
        toolNarrations: bucket.toolNarrations,
      });
    }
  }

  if (!yaml.cwd) {
    throw new Error(
      `Chat "${id}" has no working directory (cwd) recorded in its workspace.yaml and cannot be migrated. The target platform needs a cwd to place the migrated session.`
    );
  }

  return {
    sourcePlatform: 'copilot-cli',
    sourceChatId: id,
    title: yaml.name || '(untitled)',
    cwd: yaml.cwd,
    gitBranch: yaml.branch || undefined,
    model: model || undefined,
    createdAt: yaml.created_at || new Date(0).toISOString(),
    updatedAt: yaml.updated_at || new Date(0).toISOString(),
    turns: finishedTurns.filter(
      (t) => (t.text && t.text.trim().length > 0) || (t.toolNarrations && t.toolNarrations.length > 0)
    ),
    _sessionFormatVersion: sessionFormatVersion,
  };
}

module.exports = { listChats, readChat, sessionRoot, parseWorkspaceYaml, assertSafeChatId };
