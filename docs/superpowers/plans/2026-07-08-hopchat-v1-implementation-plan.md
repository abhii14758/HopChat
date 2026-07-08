# hopchat v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `hopchat`, a cross-platform npm CLI that migrates a chat session from GitHub Copilot CLI to Claude Code (and back), writing it into the target's own local session storage so the target's native resume command loads it.

**Architecture:** Adapter + Intermediate Representation (IR) pattern. Each platform has a `reader.js` (scans its local session storage, parses into a common IR of `{metadata, turns}`) and a `writer.js` (IR → that platform's native file format). `core/migrate.js` orchestrates read → validate → write with zero platform-specific logic. Fidelity is condensed: tool calls are folded into assistant turn text as short narrations, never replayed as structured tool calls.

**Tech Stack:** Node.js (>=18), CommonJS, `node:test` + `node:assert/strict` (no test framework dependency), no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-hopchat-cli-migration-design.md`

---

## Real format facts this plan relies on

These were confirmed by directly inspecting real session files on the development machine (not guessed):

**Copilot CLI** — `~/.copilot/session-state/<chat-id>/`
- `workspace.yaml`: flat `key: value` lines — `id, cwd, git_root, branch, client_name, name, user_named, summary_count, created_at, updated_at`.
- `events.jsonl`: one JSON object per line, each `{type, data, id, timestamp, parentId}`.
  - `session.start`: `data.sessionId, data.version, data.copilotVersion`
  - `user.message`: `data.content` (string — the raw text the user typed)
  - `assistant.message`: `data.messageId, data.model, data.content, data.toolRequests[], data.turnId` (turnId is a **string**, e.g. `"0"`)
  - `tool.execution_start`: `data.toolCallId, data.toolName, data.turnId`
  - `tool.execution_complete`: `data.toolCallId, data.success, data.error?.message, data.turnId`
  - `assistant.turn_end`: `data.turnId`

**Claude Code** — `~/.claude/projects/<sanitized-cwd>/<session-id>.jsonl`
- Project directory name = `cwd.replace(/[^a-zA-Z0-9]/g, '-')`. Verified: `C:\Users\X\Desktop\IFP\mybot_frontend` → `C--Users-X-Desktop-IFP-mybot-frontend`.
- Each line: `{type, uuid, parentUuid, timestamp, sessionId, cwd, gitBranch, version, message}`.
  - `type:"user"`: `message:{role:"user", content: string | ContentBlock[]}`. A tool result comes back as a `type:"user"` entry whose content array contains only `{type:"tool_result", ...}` blocks — these are not real user turns and must be skipped.
  - `type:"assistant"`: `message:{model, id, type:"message", role:"assistant", content: ContentBlock[]}` where blocks can be `{type:"text", text}`, `{type:"thinking", ...}` (ignore), or `{type:"tool_use", name, input}`.

---

### Task 1: Project scaffold

**Files:**
- Create: `D:\hopchat\package.json`
- Create: `D:\hopchat\bin\hopchat.js`
- Create: `D:\hopchat\cli.js` (placeholder module, filled in Task 9)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "hopchat",
  "version": "0.1.0",
  "description": "Migrate AI CLI chat sessions between tools (Copilot CLI, Claude Code, and more)",
  "bin": {
    "hopchat": "./bin/hopchat.js"
  },
  "main": "cli.js",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test test/"
  },
  "license": "MIT",
  "files": [
    "bin",
    "cli.js",
    "core",
    "platforms",
    "README.md"
  ]
}
```

- [ ] **Step 2: Write bin/hopchat.js**

```js
#!/usr/bin/env node
'use strict';

require('../cli').run(process.argv.slice(2));
```

- [ ] **Step 3: Write a minimal cli.js stub so `node bin/hopchat.js` doesn't crash yet**

```js
'use strict';

function run(argv) {
  console.log('hopchat: not yet implemented');
}

module.exports = { run };
```

- [ ] **Step 4: Verify the binary runs**

Run: `node bin/hopchat.js`
Expected output: `hopchat: not yet implemented`

- [ ] **Step 5: Commit**

```bash
git add package.json bin/hopchat.js cli.js
git commit -m "chore: scaffold hopchat CLI project"
```

---

### Task 2: Core IR schema and validation

**Files:**
- Create: `D:\hopchat\core\ir-schema.js`
- Test: `D:\hopchat\test\core\ir-schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateIR, assertValidIR } = require('../../core/ir-schema');

function validIR() {
  return {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'abc-123',
    title: 'Test chat',
    cwd: 'C:\\repo',
    gitBranch: 'main',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-07-03T05:38:53.780Z',
    updatedAt: '2026-07-08T04:38:37.689Z',
    turns: [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi', toolNarrations: ['Ran grep'] },
    ],
  };
}

test('validateIR accepts a well-formed IR', () => {
  assert.deepEqual(validateIR(validIR()), []);
});

test('validateIR rejects missing required string fields', () => {
  const ir = validIR();
  delete ir.title;
  const errors = validateIR(ir);
  assert.ok(errors.includes('IR.title must be a non-empty string'));
});

test('validateIR rejects an empty turns array', () => {
  const ir = validIR();
  ir.turns = [];
  const errors = validateIR(ir);
  assert.ok(errors.includes('IR.turns must be a non-empty array'));
});

test('validateIR rejects an invalid role', () => {
  const ir = validIR();
  ir.turns[0].role = 'system';
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('turns[0].role')));
});

test('validateIR rejects toolNarrations on a user turn', () => {
  const ir = validIR();
  ir.turns[0].toolNarrations = ['nope'];
  const errors = validateIR(ir);
  assert.ok(errors.some((e) => e.includes('only valid on assistant turns')));
});

test('assertValidIR throws with all errors joined', () => {
  const ir = validIR();
  delete ir.title;
  assert.throws(() => assertValidIR(ir), /IR\.title must be a non-empty string/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/core/ir-schema.test.js`
Expected: FAIL — `Cannot find module '../../core/ir-schema'`

- [ ] **Step 3: Write core/ir-schema.js**

```js
'use strict';

const VALID_ROLES = new Set(['user', 'assistant']);

function validateIR(ir) {
  const errors = [];

  if (!ir || typeof ir !== 'object') {
    return ['IR must be an object'];
  }

  const requiredStrings = ['sourcePlatform', 'sourceChatId', 'title', 'cwd'];
  for (const field of requiredStrings) {
    if (typeof ir[field] !== 'string' || ir[field].length === 0) {
      errors.push(`IR.${field} must be a non-empty string`);
    }
  }

  const requiredDates = ['createdAt', 'updatedAt'];
  for (const field of requiredDates) {
    if (typeof ir[field] !== 'string' || Number.isNaN(Date.parse(ir[field]))) {
      errors.push(`IR.${field} must be an ISO 8601 date string`);
    }
  }

  if (ir.gitBranch !== undefined && typeof ir.gitBranch !== 'string') {
    errors.push('IR.gitBranch must be a string when present');
  }
  if (ir.model !== undefined && typeof ir.model !== 'string') {
    errors.push('IR.model must be a string when present');
  }

  if (!Array.isArray(ir.turns) || ir.turns.length === 0) {
    errors.push('IR.turns must be a non-empty array');
    return errors;
  }

  ir.turns.forEach((turn, index) => {
    if (!turn || typeof turn !== 'object') {
      errors.push(`IR.turns[${index}] must be an object`);
      return;
    }
    if (!VALID_ROLES.has(turn.role)) {
      errors.push(`IR.turns[${index}].role must be "user" or "assistant"`);
    }
    if (typeof turn.text !== 'string') {
      errors.push(`IR.turns[${index}].text must be a string`);
    }
    if (turn.toolNarrations !== undefined) {
      const isStringArray =
        Array.isArray(turn.toolNarrations) && turn.toolNarrations.every((n) => typeof n === 'string');
      if (!isStringArray) {
        errors.push(`IR.turns[${index}].toolNarrations must be an array of strings when present`);
      }
      if (turn.role !== 'assistant') {
        errors.push(`IR.turns[${index}].toolNarrations is only valid on assistant turns`);
      }
    }
  });

  return errors;
}

function assertValidIR(ir) {
  const errors = validateIR(ir);
  if (errors.length > 0) {
    throw new Error(`Invalid IR:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

module.exports = { validateIR, assertValidIR };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/core/ir-schema.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add core/ir-schema.js test/core/ir-schema.test.js
git commit -m "feat: add IR schema validation"
```

---

### Task 3: Core platform registry

**Files:**
- Create: `D:\hopchat\core\registry.js`
- Test: `D:\hopchat\test\core\registry.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { registerPlatform, getPlatform, listPlatforms, clearRegistry } = require('../../core/registry');

beforeEach(() => clearRegistry());

function fakeReader() {
  return { listChats: () => [], readChat: () => ({}) };
}
function fakeWriter() {
  return { writeChat: () => ({}) };
}

test('registerPlatform then getPlatform returns the same reader/writer', () => {
  const reader = fakeReader();
  const writer = fakeWriter();
  registerPlatform('fake', { reader, writer });
  const entry = getPlatform('fake');
  assert.equal(entry.reader, reader);
  assert.equal(entry.writer, writer);
});

test('listPlatforms lists registered names', () => {
  registerPlatform('a', { reader: fakeReader(), writer: fakeWriter() });
  registerPlatform('b', { reader: fakeReader(), writer: fakeWriter() });
  assert.deepEqual(listPlatforms().sort(), ['a', 'b']);
});

test('getPlatform throws a clear error for an unknown platform', () => {
  registerPlatform('a', { reader: fakeReader(), writer: fakeWriter() });
  assert.throws(() => getPlatform('nope'), /Unknown platform "nope"/);
});

test('registerPlatform rejects a reader missing readChat', () => {
  assert.throws(
    () => registerPlatform('bad', { reader: { listChats: () => [] }, writer: fakeWriter() }),
    /must implement listChats\(\) and readChat\(\)/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/core/registry.test.js`
Expected: FAIL — `Cannot find module '../../core/registry'`

- [ ] **Step 3: Write core/registry.js**

```js
'use strict';

const platforms = new Map();

function registerPlatform(name, { reader, writer }) {
  if (!name || typeof name !== 'string') {
    throw new Error('Platform name must be a non-empty string');
  }
  if (!reader || typeof reader.listChats !== 'function' || typeof reader.readChat !== 'function') {
    throw new Error(`Platform "${name}" reader must implement listChats() and readChat()`);
  }
  if (!writer || typeof writer.writeChat !== 'function') {
    throw new Error(`Platform "${name}" writer must implement writeChat()`);
  }
  platforms.set(name, { reader, writer });
}

function getPlatform(name) {
  const entry = platforms.get(name);
  if (!entry) {
    throw new Error(`Unknown platform "${name}". Registered platforms: ${listPlatforms().join(', ') || '(none)'}`);
  }
  return entry;
}

function listPlatforms() {
  return Array.from(platforms.keys());
}

function clearRegistry() {
  platforms.clear();
}

module.exports = { registerPlatform, getPlatform, listPlatforms, clearRegistry };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/core/registry.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add core/registry.js test/core/registry.test.js
git commit -m "feat: add platform registry"
```

---

### Task 4: Version-compatibility helper

**Files:**
- Create: `D:\hopchat\core\version-check.js`
- Test: `D:\hopchat\test\core\version-check.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isVersionInRange, checkCompatibility } = require('../../core/version-check');

test('isVersionInRange accepts a version inside the range', () => {
  assert.equal(isVersionInRange('1.0.65', ['1.0.60', '1.0.70']), true);
});

test('isVersionInRange rejects a version below the range', () => {
  assert.equal(isVersionInRange('1.0.10', ['1.0.60', '1.0.70']), false);
});

test('isVersionInRange rejects a version above the range', () => {
  assert.equal(isVersionInRange('1.0.99', ['1.0.60', '1.0.70']), false);
});

test('checkCompatibility marks unverified when the command is missing', () => {
  const result = checkCompatibility('hopchat-nonexistent-binary-xyz', ['1.0.0', '2.0.0']);
  assert.equal(result.installed, null);
  assert.equal(result.verified, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/core/version-check.test.js`
Expected: FAIL — `Cannot find module '../../core/version-check'`

- [ ] **Step 3: Write core/version-check.js**

```js
'use strict';

const { execFileSync } = require('node:child_process');

function getInstalledVersion(command, versionFlag = '--version') {
  try {
    const output = execFileSync(command, [versionFlag], { encoding: 'utf8' });
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isVersionInRange(version, [min, max]) {
  if (!version) return false;
  const parts = (v) => v.split('.').map(Number);
  const cmp = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  };
  const v = parts(version);
  return cmp(v, parts(min)) >= 0 && cmp(v, parts(max)) <= 0;
}

function checkCompatibility(command, supportedRange) {
  const installed = getInstalledVersion(command);
  if (installed === null) {
    return { installed: null, supported: false, verified: false };
  }
  const supported = isVersionInRange(installed, supportedRange);
  return { installed, supported, verified: true };
}

module.exports = { getInstalledVersion, isVersionInRange, checkCompatibility };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/core/version-check.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add core/version-check.js test/core/version-check.test.js
git commit -m "feat: add CLI version compatibility check"
```

---

### Task 5: Copilot CLI platform — fixtures and reader

**Files:**
- Create: `D:\hopchat\test\fixtures\copilot-cli\.copilot\session-state\fixture-chat-001\workspace.yaml`
- Create: `D:\hopchat\test\fixtures\copilot-cli\.copilot\session-state\fixture-chat-001\events.jsonl`
- Create: `D:\hopchat\platforms\copilot-cli\reader.js`
- Create: `D:\hopchat\platforms\copilot-cli\supported-versions.js`
- Test: `D:\hopchat\test\platforms\copilot-cli.test.js`

- [ ] **Step 1: Write the fixture workspace.yaml**

```yaml
id: fixture-chat-001
cwd: C:\repo\sample-project
git_root: C:\repo\sample-project
branch: main
client_name: github/cli
name: Sample Fixture Chat
user_named: true
summary_count: 0
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T00:05:00.000Z
```

- [ ] **Step 2: Write the fixture events.jsonl**

```
{"type":"session.start","data":{"sessionId":"fixture-chat-001","version":1,"producer":"copilot-agent","copilotVersion":"1.0.65","startTime":"2026-01-01T00:00:00.000Z"},"id":"e1","timestamp":"2026-01-01T00:00:00.000Z","parentId":null}
{"type":"session.model_change","data":{"newModel":"claude-sonnet-4.6"},"id":"e2","timestamp":"2026-01-01T00:00:01.000Z","parentId":"e1"}
{"type":"user.message","data":{"content":"List files in src/"},"id":"e3","timestamp":"2026-01-01T00:00:02.000Z","parentId":"e2"}
{"type":"assistant.message","data":{"messageId":"m1","model":"claude-sonnet-4.6","content":"Let me list the files.","toolRequests":[{"toolCallId":"t1","name":"glob","arguments":{"pattern":"src/**"}}],"turnId":"0"},"id":"e4","timestamp":"2026-01-01T00:00:03.000Z","parentId":"e3"}
{"type":"tool.execution_start","data":{"toolCallId":"t1","toolName":"glob","arguments":{"pattern":"src/**"},"turnId":"0"},"id":"e5","timestamp":"2026-01-01T00:00:04.000Z","parentId":"e4"}
{"type":"tool.execution_complete","data":{"toolCallId":"t1","success":true,"turnId":"0"},"id":"e6","timestamp":"2026-01-01T00:00:05.000Z","parentId":"e5"}
{"type":"assistant.message","data":{"messageId":"m2","model":"claude-sonnet-4.6","content":"Found 3 files: index.js, app.js, utils.js.","turnId":"0"},"id":"e7","timestamp":"2026-01-01T00:00:06.000Z","parentId":"e6"}
{"type":"assistant.turn_end","data":{"turnId":"0"},"id":"e8","timestamp":"2026-01-01T00:00:07.000Z","parentId":"e7"}
```

- [ ] **Step 3: Write supported-versions.js**

```js
'use strict';

module.exports = {
  command: 'copilot',
  range: ['1.0.60', '1.0.70'],
  sessionFormatVersion: 1,
};
```

- [ ] **Step 4: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { listChats, readChat } = require('../../platforms/copilot-cli/reader');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'copilot-cli');

function withFakeHome(fn) {
  const originalHomedir = os.homedir;
  os.homedir = () => FIXTURE_ROOT;
  try {
    return fn();
  } finally {
    os.homedir = originalHomedir;
  }
}

test('listChats finds the fixture chat', () => {
  const chats = withFakeHome(() => listChats());
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, 'fixture-chat-001');
  assert.equal(chats[0].title, 'Sample Fixture Chat');
});

test('readChat parses turns and condenses tool calls into narrations', () => {
  const ir = withFakeHome(() => readChat('fixture-chat-001'));
  assert.equal(ir.sourcePlatform, 'copilot-cli');
  assert.equal(ir.turns.length, 2);
  assert.equal(ir.turns[0].role, 'user');
  assert.equal(ir.turns[0].text, 'List files in src/');
  assert.equal(ir.turns[1].role, 'assistant');
  assert.match(ir.turns[1].text, /Found 3 files/);
  assert.deepEqual(ir.turns[1].toolNarrations, ['Called glob', 'glob finished (ok)']);
});

test('readChat throws a clear error for an unknown chat id', () => {
  assert.throws(() => withFakeHome(() => readChat('does-not-exist')), /No Copilot CLI chat found/);
});

module.exports = { withFakeHome, FIXTURE_ROOT };
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/platforms/copilot-cli.test.js`
Expected: FAIL — `Cannot find module '../../platforms/copilot-cli/reader'`

- [ ] **Step 6: Write platforms/copilot-cli/reader.js**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function sessionRoot() {
  return path.join(os.homedir(), '.copilot', 'session-state');
}

function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function listChats() {
  const root = sessionRoot();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const workspacePath = path.join(root, entry.name, 'workspace.yaml');
      if (!fs.existsSync(workspacePath)) return null;
      const yaml = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf8'));
      return {
        id: yaml.id || entry.name,
        title: yaml.name || '(untitled)',
        updatedAt: yaml.updated_at || null,
        cwd: yaml.cwd || null,
      };
    })
    .filter(Boolean);
}

function readChat(id) {
  const chatDir = path.join(sessionRoot(), id);
  const workspacePath = path.join(chatDir, 'workspace.yaml');
  const eventsPath = path.join(chatDir, 'events.jsonl');

  if (!fs.existsSync(workspacePath) || !fs.existsSync(eventsPath)) {
    throw new Error(`No Copilot CLI chat found with id "${id}" in ${chatDir}`);
  }

  const yaml = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf8'));
  const lines = fs.readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean);

  let model = null;
  let sessionFormatVersion = null;
  const toolNamesByCallId = new Map();
  const turnBuckets = new Map();
  const turnOrder = [];
  const finishedTurns = [];

  function bucketFor(turnId) {
    if (!turnBuckets.has(turnId)) {
      turnBuckets.set(turnId, { textParts: [], toolNarrations: [] });
      turnOrder.push(turnId);
    }
    return turnBuckets.get(turnId);
  }

  for (const line of lines) {
    const event = JSON.parse(line);

    if (event.type === 'session.start') {
      sessionFormatVersion = event.data.version;
    } else if (event.type === 'session.model_change') {
      model = event.data.newModel;
    } else if (event.type === 'user.message') {
      finishedTurns.push({ role: 'user', text: event.data.content });
    } else if (event.type === 'assistant.message') {
      if (!model) model = event.data.model;
      const bucket = bucketFor(event.data.turnId);
      if (event.data.content) bucket.textParts.push(event.data.content);
    } else if (event.type === 'tool.execution_start') {
      toolNamesByCallId.set(event.data.toolCallId, event.data.toolName);
      const bucket = bucketFor(event.data.turnId);
      bucket.toolNarrations.push(`Called ${event.data.toolName}`);
    } else if (event.type === 'tool.execution_complete') {
      const toolName = toolNamesByCallId.get(event.data.toolCallId) || 'tool';
      const bucket = bucketFor(event.data.turnId);
      const outcome =
        event.data.success === false ? `failed: ${(event.data.error && event.data.error.message) || 'unknown error'}` : 'ok';
      bucket.toolNarrations.push(`${toolName} finished (${outcome})`);
    } else if (event.type === 'assistant.turn_end') {
      const bucket = turnBuckets.get(event.data.turnId);
      if (bucket) {
        finishedTurns.push({
          role: 'assistant',
          text: bucket.textParts.join('\n\n'),
          toolNarrations: bucket.toolNarrations,
        });
        turnBuckets.delete(event.data.turnId);
      }
    }
  }

  for (const turnId of turnOrder) {
    const bucket = turnBuckets.get(turnId);
    if (bucket) {
      finishedTurns.push({
        role: 'assistant',
        text: bucket.textParts.join('\n\n'),
        toolNarrations: bucket.toolNarrations,
      });
    }
  }

  return {
    sourcePlatform: 'copilot-cli',
    sourceChatId: id,
    title: yaml.name || '(untitled)',
    cwd: yaml.cwd || '',
    gitBranch: yaml.branch || undefined,
    model: model || undefined,
    createdAt: yaml.created_at || new Date(0).toISOString(),
    updatedAt: yaml.updated_at || new Date(0).toISOString(),
    turns: finishedTurns.filter((t) => t.text && t.text.trim().length > 0),
    _sessionFormatVersion: sessionFormatVersion,
  };
}

module.exports = { listChats, readChat, sessionRoot, parseWorkspaceYaml };
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/platforms/copilot-cli.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add test/fixtures/copilot-cli platforms/copilot-cli/reader.js platforms/copilot-cli/supported-versions.js test/platforms/copilot-cli.test.js
git commit -m "feat: add Copilot CLI reader with condensed tool narration"
```

---

### Task 6: Copilot CLI platform — writer

**Files:**
- Create: `D:\hopchat\platforms\copilot-cli\writer.js`
- Modify: `D:\hopchat\test\platforms\copilot-cli.test.js` (append writer tests)

- [ ] **Step 1: Write the failing test — append to test/platforms/copilot-cli.test.js**

```js
const fs = require('node:fs');
const path = require('node:path');
const { writeChat } = require('../../platforms/copilot-cli/writer');

test('writeChat produces a chat that readChat can parse back with the same turns', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-1',
    title: 'Round trip test',
    cwd: 'C:\\repo',
    gitBranch: 'main',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there', toolNarrations: ['Called glob'] },
    ],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      assert.equal(result.resumeCommand, `copilot --resume=${newChatId}`);
      const readBack = readChat(newChatId);
      assert.equal(readBack.turns.length, 2);
      assert.equal(readBack.turns[0].text, 'Hello');
      assert.match(readBack.turns[1].text, /Hi there/);
      assert.match(readBack.turns[1].text, /Called glob/);
    });
  } finally {
    if (newChatId) {
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', newChatId), { recursive: true, force: true });
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/platforms/copilot-cli.test.js`
Expected: FAIL — `Cannot find module '../../platforms/copilot-cli/writer'`

- [ ] **Step 3: Write platforms/copilot-cli/writer.js**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sessionRoot } = require('./reader');

function toWorkspaceYaml(ir, newId) {
  const lines = [
    `id: ${newId}`,
    `cwd: ${ir.cwd}`,
    `git_root: ${ir.cwd}`,
    `branch: ${ir.gitBranch || ''}`,
    `client_name: hopchat`,
    `name: ${ir.title}`,
    `user_named: false`,
    `summary_count: 0`,
    `created_at: ${ir.createdAt}`,
    `updated_at: ${ir.updatedAt}`,
    '',
  ];
  return lines.join('\n');
}

function turnToEvents(turn, turnId) {
  const events = [];
  if (turn.role === 'user') {
    events.push({
      type: 'user.message',
      data: { content: turn.text },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
  } else {
    let content = turn.text;
    if (turn.toolNarrations && turn.toolNarrations.length > 0) {
      content += `\n\n_(migrated tool activity: ${turn.toolNarrations.join('; ')})_`;
    }
    events.push({
      type: 'assistant.message',
      data: { messageId: crypto.randomUUID(), content, turnId: String(turnId) },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
    events.push({
      type: 'assistant.turn_end',
      data: { turnId: String(turnId) },
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      parentId: null,
    });
  }
  return events;
}

function writeChat(ir) {
  const newId = crypto.randomUUID();
  const chatDir = path.join(sessionRoot(), newId);

  try {
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(path.join(chatDir, 'workspace.yaml'), toWorkspaceYaml(ir, newId));

    const events = [
      {
        type: 'session.start',
        data: {
          sessionId: newId,
          version: 1,
          producer: 'hopchat',
          copilotVersion: 'imported',
          startTime: new Date().toISOString(),
        },
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parentId: null,
      },
    ];

    let turnId = 0;
    for (const turn of ir.turns) {
      events.push(...turnToEvents(turn, turnId));
      if (turn.role === 'assistant') turnId += 1;
    }

    const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(path.join(chatDir, 'events.jsonl'), jsonl);

    return { newChatId: newId, resumeCommand: `copilot --resume=${newId}` };
  } catch (err) {
    fs.rmSync(chatDir, { recursive: true, force: true });
    throw err;
  }
}

module.exports = { writeChat };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/platforms/copilot-cli.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add platforms/copilot-cli/writer.js test/platforms/copilot-cli.test.js
git commit -m "feat: add Copilot CLI writer"
```

---

### Task 7: Claude Code platform — fixtures and reader

**Files:**
- Create: `D:\hopchat\test\fixtures\claude-code\.claude\projects\sample-project\fixture-session-001.jsonl`
- Create: `D:\hopchat\platforms\claude-code\reader.js`
- Create: `D:\hopchat\platforms\claude-code\supported-versions.js`
- Test: `D:\hopchat\test\platforms\claude-code.test.js`

- [ ] **Step 1: Write the fixture session file**

```
{"type":"user","message":{"role":"user","content":"List files in src/"},"uuid":"u1","timestamp":"2026-01-01T00:00:00.000Z","sessionId":"fixture-session-001","cwd":"C:\\repo\\sample-project","gitBranch":"main","version":"2.1.200"}
{"type":"assistant","message":{"model":"claude-sonnet-4.6","id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Let me check."},{"type":"tool_use","name":"glob","input":{"pattern":"src/**"}}]},"uuid":"a1","timestamp":"2026-01-01T00:00:01.000Z","sessionId":"fixture-session-001","cwd":"C:\\repo\\sample-project","gitBranch":"main","version":"2.1.200"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"index.js\napp.js\nutils.js"}]},"uuid":"u2","timestamp":"2026-01-01T00:00:02.000Z","sessionId":"fixture-session-001","cwd":"C:\\repo\\sample-project","gitBranch":"main","version":"2.1.200"}
{"type":"assistant","message":{"model":"claude-sonnet-4.6","id":"msg_2","type":"message","role":"assistant","content":[{"type":"text","text":"Found 3 files: index.js, app.js, utils.js."}]},"uuid":"a2","timestamp":"2026-01-01T00:00:03.000Z","sessionId":"fixture-session-001","cwd":"C:\\repo\\sample-project","gitBranch":"main","version":"2.1.200"}
```

- [ ] **Step 2: Write supported-versions.js**

```js
'use strict';

module.exports = {
  command: 'claude',
  range: ['2.1.150', '2.1.220'],
  sessionFormatVersion: 1,
};
```

- [ ] **Step 3: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { listChats, readChat, sanitizeCwdToProjectDir } = require('../../platforms/claude-code/reader');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'claude-code');

function withFakeHome(fn) {
  const original = os.homedir;
  os.homedir = () => FIXTURE_ROOT;
  try {
    return fn();
  } finally {
    os.homedir = original;
  }
}

test('sanitizeCwdToProjectDir replaces non-alphanumerics with dashes', () => {
  assert.equal(
    sanitizeCwdToProjectDir('C:\\Users\\25070102\\Desktop\\IFP\\mybot_frontend'),
    'C--Users-25070102-Desktop-IFP-mybot-frontend'
  );
});

test('listChats finds the fixture session', () => {
  const chats = withFakeHome(() => listChats());
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, 'fixture-session-001');
});

test('readChat condenses tool_use into narrations and skips tool_result-only turns', () => {
  const ir = withFakeHome(() => readChat('fixture-session-001'));
  assert.equal(ir.turns.length, 3);
  assert.equal(ir.turns[0].text, 'List files in src/');
  assert.equal(ir.turns[1].role, 'assistant');
  assert.deepEqual(ir.turns[1].toolNarrations, ['Called glob']);
  assert.equal(ir.turns[2].text, 'Found 3 files: index.js, app.js, utils.js.');
  assert.equal(ir.model, 'claude-sonnet-4.6');
  assert.equal(ir.gitBranch, 'main');
});

test('readChat throws a clear error for an unknown session id', () => {
  assert.throws(() => withFakeHome(() => readChat('does-not-exist')), /No Claude Code chat found/);
});

module.exports = { withFakeHome, FIXTURE_ROOT };
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test test/platforms/claude-code.test.js`
Expected: FAIL — `Cannot find module '../../platforms/claude-code/reader'`

- [ ] **Step 5: Write platforms/claude-code/reader.js**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

function extractToolNarrations(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block && block.type === 'tool_use')
    .map((block) => `Called ${block.name}`);
}

function isToolResultOnly(content) {
  return Array.isArray(content) && content.length > 0 && content.every((block) => block && block.type === 'tool_result');
}

function findSessionFile(sessionId) {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return null;
  for (const projectDir of fs.readdirSync(root)) {
    const candidate = path.join(root, projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseSessionFile(filePath, sessionId) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);

  const turns = [];
  let cwd = '';
  let gitBranch;
  let model;
  let createdAt = null;
  let updatedAt = null;
  let cliVersion;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.timestamp) {
      if (!createdAt) createdAt = entry.timestamp;
      updatedAt = entry.timestamp;
    }
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;
    if (entry.version && !cliVersion) cliVersion = entry.version;

    if (entry.type === 'user' && entry.message) {
      if (entry.isMeta) continue;
      if (isToolResultOnly(entry.message.content)) continue;
      const text = extractText(entry.message.content);
      if (text.trim()) turns.push({ role: 'user', text });
    } else if (entry.type === 'assistant' && entry.message) {
      if (!model && entry.message.model) model = entry.message.model;
      const text = extractText(entry.message.content);
      const toolNarrations = extractToolNarrations(entry.message.content);
      if (text.trim() || toolNarrations.length > 0) {
        const turn = { role: 'assistant', text: text.trim() || '(tool activity only)' };
        if (toolNarrations.length > 0) turn.toolNarrations = toolNarrations;
        turns.push(turn);
      }
    }
  }

  const firstUserTurn = turns.find((t) => t.role === 'user');
  const title = firstUserTurn ? firstUserTurn.text.slice(0, 60) : '(untitled)';

  return {
    sourcePlatform: 'claude-code',
    sourceChatId: sessionId,
    title,
    cwd,
    gitBranch,
    model,
    createdAt: createdAt || new Date(0).toISOString(),
    updatedAt: updatedAt || new Date(0).toISOString(),
    turns,
    _cliVersion: cliVersion,
  };
}

function listChats() {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return [];

  const results = [];
  for (const projectDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!projectDir.isDirectory()) continue;
    const projectPath = path.join(root, projectDir.name);
    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(projectPath, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const sessionId = file.slice(0, -'.jsonl'.length);
      const ir = parseSessionFile(filePath, sessionId);
      results.push({ id: sessionId, title: ir.title, updatedAt: ir.updatedAt, cwd: ir.cwd });
    }
  }
  return results;
}

function readChat(sessionId) {
  const filePath = findSessionFile(sessionId);
  if (!filePath) {
    throw new Error(`No Claude Code chat found with session id "${sessionId}" under ${projectsRoot()}`);
  }
  return parseSessionFile(filePath, sessionId);
}

function sanitizeCwdToProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

module.exports = { listChats, readChat, projectsRoot, sanitizeCwdToProjectDir, parseSessionFile };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/platforms/claude-code.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add test/fixtures/claude-code platforms/claude-code/reader.js platforms/claude-code/supported-versions.js test/platforms/claude-code.test.js
git commit -m "feat: add Claude Code reader with condensed tool narration"
```

---

### Task 8: Claude Code platform — writer

**Files:**
- Create: `D:\hopchat\platforms\claude-code\writer.js`
- Modify: `D:\hopchat\test\platforms\claude-code.test.js` (append writer test)

- [ ] **Step 1: Write the failing test — append to test/platforms/claude-code.test.js**

```js
const fs = require('node:fs');
const { writeChat } = require('../../platforms/claude-code/writer');

test('writeChat writes a session file readChat can parse back', () => {
  const ir = {
    sourcePlatform: 'copilot-cli',
    sourceChatId: 'orig-1',
    title: 'Round trip',
    cwd: 'C:\\repo\\other-project',
    gitBranch: 'dev',
    model: 'claude-sonnet-4.6',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there', toolNarrations: ['Called grep'] },
    ],
  };

  let newChatId;
  try {
    withFakeHome(() => {
      const result = writeChat(ir);
      newChatId = result.newChatId;
      assert.equal(result.resumeCommand, `claude --resume ${newChatId}`);
      const readBack = readChat(newChatId);
      assert.equal(readBack.turns[0].text, 'Hello');
      assert.match(readBack.turns[1].text, /Hi there/);
      assert.match(readBack.turns[1].text, /Called grep/);
    });
  } finally {
    const projectDir = path.join(FIXTURE_ROOT, '.claude', 'projects', sanitizeCwdToProjectDir(ir.cwd));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/platforms/claude-code.test.js`
Expected: FAIL — `Cannot find module '../../platforms/claude-code/writer'`

- [ ] **Step 3: Write platforms/claude-code/writer.js**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectsRoot, sanitizeCwdToProjectDir } = require('./reader');

