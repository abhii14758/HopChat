'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const MiniHeader = require('../../ink/MiniHeader');

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('MiniHeader renders the mascot icon and the plain "hopchat" wordmark', () => {
  const { lastFrame } = render(React.createElement(MiniHeader, { pose: 'idle', t: 0 }));
  const frame = strip(lastFrame());
  assert.match(frame, /█+/);
  assert.match(frame, /hopchat/i);
});

test('MiniHeader renders the given step message below the icon row when provided', () => {
  const { lastFrame } = render(React.createElement(MiniHeader, { pose: 'idle', t: 0, message: "Where's this chat coming from?" }));
  const frame = strip(lastFrame());
  assert.match(frame, /Where's this chat coming from\?/);
});
