'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render } = require('ink-testing-library');
const Banner = require('../../ink/Banner');

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('Banner renders the HOPCHAT wordmark and a tagline', () => {
  const { lastFrame } = render(React.createElement(Banner, { tagline: 'Ready to hop a chat between tools?', pose: 'idle' }));
  const frame = strip(lastFrame());
  assert.match(frame, /█+/);
  assert.match(frame, /Ready to hop a chat between tools\?/);
});

test('Banner renders without throwing for the happy pose', () => {
  const { lastFrame } = render(React.createElement(Banner, { tagline: 'See you next hop!', pose: 'happy' }));
  const frame = strip(lastFrame());
  assert.match(frame, /See you next hop!/);
  assert.match(frame, /█+/);
});