function turnToEntry(turn, sessionId, cwd, gitBranch, model) {
  const timestamp = new Date().toISOString();
  const uuid = crypto.randomUUID();

  if (turn.role === 'user') {
    return {
      parentUuid: null,
      isSidechain: false,
      type: 'user',
      message: { role: 'user', content: turn.text },
      uuid,
      timestamp,
      sessionId,
      cwd,
      gitBranch,
      version: 'hopchat-import',
    };
  }

  let text = turn.text;
  if (turn.toolNarrations && turn.toolNarrations.length > 0) {
    text += `\n\n_(migrated tool activity: ${turn.toolNarrations.join('; ')})_`;
  }

  return {
    parentUuid: null,
    isSidechain: false,
    type: 'assistant',
    message: {
      model: model || 'imported',
      id: `msg_${crypto.randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    uuid,
    timestamp,
    sessionId,
    cwd,
    gitBranch,
    version: 'hopchat-import',
  };
}

function writeChat(ir) {
  const sessionId = crypto.randomUUID();
  const projectDirName = sanitizeCwdToProjectDir(ir.cwd);
  const projectDir = path.join(projectsRoot(), projectDirName);
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);

  try {
    fs.mkdirSync(projectDir, { recursive: true });

    const entries = ir.turns.map((turn) => turnToEntry(turn, sessionId, ir.cwd, ir.gitBranch, ir.model));
    const jsonl = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(filePath, jsonl);

    return { newChatId: sessionId, resumeCommand: `claude --resume ${sessionId}` };
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    throw err;
  }
}

module.exports = { writeChat };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/platforms/claude-code.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add platforms/claude-code/writer.js test/platforms/claude-code.test.js
git commit -m "feat: add Claude Code writer"
```

---

### Task 9: Core migrate orchestrator

**Files:**
- Create: `D:\hopchat\core\migrate.js`
- Test: `D:\hopchat\test\core\migrate.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { registerPlatform, clearRegistry } = require('../../core/registry');
const { migrate } = require('../../core/migrate');

beforeEach(() => clearRegistry());

function validIR(overrides = {}) {
  return {
    sourcePlatform: 'fake-source',
    sourceChatId: 'chat-1',
    title: 'Test',
    cwd: 'C:\\repo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hi' }],
    ...overrides,
  };
}

test('migrate reads from source and writes to target, returning the writer result', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: (id) => validIR({ sourceChatId: id }) },
    writer: { writeChat: () => { throw new Error('should not write to source'); } },
  });
  let writtenIR = null;
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('should not read target'); } },
    writer: {
      writeChat: (ir) => {
        writtenIR = ir;
        return { newChatId: 'new-1', resumeCommand: 'fake --resume new-1' };
      },
    },
  });

  const result = migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' });

  assert.equal(result.newChatId, 'new-1');
  assert.equal(result.resumeCommand, 'fake --resume new-1');
  assert.equal(writtenIR.sourceChatId, 'chat-1');
});

test('migrate throws before writing anything if the source produces invalid IR', () => {
  registerPlatform('fake-source', {
    reader: { listChats: () => [], readChat: () => ({ sourcePlatform: 'fake-source' }) },
    writer: { writeChat: () => { throw new Error('should never be called'); } },
  });
  registerPlatform('fake-target', {
    reader: { listChats: () => [], readChat: () => { throw new Error('unused'); } },
    writer: { writeChat: () => { throw new Error('should never be called'); } },
  });

  assert.throws(
    () => migrate({ from: 'fake-source', to: 'fake-target', chatId: 'chat-1' }),
    /Invalid IR/
  );
});

test('migrate throws a clear error for an unregistered platform', () => {
  assert.throws(() => migrate({ from: 'nope', to: 'also-nope', chatId: 'x' }), /Unknown platform "nope"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/core/migrate.test.js`
Expected: FAIL — `Cannot find module '../../core/migrate'`

- [ ] **Step 3: Write core/migrate.js**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/core/migrate.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add core/migrate.js test/core/migrate.test.js
git commit -m "feat: add migrate orchestrator"
```

---

### Task 10: Contract tests across both platforms

**Files:**
- Create: `D:\hopchat\core\contract-tests.js`
- Create: `D:\hopchat\test\contract.test.js`

- [ ] **Step 1: Write core/contract-tests.js**

```js
'use strict';

const assert = require('node:assert/strict');
const { assertValidIR } = require('./ir-schema');

function runContractTests(t, { name, reader, writer, existingChatId, sampleIRForWrite, cleanupWrite }) {
  t.test(`${name} contract: listChats returns an array without throwing`, () => {
    const chats = reader.listChats();
    assert.ok(Array.isArray(chats));
  });

  t.test(`${name} contract: readChat returns IR that passes schema validation`, () => {
    const ir = reader.readChat(existingChatId);
    assertValidIR(ir);
  });

  t.test(`${name} contract: writeChat returns newChatId and resumeCommand`, () => {
    const result = writer.writeChat(sampleIRForWrite);
    try {
      assert.equal(typeof result.newChatId, 'string');
      assert.ok(result.newChatId.length > 0);
      assert.equal(typeof result.resumeCommand, 'string');
      assert.ok(result.resumeCommand.length > 0);
    } finally {
      if (cleanupWrite) cleanupWrite(result);
    }
  });
}

module.exports = { runContractTests };
```

This is not TDD'd in isolation — it's a test helper consumed immediately by Step 2, which proves it works.

- [ ] **Step 2: Write test/contract.test.js**

```js
'use strict';

const { test } = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { runContractTests } = require('../core/contract-tests');
const copilotReader = require('../platforms/copilot-cli/reader');
const copilotWriter = require('../platforms/copilot-cli/writer');
const claudeReader = require('../platforms/claude-code/reader');
const claudeWriter = require('../platforms/claude-code/writer');

const COPILOT_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'copilot-cli');
const CLAUDE_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'claude-code');

function sampleIR(sourcePlatform, cwd) {
  return {
    sourcePlatform,
    sourceChatId: 'contract-test',
    title: 'Contract test chat',
    cwd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    turns: [{ role: 'user', text: 'hello' }],
  };
}

test('copilot-cli platform contract', async (t) => {
  const original = os.homedir;
  os.homedir = () => COPILOT_FIXTURE_ROOT;
  try {
    await runContractTests(t, {
      name: 'copilot-cli',
      reader: copilotReader,
      writer: copilotWriter,
      existingChatId: 'fixture-chat-001',
      sampleIRForWrite: sampleIR('copilot-cli', 'C:\\repo\\contract-test'),
      cleanupWrite: (result) =>
        fs.rmSync(path.join(COPILOT_FIXTURE_ROOT, '.copilot', 'session-state', result.newChatId), {
          recursive: true,
          force: true,
        }),
    });
  } finally {
    os.homedir = original;
  }
});

test('claude-code platform contract', async (t) => {
  const original = os.homedir;
  os.homedir = () => CLAUDE_FIXTURE_ROOT;
  const cwd = 'C:\\repo\\contract-test';
  try {
    await runContractTests(t, {
      name: 'claude-code',
      reader: claudeReader,
      writer: claudeWriter,
      existingChatId: 'fixture-session-001',
      sampleIRForWrite: sampleIR('claude-code', cwd),
      cleanupWrite: () =>
        fs.rmSync(path.join(CLAUDE_FIXTURE_ROOT, '.claude', 'projects', claudeReader.sanitizeCwdToProjectDir(cwd)), {
          recursive: true,
          force: true,
        }),
    });
  } finally {
    os.homedir = original;
  }
});
```

- [ ] **Step 3: Run the contract tests**

Run: `node --test test/contract.test.js`
Expected: PASS (6 subtests total — 3 per platform)

- [ ] **Step 4: Commit**

```bash
git add core/contract-tests.js test/contract.test.js
git commit -m "test: add shared platform contract tests"
```

---

### Task 11: Platform template for future contributors

**Files:**
- Create: `D:\hopchat\platforms\TEMPLATE\reader.js`
- Create: `D:\hopchat\platforms\TEMPLATE\writer.js`

- [ ] **Step 1: Write platforms/TEMPLATE/reader.js**

```js
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
```

- [ ] **Step 2: Write platforms/TEMPLATE/writer.js**

```js
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
```

- [ ] **Step 3: Commit**

```bash
git add platforms/TEMPLATE
git commit -m "docs: add platform template for future contributors"
```

---

### Task 12: CLI commands

**Files:**
- Modify: `D:\hopchat\cli.js` (replace stub from Task 1)
- Test: `D:\hopchat\test\cli.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlags, printTableRows } = require('../cli');

