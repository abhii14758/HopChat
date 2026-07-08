'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function sessionRoot() {
  return path.join(os.homedir(), '.copilot', 'session-state');
}

function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
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
    const event = JSON.parse(line);

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

  return {
    sourcePlatform: 'copilot-cli',
    sourceChatId: id,
    title: yaml.name || '(untitled)',
    cwd: yaml.cwd || '',
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

module.exports = { listChats, readChat, sessionRoot, parseWorkspaceYaml };
