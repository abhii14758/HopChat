'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sessionRoot } = require('./reader');

function turnToMessage(turn) {
  if (turn.role === 'user') {
    return { role: 'user', content: turn.text, toolCalls: [] };
  }

  const msg = { role: 'assistant', content: turn.text, toolCalls: [] };
  if (turn.toolNarrations && turn.toolNarrations.length > 0) {
    msg.content += `\n\n_(migrated tool activity: ${turn.toolNarrations.join('; ')})_`;
  }
  return msg;
}

function writeChat(ir) {
  const newId = crypto.randomUUID();
  const root = sessionRoot();
  const filePath = path.join(root, `${newId}.json`);

  try {
    fs.mkdirSync(root, { recursive: true });

    const chat = {
      id: newId,
      title: ir.title,
      cwd: ir.cwd,
      gitBranch: ir.gitBranch || null,
      model: ir.model || null,
      createdAt: ir.createdAt,
      updatedAt: ir.updatedAt,
      messages: ir.turns.map(turnToMessage),
    };

    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2) + '\n');

    return { newChatId: newId, resumeCommand: `cursor --resume ${newId}` };
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

module.exports = { writeChat };
