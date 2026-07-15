'use strict';

const { getPlatform } = require('./registry');
const { assertValidIR } = require('./ir-schema');

// The four stages a migration always passes through, in order. Exposed so a
// caller (e.g. the CLI's progress bar) can size itself without duplicating
// this list, and so onStage handlers can react to specific stage names.
const STAGES = ['reading', 'validating', 'writing', 'done'];

// The "authoritative" format-drift check described in the original design
// spec: a reader that captures an embedded session-format-version marker
// (currently only copilot-cli's `_sessionFormatVersion`, from its
// session.start event) is compared against the platform's own declared
// `sessionFormatVersion`. A mismatch means the source CLI's on-disk format
// has moved on since this reader was written, and the parse may already be
// silently wrong -- so this fails loudly and by name instead of letting a
// corrupted or truncated IR reach the target platform's writer. Not every
// platform's format exposes a comparable marker (claude-code's reader only
// captures the writing CLI's own semver, not a distinct schema version), so
// this is a no-op whenever either side of the comparison is unavailable --
// an honest "nothing to check" rather than a fabricated one.
function assertFormatVersionSupported(ir, supportedVersions) {
  const expected = supportedVersions?.sessionFormatVersion;
  const actual = ir?._sessionFormatVersion;
  if (expected == null || actual == null) return;
  if (actual !== expected) {
    throw new Error(
      `${ir.sourcePlatform}'s session format has changed: hopchat's reader expects format version ${expected}, ` +
        `but this session is format version ${actual}. Parsing may be incomplete or incorrect. ` +
        `Check for a hopchat update, or open an issue if none is available yet.`
    );
  }
}

// onStage(stageName, info) is called synchronously as each stage completes.
// `info` carries stage-specific metadata (see call sites below) for a caller
// that wants to display progress -- migrate() itself has no notion of a UI.
function migrate({ from, to, chatId, onStage }) {
  const notify = typeof onStage === 'function' ? onStage : () => {};

  const source = getPlatform(from);
  const target = getPlatform(to);

  const ir = source.reader.readChat(chatId);
  assertValidIR(ir);
  assertFormatVersionSupported(ir, source.supportedVersions);
  notify('reading', { turnCount: ir.turns.length, title: ir.title, model: ir.model, cwd: ir.cwd });
  notify('validating', {});

  const result = target.writer.writeChat(ir);
  notify('writing', { newChatId: result.newChatId });

  notify('done', {});
  return { ...result, sourcePlatform: from, targetPlatform: to, sourceChatId: chatId };
}

module.exports = { migrate, STAGES, assertFormatVersionSupported };
