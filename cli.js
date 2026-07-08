'use strict';

const chalk = require('chalk');
const { registerPlatform, listPlatforms, getPlatform } = require('./core/registry');
const { migrate } = require('./core/migrate');
const { checkCompatibility } = require('./core/version-check');
const { animateHopBetween, printStaticMascot } = require('./cli-mascot');
const { typewriteLine } = require('./cli-text-fx');

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
async function warnIfUnsupported(platform) {
  const versions = SUPPORTED_VERSIONS[platform];
  if (!versions) return; // platform ships no version descriptor; nothing to check
  let message;
  try {
    message = buildVersionWarning(versions, await checkCompatibility(versions.command, versions.range));
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

// id and updatedAt are fixed-shape values (a UUID, an ISO timestamp). id in
// particular must never be truncated -- the user copies it verbatim into
// `hopchat migrate <chat-id>`, so a shortened id would be unusable. title and
// cwd are free text and share whatever width is actually left after the
// fixed columns and gutters, so the table adapts to the real terminal
// instead of a hardcoded total that can overflow a narrow window.
const FIXED_COLUMN_WIDTH = { updatedAt: 24 };
const UNTRUNCATABLE_COLUMNS = new Set(['id']);
const DEFAULT_TERMINAL_WIDTH = 120;
const COLUMN_GUTTER = 2;

function getTerminalWidth() {
  const columns = process.stdout.columns;
  return Number.isInteger(columns) && columns > 0 ? columns : DEFAULT_TERMINAL_WIDTH;
}

function truncate(value, max) {
  const str = String(value ?? '');
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + '…';
}

// Compute a display width per column so the table never exceeds terminalWidth
// -- except when id + updatedAt + gutters alone already exceed it, an extreme
// edge case (a terminal narrower than ~60 columns) where id's full UUID is
// still protected from truncation since it must stay copy-pasteable.
function computeColumnWidths(rows, columns, terminalWidth) {
  const naturalWidth = (col) => Math.max(col.length, ...rows.map((row) => String(row[col] ?? '').length));

  const unshrinkableCols = columns.filter((c) => UNTRUNCATABLE_COLUMNS.has(c) || FIXED_COLUMN_WIDTH[c] !== undefined);
  const flexibleCols = columns.filter((c) => !unshrinkableCols.includes(c));

  const unshrinkableWidths = {};
  for (const col of unshrinkableCols) {
    unshrinkableWidths[col] = UNTRUNCATABLE_COLUMNS.has(col)
      ? naturalWidth(col)
      : Math.min(FIXED_COLUMN_WIDTH[col], naturalWidth(col));
  }

  const gutterTotal = COLUMN_GUTTER * Math.max(columns.length - 1, 0);
  const unshrinkableTotal = Object.values(unshrinkableWidths).reduce((a, b) => a + b, 0);
  // Never inflate `remaining` above what's actually left -- doing so is what
  // used to make the table wider than the real terminal on narrow windows.
  const remaining = Math.max(terminalWidth - unshrinkableTotal - gutterTotal, flexibleCols.length);
  const perFlexible = flexibleCols.length > 0 ? Math.floor(remaining / flexibleCols.length) : 0;

  const widths = {};
  for (const col of columns) {
    widths[col] = unshrinkableCols.includes(col)
      ? unshrinkableWidths[col]
      : Math.max(1, Math.min(perFlexible, naturalWidth(col)));
  }
  return columns.map((c) => widths[c]);
}

function printTableRows(rows, columns) {
  if (rows.length === 0) return ['(no chats found)'];
  const widths = computeColumnWidths(rows, columns, getTerminalWidth());
  const cells = rows.map((row) => columns.map((c, i) => truncate(row[c], widths[i])));
  const displayWidths = columns.map((col, i) => Math.max(col.length, ...cells.map((row) => row[i].length)));
  const formatRow = (values) => values.map((v, i) => String(v).padEnd(displayWidths[i])).join('  ');
  return [
    formatRow(columns),
    displayWidths.map((w) => '-'.repeat(w)).join('  '),
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

// Playful per-stage labels spoken by the mascot's speech bubble as it hops,
// one per leg of the journey. Kept separate from core/migrate.js so
// migrate() itself never needs to know these strings exist.
const STAGE_LABELS = {
  reading: 'Reading chat from source...',
  validating: 'Double-checking nothing got lost in translation...',
  writing: 'Teleporting turns to the target platform...',
  done: 'Chat has landed!',
};

function printMetadataPanel({ from, to, chatId, info }) {
  const line = (label, value) => `  ${chalk.dim(label.padEnd(10))} ${value}`;
  console.log(chalk.bold(`\n${chalk.cyan(from)} ${chalk.dim('->')} ${chalk.cyan(to)}`));
  console.log(line('Chat', chalk.white(info.title || '(untitled)')));
  console.log(line('Turns', chalk.white(String(info.turnCount))));
  if (info.model) console.log(line('Model', chalk.white(info.model)));
  if (info.cwd) console.log(line('Project', chalk.white(info.cwd)));
  console.log(line('Source ID', chalk.dim(chatId)));
  console.log('');
}

// Local file migration finishes in milliseconds -- there's no real
// byte-by-byte progress to show. migrate() first runs to completion
// (capturing each stage's metadata via onStage), then the CLI replays those
// stages as legs of the mascot's hop from source to target, each leg shown
// for a moment so the animation is actually visible rather than a blink.
// Tests set HOPCHAT_NO_ANIMATION=1 to skip the delay and run instantly.
const HOP_STEP_MS = process.env.HOPCHAT_NO_ANIMATION ? 0 : 90;

async function cmdMigrate(args) {
  const { flags, positional } = parseFlags(args);
  const chatId = positional[0];
  if (!flags.from || !flags.to || !chatId) {
    console.error('Usage: hopchat migrate --from <platform> --to <platform> <chat-id>');
    process.exitCode = 1;
    return;
  }
  // Kick off both version checks concurrently rather than one after the
  // other, and don't block migrate() on them -- they run in the background
  // while the (fast, local, synchronous) migration itself proceeds. Only
  // awaited right before printing, so a slow/hung CLI binary can add at
  // most ~1 check's worth of latency instead of 2x that plus a delayed
  // migration start.
  const versionWarnings = Promise.all([warnIfUnsupported(flags.from), warnIfUnsupported(flags.to)]);

  const stageEvents = [];
  const result = migrate({
    from: flags.from,
    to: flags.to,
    chatId,
    onStage(stage, info) {
      stageEvents.push({ stage, info });
    },
  });

  const readingEvent = stageEvents.find((e) => e.stage === 'reading');
  if (readingEvent) {
    printMetadataPanel({ from: flags.from, to: flags.to, chatId, info: readingEvent.info });
  }

  await animateHopBetween({
    fromLabel: chalk.bold(flags.from),
    toLabel: chalk.bold(flags.to),
    stages: stageEvents.map(({ stage }) => ({ bubbleLines: [STAGE_LABELS[stage]] })),
    stepMs: HOP_STEP_MS,
    happy: true,
  });

  // By now the hop animation has taken at least a couple seconds in a real
  // terminal, so the version checks kicked off above have almost always
  // already settled -- this await is what makes any warning actually print
  // (fire-and-forget above would let the process exit before it lands), not
  // what causes the wait.
  await versionWarnings;

  console.log('');
  await typewriteLine(chalk.green(`✔ Migrated "${chatId}" from ${flags.from} to ${flags.to}.`), { charDelayMs: 6 });
  console.log(`  ${chalk.dim('Resume with:')} ${chalk.bold(result.resumeCommand)}\n`);
}

function cmdPlatforms() {
  for (const name of listPlatforms()) {
    console.log(name);
  }
}

const HELP_TEXT = `${chalk.bold('Usage:')}
  hopchat <command> [options]

${chalk.bold('Commands:')}
  ${chalk.cyan('list')} <platform>                          List chats found for a platform
  ${chalk.cyan('migrate')} --from <platform> --to <platform> <chat-id>
                                            Migrate a chat from one platform to another
  ${chalk.cyan('platforms')}                                List supported platform names
  ${chalk.cyan('help')}, --help, -h                         Show this help

${chalk.bold('Examples:')}
${chalk.dim('  hopchat list copilot-cli')}
${chalk.dim('  hopchat list claude-code')}
${chalk.dim('  hopchat migrate --from copilot-cli --to claude-code 1d5a6952-f893-4173-8aaa-d51876acf5c0')}
${chalk.dim('  hopchat platforms')}

After a successful migrate, run the printed resume command (e.g. "claude --resume <id>")
in the target tool to continue the conversation.`;

async function cmdHelp() {
  printStaticMascot([`${chalk.bold('hopchat')} ${chalk.dim('v0.2.0')}`, 'Migrate AI CLI chats between tools']);
  console.log('');
  for (const line of HELP_TEXT.split('\n')) {
    await typewriteLine(line, { charDelayMs: line.trim() ? 4 : 0 });
  }
}

const HELP_FLAGS = new Set(['help', '--help', '-h']);

async function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (!command || HELP_FLAGS.has(command)) return cmdHelp();
    if (command === 'list') return cmdList(rest);
    if (command === 'migrate') return await cmdMigrate(rest);
    if (command === 'platforms') return cmdPlatforms();
    console.error(`Unknown command "${command}". Try: list, migrate, platforms, help`);
    process.exitCode = 1;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run, parseFlags, printTableRows, buildVersionWarning, warnIfUnsupported };
