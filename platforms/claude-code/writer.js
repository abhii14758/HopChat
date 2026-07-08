'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectsRoot, sanitizeCwdToProjectDir } = require('./reader');

function turnToEntry(turn, sessionId, cwd, gitBranch, model) {
  const timestamp = new Date().toISOString();
  const uuid = crypto.randomUUID();

  if (turn.role === 'user') {
    return {
      parentUuid: null,
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
    parentUuid: null,
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

function writeChat(ir) {
  const sessionId = crypto.randomUUID();
  const projectDirName = sanitizeCwdToProjectDir(ir.cwd);
  const projectDir = path.join(projectsRoot(), projectDirName);
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);

  try {
    fs.mkdirSync(projectDir, { recursive: true });

    const entries = ir.turns.map((turn) => turnToEntry(turn, sessionId, ir.cwd, ir.gitBranch, ir.model));
    const jsonl = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
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
