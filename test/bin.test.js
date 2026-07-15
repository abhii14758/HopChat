'use strict';

// Every other test drives cli.js's run() in-process. Nothing previously
// exercised bin/hopchat.js itself -- the actual file npm installs as the
// `hopchat` global command -- so a broken shebang, a require path typo, or a
// broken top-level .catch() wiring could ship without any test catching it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const BIN_PATH = path.join(__dirname, '..', 'bin', 'hopchat.js');
// Deliberately a separate fixture tree from test/fixtures/copilot-cli/ (used
// by test/cli.test.js and others): node --test runs test files in parallel
// by default, and this test spawns a real child process that writes into
// <HOME>/.claude/projects/... -- sharing a fixture root with another file's
// concurrently-running write-then-recursive-cleanup would be a real race.
const MIGRATE_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'bin-e2e');

test('bin/hopchat.js --help runs as a real child process and prints usage', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN_PATH, '--help'], {
    env: { ...process.env, HOPCHAT_NO_ANIMATION: '1' },
  });
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /hopchat migrate --from/);
});

test('bin/hopchat.js --version runs as a real child process and prints the real version', async () => {
  const packageJson = require('../package.json');
  const { stdout } = await execFileAsync(process.execPath, [BIN_PATH, '--version']);
  assert.equal(stdout.trim(), `hopchat v${packageJson.version}`);
});

test('bin/hopchat.js exits non-zero and prints an error for an unknown command', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [BIN_PATH, 'bogus-command']),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /Unknown command "bogus-command"/);
      return true;
    }
  );
});

test('bin/hopchat.js migrate runs end-to-end as a real child process, honoring HOME overrides', async () => {
  // Spawns a real subprocess, so os.homedir() can't be monkeypatched from
  // this test process -- HOME/USERPROFILE are set on the child's env
  // instead, which os.homedir() reads on POSIX/Windows respectively.
  let newChatId;
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [BIN_PATH, 'migrate', '--from', 'copilot-cli', '--to', 'claude-code', 'fixture-chat-001'],
      {
        env: { ...process.env, HOPCHAT_NO_ANIMATION: '1', HOME: MIGRATE_FIXTURE_ROOT, USERPROFILE: MIGRATE_FIXTURE_ROOT },
      }
    );
    assert.match(stdout, /Sample Fixture Chat/);
    assert.match(stdout, /claude --resume/);
    const match = stdout.match(/claude --resume ([0-9a-f-]{36})/);
    assert.ok(match, 'resume command should contain a session id');
    newChatId = match[1];
  } finally {
    if (newChatId) {
      const claudeReader = require('../platforms/claude-code/reader');
      fs.rmSync(
        path.join(MIGRATE_FIXTURE_ROOT, '.claude', 'projects', claudeReader.sanitizeCwdToProjectDir('C:\\repo\\sample-project')),
        { recursive: true, force: true }
      );
    }
  }
});