test('parseFlags splits --key value pairs from positional args', () => {
  const { flags, positional } = parseFlags(['--from', 'copilot-cli', '--to', 'claude-code', 'chat-123']);
  assert.deepEqual(flags, { from: 'copilot-cli', to: 'claude-code' });
  assert.deepEqual(positional, ['chat-123']);
});

test('parseFlags handles no flags at all', () => {
  const { flags, positional } = parseFlags(['copilot-cli']);
  assert.deepEqual(flags, {});
  assert.deepEqual(positional, ['copilot-cli']);
});

test('printTableRows renders a header, separator, and one line per row', () => {
  const lines = printTableRows([{ id: 'a1', title: 'Chat One' }], ['id', 'title']);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /id\s+title/);
  assert.match(lines[2], /a1\s+Chat One/);
});

test('printTableRows returns a single line for an empty row set', () => {
  const lines = printTableRows([], ['id', 'title']);
  assert.deepEqual(lines, ['(no chats found)']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL — `parseFlags is not a function` (current cli.js only exports `run`)

- [ ] **Step 3: Replace cli.js**

```js
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
  return [formatRow(columns), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map((row) => formatRow(columns.map((c) => row[c] ?? '')))];
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cli.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Manually verify the platforms command end to end**

Run: `node bin/hopchat.js platforms`
Expected output:
```
copilot-cli
claude-code
```

- [ ] **Step 6: Commit**

```bash
git add cli.js test/cli.test.js
git commit -m "feat: implement list, migrate, and platforms CLI commands"
```

---

### Task 13: End-to-end round-trip test

**Files:**
- Create: `D:\hopchat\test\e2e\round-trip.test.js`

- [ ] **Step 1: Write test/e2e/round-trip.test.js**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { registerPlatform, clearRegistry } = require('../../core/registry');
const { migrate } = require('../../core/migrate');
const copilotReader = require('../../platforms/copilot-cli/reader');
const copilotWriter = require('../../platforms/copilot-cli/writer');
const claudeReader = require('../../platforms/claude-code/reader');
const claudeWriter = require('../../platforms/claude-code/writer');

const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'copilot-cli');

test('round trip: copilot-cli -> claude-code -> copilot-cli keeps conversation content readable', () => {
  clearRegistry();
  registerPlatform('copilot-cli', { reader: copilotReader, writer: copilotWriter });
  registerPlatform('claude-code', { reader: claudeReader, writer: claudeWriter });

  const originalHomedir = os.homedir;
  os.homedir = () => FIXTURE_ROOT;

  const cleanupTasks = [];
  try {
    const toClaudeCode = migrate({ from: 'copilot-cli', to: 'claude-code', chatId: 'fixture-chat-001' });
    cleanupTasks.push(() =>
      fs.rmSync(
        path.join(FIXTURE_ROOT, '.claude', 'projects', claudeReader.sanitizeCwdToProjectDir('C:\\repo\\sample-project')),
        { recursive: true, force: true }
      )
    );

    const backToCopilot = migrate({ from: 'claude-code', to: 'copilot-cli', chatId: toClaudeCode.newChatId });
    cleanupTasks.push(() =>
      fs.rmSync(path.join(FIXTURE_ROOT, '.copilot', 'session-state', backToCopilot.newChatId), {
        recursive: true,
        force: true,
      })
    );

    const finalIR = copilotReader.readChat(backToCopilot.newChatId);

    assert.equal(finalIR.turns.length, 2);
    assert.equal(finalIR.turns[0].role, 'user');
    assert.equal(finalIR.turns[0].text, 'List files in src/');
    assert.equal(finalIR.turns[1].role, 'assistant');
    assert.match(finalIR.turns[1].text, /Found 3 files: index\.js, app\.js, utils\.js\./);
    assert.match(finalIR.turns[1].text, /Called glob/);
  } finally {
    os.homedir = originalHomedir;
    clearRegistry();
    for (const cleanup of cleanupTasks) cleanup();
  }
});
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file under `test/` passes, including this new round-trip test.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/round-trip.test.js
git commit -m "test: add copilot-cli <-> claude-code round-trip e2e test"
```

---

### Task 14: README and manual live smoke test

**Files:**
- Create: `D:\hopchat\README.md`

- [ ] **Step 1: Write README.md**

```markdown
# hopchat

Migrate AI CLI chat sessions between tools — start a task in one CLI, continue it natively in another.

## Supported platforms (v1)

- GitHub Copilot CLI
- Claude Code

Both directions. More platforms can be added by dropping a `reader.js`/`writer.js` pair into `platforms/` (see `platforms/TEMPLATE/`).

## Install

npm install -g hopchat

## Usage

    hopchat list copilot-cli
    hopchat list claude-code
    hopchat migrate --from copilot-cli --to claude-code <chat-id>
    hopchat platforms

Migration is **condensed fidelity**: user/assistant text is preserved exactly; tool calls (file edits, shell commands, sub-agent runs) are folded into the assistant's text as short narrations (e.g. "Called grep") rather than replayed as structured tool calls. This keeps the migrated chat loadable by the target platform's own resume command without needing to map every tool between platforms.

## How it works

Both Copilot CLI and Claude Code store sessions as local files in undocumented formats. `hopchat` reads a source platform's session into a common intermediate representation, then writes that IR into the target platform's own file format so its native resume command (`copilot --resume=<id>`, `claude --resume <id>`) picks it up.

Because the formats are undocumented and can change between CLI releases, `hopchat` checks the installed CLI version against a known-good range before migrating and warns if it can't verify compatibility.

## Development

    npm test

Tests run against fixture session files under `test/fixtures/` — no live CLI install required for automated tests.
```

- [ ] **Step 2: Manual live smoke test (not automated — do this by hand once)**

Run: `node bin/hopchat.js list copilot-cli` against a *real* Copilot CLI chat on your machine, then:
`node bin/hopchat.js migrate --from copilot-cli --to claude-code <real-chat-id>`
Then run the printed `claude --resume <id>` command and confirm Claude Code loads the migrated chat with readable turns. If Claude Code rejects the file or shows a garbled turn, capture the exact error, compare against the real `.jsonl` schema, and adjust `platforms/claude-code/writer.js`'s emitted fields (see "Real format facts" at the top of this plan) — this is the one part of the system a fixture can't fully prove, since it exercises the real closed-source parser.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add hopchat README"
```

---

## Self-review notes

- **Spec coverage**: architecture (Task 1, 3), IR schema (Task 2), both platform readers/writers (Tasks 5–8), version-drift check (Task 4, wired into supported-versions.js data files), CLI commands (Task 12), all four testing tiers from the spec — unit (Tasks 2–9), contract (Task 10), round-trip (Task 13), manual live smoke (Task 14) — naming and npm packaging (Tasks 1, 14) are all covered.
- **Type consistency checked**: `sessionRoot()`/`projectsRoot()`/`sanitizeCwdToProjectDir()`/`parseWorkspaceYaml()`/`parseSessionFile()` are defined once per platform and imported by name consistently across reader/writer/test files. `turnId` is consistently a string end-to-end in the Copilot plugin, matching the real format.
- **Non-destructive writes**: both writers create a brand-new id/directory and delete their own partial output in a `catch` block on failure — no path exists for a failed write to corrupt an existing session.
