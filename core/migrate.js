'use strict';

const { getPlatform } = require('./registry');
const { assertValidIR } = require('./ir-schema');

// The four stages a migration always passes through, in order. Exposed so a
// caller (e.g. the CLI's progress bar) can size itself without duplicating
// this list, and so onStage handlers can react to specific stage names.
const STAGES = ['reading', 'validating', 'writing', 'done'];

// onStage(stageName, info) is called synchronously as each stage completes.
// `info` carries stage-specific metadata (see call sites below) for a caller
// that wants to display progress -- migrate() itself has no notion of a UI.
function migrate({ from, to, chatId, onStage }) {
  const notify = typeof onStage === 'function' ? onStage : () => {};

  const source = getPlatform(from);
  const target = getPlatform(to);

  const ir = source.reader.readChat(chatId);
  assertValidIR(ir);
  notify('reading', { turnCount: ir.turns.length, title: ir.title, model: ir.model, cwd: ir.cwd });
  notify('validating', {});

  const result = target.writer.writeChat(ir);
  notify('writing', { newChatId: result.newChatId });

  notify('done', {});
  return { ...result, sourcePlatform: from, targetPlatform: to, sourceChatId: chatId };
}

module.exports = { migrate, STAGES };
