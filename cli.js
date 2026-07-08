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

module.exports = { run, parseFlags, printTableRows, buildVersionWarning, warnIfUnsupported };
