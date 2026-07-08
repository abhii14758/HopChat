'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sessionRoot } = require('./reader');

function toWorkspaceYaml(ir, newId) {
  const lines = [
    `id: ${newId}`,
    `cwd: ${ir.cwd}`,
    `git_root: ${ir.cwd}`,
    `branch: ${ir.gitBranch || ''}`,
    `client_name: hopchat`,
    `name: ${ir.title}`,
    `user_named: false`,
    `summary_count: 0`,
    `created_at: ${ir.createdAt}`,
    `updated_at: ${ir.updatedAt}`,
    '',
  ];
  return lines.join('\n');
}

function turnToEvents(turn, turnId) {
  const events = [];
  if (turn.role === 'user') {
    events.push({
      type: 'user.message',
      data: { content: turn.text },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
  } else {
    let content = turn.text;
    if (turn.toolNarrations && turn.toolNarrations.length > 0) {
      content += `\n\n_(migrated tool activity: ${turn.toolNarrations.join('; ')})_`;
    }
    events.push({
      type: 'assistant.message',
      data: { messageId: crypto.randomUUID(), content, turnId: String(turnId) },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
    events.push({
      type: 'assistant.turn_end',
      data: { turnId: String(turnId) },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
  }
  return events;
}

function writeChat(ir) {
  const newId = crypto.randomUUID();
  const chatDir = path.join(sessionRoot(), newId);

  try {
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(path.join(chatDir, 'workspace.yaml'), toWorkspaceYaml(ir, newId));

    const events = [
      {
        type: 'session.start',
        data: {
          sessionId: newId,
          version: 1,
          producer: 'hopchat',
          copilotVersion: 'imported',
          startTime: new Date().toISOString(),
        },
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parentId: null,
      },
    ];

    if (ir.model) {
      events.push({
        type: 'session.model_change',
        data: { newModel: ir.model },
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parentId: null,
      });
    }

    let turnId = 0;
    for (const turn of ir.turns) {
      events.push(...turnToEvents(turn, turnId));
      if (turn.role === 'assistant') turnId += 1;
    }

    const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(path.join(chatDir, 'events.jsonl'), jsonl);

    return { newChatId: newId, resumeCommand: `copilot --resume=${newId}` };
  } catch (err) {
    fs.rmSync(chatDir, { recursive: true, force: true });
    throw err;
  }
}

module.exports = { writeChat };
