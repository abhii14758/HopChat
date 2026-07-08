'use strict';

// Copy this folder to platforms/<your-platform-name>/ and fill in the TODOs.
// See platforms/copilot-cli/reader.js or platforms/claude-code/reader.js for
// worked examples, and core/contract-tests.js for what your exports must satisfy.

function listChats() {
  // TODO: scan this platform's local session storage.
  // Return: [{ id, title, updatedAt, cwd }, ...]
  throw new Error('listChats() not implemented for this platform');
}

function readChat(id) {
  // TODO: parse the session identified by `id` into the common IR shape:
  // {
  //   sourcePlatform: '<your-platform-name>',
  //   sourceChatId: id,
  //   title, cwd, gitBranch, model, createdAt, updatedAt,
  //   turns: [{ role: 'user'|'assistant', text, toolNarrations?: string[] }]
  // }
  // Fold tool calls into `toolNarrations` (short strings) on the assistant
  // turn they belong to — do not invent structured tool_use blocks.
  throw new Error('readChat() not implemented for this platform');
}

module.exports = { listChats, readChat };
