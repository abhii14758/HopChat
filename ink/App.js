'use strict';

const React = require('react');
const { useState } = React;
const { Box, Text, useApp, useInput } = require('ink');

const Banner = require('./Banner');
const MiniHeader = require('./MiniHeader');
const SelectList = require('./SelectList');
const ConfirmPrompt = require('./ConfirmPrompt');
const SuccessPanel = require('./SuccessPanel');
const { getPlatform, listPlatforms } = require('../core/registry');
const { migrate } = require('../core/migrate');

const e = React.createElement;

const SCREENS = {
  GREETING: 'greeting',
  SELECT_SOURCE: 'select-source',
  SELECT_DESTINATION: 'select-destination',
  BROWSE_CHATS: 'browse-chats',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
  EXIT: 'exit',
};

function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// The full interactive flow. Every screen reuses the real platform registry
// and migrate() from core/ -- this component only owns UI state (which
// screen, what's selected), never chat-reading/writing logic.
function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState(SCREENS.GREETING);
  const [fromPlatform, setFromPlatform] = useState(null);
  const [toPlatform, setToPlatform] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Global Esc/q handler: from any screen, jump to exit. Individual screens
  // (greeting, success) register their own narrower Enter handler via the
  // helper components below.
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (screen !== SCREENS.EXIT) setScreen(SCREENS.EXIT);
    }
  });

  if (screen === SCREENS.EXIT) {
    setTimeout(() => exit(), 0);
    return e(
      Box,
      { flexDirection: 'column' },
      e(Banner, { tagline: 'See you next hop!', pose: 'happy' }),
      e(Text, { dimColor: true }, 'Session ended.')
    );
  }

  if (screen === SCREENS.GREETING) {
    return e(GreetingScreen, { onContinue: () => setScreen(SCREENS.SELECT_SOURCE) });
  }

  if (screen === SCREENS.SELECT_SOURCE) {
    const items = listPlatforms().map((name) => ({ id: name, label: name }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: "Where's this chat coming from?" }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setFromPlatform(item.id);
          setScreen(SCREENS.SELECT_DESTINATION);
        },
      })
    );
  }

  if (screen === SCREENS.SELECT_DESTINATION) {
    const items = listPlatforms()
      .filter((name) => name !== fromPlatform)
      .map((name) => ({ id: name, label: name }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: `${fromPlatform}, got it! Where's it hopping to?` }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setToPlatform(item.id);
          setScreen(SCREENS.BROWSE_CHATS);
        },
      })
    );
  }

  if (screen === SCREENS.BROWSE_CHATS) {
    const { reader } = getPlatform(fromPlatform);
    const chats = reader.listChats();
    const items = chats.map((chat) => ({
      id: chat.id,
      label: chat.title || '(untitled)',
      subtitle: `${chat.cwd} · ${relativeTime(chat.updatedAt)}`,
    }));
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'idle', message: 'Pick a chat to hop!' }),
      e(SelectList, {
        items,
        filterable: true,
        onSelect: (item) => {
          setSelectedChat(item.id);
          setScreen(SCREENS.CONFIRM);
        },
      })
    );
  }

  if (screen === SCREENS.CONFIRM) {
    const { reader } = getPlatform(fromPlatform);
    const ir = reader.readChat(selectedChat);
    return e(ConfirmPrompt, {
      title: ir.title,
      turnCount: ir.turns.length,
      model: ir.model || '(unknown)',
      cwd: ir.cwd,
      from: fromPlatform,
      to: toPlatform,
      onConfirm: () => {
        const result = migrate({ from: fromPlatform, to: toPlatform, chatId: selectedChat });
        setLastResult({ title: ir.title, cwd: ir.cwd, ...result });
        setScreen(SCREENS.SUCCESS);
      },
      onCancel: () => setScreen(SCREENS.BROWSE_CHATS),
    });
  }

  if (screen === SCREENS.SUCCESS) {
    return e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, { pose: 'happy' }),
      e(SuccessPanel, {
        title: lastResult.title,
        from: fromPlatform,
        to: toPlatform,
        cwd: toPlatform === 'claude-code' ? lastResult.cwd : null,
        resumeCommand: lastResult.resumeCommand,
      }),
      e(Box, { marginTop: 1 }, e(Text, { dimColor: true }, 'Press Enter to pick another chat, Esc to quit.')),
      e(ReturnToListOnEnter, { onReturn: () => setScreen(SCREENS.BROWSE_CHATS) })
    );
  }

  return null;
}

function ReturnToListOnEnter({ onReturn }) {
  useInput((input, key) => {
    if (key.return) onReturn();
  });
  return null;
}

function GreetingScreen({ onContinue }) {
  useInput((input, key) => {
    if (key.return) onContinue();
  });
  return e(Banner, { tagline: 'Ready to hop a chat between tools?', pose: 'idle' });
}

module.exports = App;
