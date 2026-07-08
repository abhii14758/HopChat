'use strict';

const { getPlatform } = require('./registry');
const { assertValidIR } = require('./ir-schema');

function migrate({ from, to, chatId }) {
  const source = getPlatform(from);
  const target = getPlatform(to);

  const ir = source.reader.readChat(chatId);
  assertValidIR(ir);

  const result = target.writer.writeChat(ir);
  return { ...result, sourcePlatform: from, targetPlatform: to, sourceChatId: chatId };
}

module.exports = { migrate };
