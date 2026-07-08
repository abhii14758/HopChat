'use strict';

// Copy this folder to platforms/<your-platform-name>/ and fill in the TODOs.

function writeChat(ir) {
  // TODO: write `ir` into this platform's native local session format,
  // creating a brand-new session id/directory — never modify an existing one.
  // On any failure, delete whatever was partially written before re-throwing.
  // Return: { newChatId, resumeCommand }
  throw new Error('writeChat() not implemented for this platform');
}

module.exports = { writeChat };
