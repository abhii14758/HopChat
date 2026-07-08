'use strict';

const { registerPlatform, listPlatforms, getPlatform } = require('./core/registry');
const { migrate } = require('./core/migrate');
const { checkCompatibility } = require('./core/version-check');

registerPlatform('copilot-cli', {
  reader: require('./platforms/copilot-cli/reader'),
  writer: require('./platforms/copilot-cli/writer'),
});
registerPlatform('claude-code', {
  reader: require('./platforms/claude-code/reader'),
  writer: require('./platforms/claude-code/writer'),
});

const SUPPORTED_VERSIONS = {
  'copilot-cli': require('./platforms/copilot-cli/supported-versions'),
  'claude-code': require('./platforms/claude-code/supported-versions'),
};

// Pure: given a platform's supported-versions descriptor and a checkCompatibility
// result, return a warning string (or null when everything is fine). Kept pure so
// it is unit-testable without shelling out to a real CLI binary.
function buildVersionWarning(versions, compatResult) {
  if (!versions || !compatResult) return null;
  const [min, max] = versions.range;
  if (!compatResult.verified) {
    return `Warning: could not verify the installed "${versions.command}" version; the ${versions.command} session format may have changed. Migration will still be attempted.`;
  }
  if (!compatResult.supported) {
    return `Warning: installed "${versions.command}" version ${compatResult.installed} is outside the tested range (${min} - ${max}); the session format may have changed. Migration will still be attempted.`;
  }
  return null;
}

// Impure: shells out to check the real installed CLI for `platform`, printing a
// non-blocking warning to stderr if the version can't be confirmed. Never throws.
function warnIfUnsupported(platform) {
  const versions = SUPPORTED_VERSIONS[platform];
  if (!versions) return; // platform ships no version descriptor; nothing to check
  let message;
  try {
    message = buildVersionWarning(versions, checkCompatibility(versions.command, versions.range));
  } catch {
    return;
  }
  if (message) console.error(message);
}

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

// Per-column max width so long titles/paths don't blow out the terminal and
// wrap unpredictably. Values longer than the cap are truncated with an
// ellipsis; terminal width itself is respected via a total-width fallback
// when stdout isn't a TTY (e.g. piped output) or columns is unset.
const COLUMN_MAX_WIDTH = { id: 36, title: 40, updatedAt: 24, cwd: 48 };

function truncate(value, max) {
  const str = String(value ?? '');
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + '…';
}

function printTableRows(rows, columns) {
  if (rows.length === 0) return ['(no chats found)'];
  const capFor = (col) => COLUMN_MAX_WIDTH[col] ?? 30;
  const cells = rows.map((row) => columns.map((c) => truncate(row[c], capFor(c))));
  const widths = columns.map((col, i) => Math.max(col.length, ...cells.map((row) => row[i].length)));
  const formatRow = (values) => values.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  return [
    formatRow(columns),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...cells.map((row) => formatRow(row)),
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
  warnIfUnsupported(flags.from);
  warnIfUnsupported(flags.to);
  const result = migrate({ from: flags.from, to: flags.to, chatId });
  console.log(`Migrated ${flags.from} chat "${chatId}" to ${flags.to}.`);
  console.log(`Resume with: ${result.resumeCommand}`);
}

function cmdPlatforms() {
  for (const name of listPlatforms()) {
    console.log(name);
  }
}

const HELP_TEXT = `hopchat — migrate AI CLI chat sessions between tools

Usage:
  hopchat <command> [options]

Commands:
  list <platform>                          List chats found for a platform
  migrate --from <platform> --to <platform> <chat-id>
                                            Migrate a chat from one platform to another
  platforms                                List supported platform names
  help, --help, -h                         Show this help

Examples:
  hopchat list copilot-cli
  hopchat list claude-code
  hopchat migrate --from copilot-cli --to claude-code 1d5a6952-f893-4173-8aaa-d51876acf5c0
  hopchat platforms

After a successful migrate, run the printed resume command (e.g. "claude --resume <id>")
in the target tool to continue the conversation.`;

function cmdHelp() {
  console.log(HELP_TEXT);
}

const HELP_FLAGS = new Set(['help', '--help', '-h']);

function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (!command || HELP_FLAGS.has(command)) return cmdHelp();
    if (command === 'list') return cmdList(rest);
    if (command === 'migrate') return cmdMigrate(rest);
    if (command === 'platforms') return cmdPlatforms();
    console.error(`Unknown command "${command}". Try: list, migrate, platforms, help`);
    process.exitCode = 1;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run, parseFlags, printTableRows, buildVersionWarning, warnIfUnsupported };
