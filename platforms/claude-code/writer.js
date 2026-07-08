'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectsRoot, sanitizeCwdToProjectDir } = require('./reader');

// Claude Code reconstructs a conversation by walking `parentUuid` backwards
// from the last entry's uuid — entries whose parentUuid doesn't chain to the
// previous entry are dropped from the reconstructed transcript even though
// they're present in the file. `parentUuid` must be the previous entry's
// `uuid` (null only for the very first entry in the session).
function turnToEntry(turn, sessionId, cwd, gitBranch, model, parentUuid) {
  const timestamp = new Date().toISOString();
  const uuid = crypto.randomUUID();

  if (turn.role === 'user') {
    return {
      parentUuid,
      isSidechain: false,
      type: 'user',
      message: { role: 'user', content: turn.text },
      uuid,
      timestamp,
      sessionId,
      cwd,
      gitBranch,
      version: 'hopchat-import',
    };
  }

  let text = turn.text;
  if (turn.toolNarrations && turn.toolNarrations.length > 0) {
    text += `\n\n_(migrated tool activity: ${turn.toolNarrations.join('; ')})_`;
  }

  return {
    parentUuid,
    isSidechain: false,
    type: 'assistant',
    message: {
      model: model || 'imported',
      id: `msg_${crypto.randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    uuid,
    timestamp,
    sessionId,
    cwd,
    gitBranch,
    version: 'hopchat-import',
  };
}

// Real Claude Code session files start with a `last-prompt` index line whose
// `leafUuid` points at the final message's uuid, followed by `mode` and
// `permission-mode` lines. Without this header `claude --resume` reports
// "No conversation found" even though the message entries are well-formed.
function headerLines(sessionId, leafUuid) {
  return [
    { type: 'last-prompt', leafUuid, sessionId },
    { type: 'mode', mode: 'normal', sessionId },
    { type: 'permission-mode', permissionMode: 'default', sessionId },
  ];
}

function writeChat(ir) {
  const sessionId = crypto.randomUUID();
  const projectDirName = sanitizeCwdToProjectDir(ir.cwd);
  const projectDir = path.join(projectsRoot(), projectDirName);
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);

  try {
    fs.mkdirSync(projectDir, { recursive: true });

    let parentUuid = null;
    const entries = ir.turns.map((turn) => {
      const entry = turnToEntry(turn, sessionId, ir.cwd, ir.gitBranch, ir.model, parentUuid);
      parentUuid = entry.uuid;
      return entry;
    });
    const leafUuid = entries.length > 0 ? entries[entries.length - 1].uuid : crypto.randomUUID();
    const allLines = [...headerLines(sessionId, leafUuid), ...entries];
    const jsonl = allLines.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(filePath, jsonl);

    return { newChatId: sessionId, resumeCommand: `claude --resume ${sessionId}` };
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    // Remove the project dir too if this write created it and left it empty,
    // so a failed migration doesn't litter an orphaned directory.
    try {
      const remaining = fs.readdirSync(projectDir);
      if (remaining.length === 0) fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // projectDir may not exist or isn't readable; nothing more to clean.
    }
    throw err;
  }
}

module.exports = { writeChat };
