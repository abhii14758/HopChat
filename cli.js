'use strict';

const { registerPlatform, listPlatforms, getPlatform } = require('./core/registry');
const { migrate } = require('./core/migrate');

registerPlatform('copilot-cli', {
  reader: require('./platforms/copilot-cli/reader'),
  writer: require('./platforms/copilot-cli/writer'),
});
registerPlatform('claude-code', {
  reader: require('./platforms/claude-code/reader'),
  writer: require('./platforms/claude-code/writer'),
});

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = args[i + 1];
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printTableRows(rows, columns) {
  if (rows.length === 0) return ['(no chats found)'];
  const widths = columns.map((col) => Math.max(col.length, ...rows.map((row) => String(row[col] ?? '').length)));
  const formatRow = (values) => values.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  return [
    formatRow(columns),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map((row) => formatRow(columns.map((c) => row[c] ?? ''))),
  ];
}

function cmdList(args) {
  const platform = args[0];
  if (!platform) {
    console.error('Usage: hopchat list <platform>');
    process.exitCode = 1;
    return;
  }
  const { reader } = getPlatform(platform);
  const chats = reader.listChats();
  for (const line of printTableRows(chats, ['id', 'title', 'updatedAt', 'cwd'])) {
    console.log(line);
  }
}

function cmdMigrate(args) {
  const { flags, positional } = parseFlags(args);
  const chatId = positional[0];
  if (!flags.from || !flags.to || !chatId) {
    console.error('Usage: hopchat migrate --from <platform> --to <platform> <chat-id>');
    process.exitCode = 1;
    return;
  }
  const result = migrate({ from: flags.from, to: flags.to, chatId });
  console.log(`Migrated ${flags.from} chat "${chatId}" to ${flags.to}.`);
  console.log(`Resume with: ${result.resumeCommand}`);
}

function cmdPlatforms() {
  for (const name of listPlatforms()) {
    console.log(name);
  }
}

function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (command === 'list') return cmdList(rest);
    if (command === 'migrate') return cmdMigrate(rest);
    if (command === 'platforms') return cmdPlatforms();
    console.error(`Unknown command "${command || ''}". Try: list, migrate, platforms`);
    process.exitCode = 1;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run, parseFlags, printTableRows };
