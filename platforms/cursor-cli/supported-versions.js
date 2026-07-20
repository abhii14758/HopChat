'use strict';

// NOTE: Cursor's on-disk chat format is undocumented and changes between
// releases. The range below reflects the versions this adapter has been
// tested against. Cursor stores chat data in SQLite databases under
// globalStorage/state.vscdb and workspaceStorage/*/state.vscdb, not in flat
// JSON files -- this adapter uses a simplified JSON-file format at
// ~/.cursor/chats/ as an approximation. A real adapter targeting Cursor's
// native SQLite format would require node:sqlite (Node 22.5+) and knowledge
// of the cursorDiskKV/composerData schema.
module.exports = {
  command: 'cursor',
  range: ['0.45.0', '0.50.0'],
};
