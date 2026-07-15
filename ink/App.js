'use strict';

const React = require('react');
const { useState, useEffect } = React;
const { Box, Text, useApp, useInput } = require('ink');

const Banner = require('./Banner');
const MiniHeader = require('./MiniHeader');
const SelectList = require('./SelectList');
const ConfirmPrompt = require('./ConfirmPrompt');
const SuccessPanel = require('./SuccessPanel');
const { getPlatform, listPlatforms } = require('../core/registry');
const { migrate } = require('../core/migrate');
const { warnIfUnsupported } = require('../cli');

const e = React.createElement;

const SCREENS = {
  GREETING: 'greeting',
  SELECT_SOURCE: 'select-source',
  SELECT_DESTINATION: 'select-destination',
  BROWSE_CHATS: 'browse-chats',
  CONFIRM: 'confirm',
  HOPPING: 'hopping',
  SUCCESS: 'success',
  ERROR: 'error',
  EXIT: 'exit',
};

const TOTAL_STEPS = 4; // select source, select destination, browse chats, confirm

function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// Drives the pixel mascot's idle blink (see cli-pixel-art.js's renderMascot,
// which needs a moving `t` to ever animate at all -- passing a constant 0, as
// this file used to, left the blink permanently frozen). Disabled under
// HOPCHAT_NO_ANIMATION (the same test seam cli.js's hop animation already
// uses) so tests get a deterministic, single frozen frame instead of a live
// timer that would otherwise keep node:test's process alive past the test.
function useBlinkTimer() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (process.env.HOPCHAT_NO_ANIMATION) return undefined;
    const start = Date.now();
    const interval = setInterval(() => setT(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, []);
  return t;
}

// Brief animated interstitial between confirming and landing on the success
// screen -- without this the interactive flow jumped straight from "Migrate
// this chat?" to "Migrated!" with no transition at all, dropping the one
// visual beat ("hopping") that gives the product its name. migrate() itself
// is fast/synchronous and already ran by the time this mounts (see CONFIRM's
// onConfirm below); this only controls how long that result stays hidden
// behind the animation before SUCCESS reveals it.
const HOP_DISPLAY_MS = process.env.HOPCHAT_NO_ANIMATION ? 0 : 900;

function HoppingScreen({ onDone, from, to }) {
  useEffect(() => {
    if (HOP_DISPLAY_MS === 0) {
      onDone();
      return undefined;
    }
    const timer = setTimeout(onDone, HOP_DISPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return e(
    Box,
    { flexDirection: 'column' },
    e(MiniHeader, { pose: 'alert', t: 0, message: `Hopping from ${from} to ${to}...` })
  );
}

// The full interactive flow. Every screen reuses the real platform registry
// and migrate() from core/ -- this component only owns UI state (which
// screen, what's selected), never chat-reading/writing logic.
function App() {
  const [screen, setScreen] = useState(SCREENS.GREETING);
  const [fromPlatform, setFromPlatform] = useState(null);
  const [toPlatform, setToPlatform] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Global exit handling. Escape always exits, from anywhere -- but the bare
  // "q" shortcut is deliberately NOT treated as exit while on BROWSE_CHATS,
  // since that screen's SelectList is filterable and is simultaneously
  // listening for the same keystroke to build its search query (Ink calls
  // every mounted useInput handler for each keypress). Without this
  // exclusion, typing "q" while searching -- e.g. filtering for a chat
  // titled "quick fix" -- silently killed the whole app instead of typing a
  // letter, which broke the flow's own headline type-to-filter feature.
  useInput((input, key) => {
    if (screen === SCREENS.EXIT) return;
    if (key.escape || (input === 'q' && screen !== SCREENS.BROWSE_CHATS)) {
      setScreen(SCREENS.EXIT);
    }
  });

  const goToError = (err) => {
    setErrorMessage(err && err.message ? err.message : String(err));
    setScreen(SCREENS.ERROR);
  };

  let content;

  if (screen === SCREENS.EXIT) {
    content = e(ExitScreen);
  } else if (screen === SCREENS.GREETING) {
    content = e(GreetingScreen, { onContinue: () => setScreen(SCREENS.SELECT_SOURCE) });
  } else if (screen === SCREENS.SELECT_SOURCE) {
    const items = listPlatforms().map((name) => ({ id: name, label: name }));
    content = e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, {
        pose: 'idle',
        message: "Where's this chat coming from?",
        step: 1,
        totalSteps: TOTAL_STEPS,
        hints: '↑↓ navigate · enter select · esc quit',
      }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setFromPlatform(item.id);
          setScreen(SCREENS.SELECT_DESTINATION);
        },
      })
    );
  } else if (screen === SCREENS.SELECT_DESTINATION) {
    const items = listPlatforms()
      .filter((name) => name !== fromPlatform)
      .map((name) => ({ id: name, label: name }));
    content = e(
      Box,
      { flexDirection: 'column' },
      e(MiniHeader, {
        pose: 'idle',
        message: `${fromPlatform}, got it! Where's it hopping to?`,
        step: 2,
        totalSteps: TOTAL_STEPS,
        hints: '↑↓ navigate · enter select · esc quit',
      }),
      e(SelectList, {
        items,
        onSelect: (item) => {
          setToPlatform(item.id);
          setScreen(SCREENS.BROWSE_CHATS);
        },
      })
    );
  } else if (screen === SCREENS.BROWSE_CHATS) {
    let items = [];
    try {
      const { reader } = getPlatform(fromPlatform);
      items = reader.listChats().map((chat) => ({
        id: chat.id,
        label: chat.title || '(untitled)',
        subtitle: `${chat.cwd} · ${relativeTime(chat.updatedAt)}`,
      }));
    } catch (err) {
      content = e(ErrorScreen, { message: err.message, onBack: () => setScreen(SCREENS.SELECT_SOURCE) });
    }
    if (!content) {
      content = e(
        Box,
        { flexDirection: 'column' },
        e(MiniHeader, {
          pose: 'idle',
          message: 'Pick a chat to hop!',
          step: 3,
          totalSteps: TOTAL_STEPS,
          hints: '↑↓ navigate · type to filter · enter select · esc quit',
        }),
        e(SelectList, {
          items,
          filterable: true,
          emptyLabel: `No ${fromPlatform} chats found here yet.`,
          onSelect: (item) => {
            setSelectedChat(item.id);
            setScreen(SCREENS.CONFIRM);
          },
        })
      );
    }
  } else if (screen === SCREENS.CONFIRM) {
    let ir;
    try {
      ir = getPlatform(fromPlatform).reader.readChat(selectedChat);
    } catch (err) {
      content = e(ErrorScreen, { message: err.message, onBack: () => setScreen(SCREENS.BROWSE_CHATS) });
    }
    if (!content) {
      content = e(
        Box,
        { flexDirection: 'column' },
        e(Text, { dimColor: true }, `Step ${TOTAL_STEPS} of ${TOTAL_STEPS}`),
        e(ConfirmPrompt, {
          title: ir.title,
          turnCount: ir.turns.length,
          model: ir.model || '(unknown)',
          cwd: ir.cwd,
          from: fromPlatform,
          to: toPlatform,
          onConfirm: async () => {
            try {
              // Same advisory, non-blocking version check the non-interactive
              // `migrate` command already does -- previously this path had
              // none at all, so the interactive flow was silently missing
              // the one safety net the CLI has against a source/target CLI
              // release that's drifted outside hopchat's tested range.
              for (const warning of (await Promise.all([warnIfUnsupported(fromPlatform), warnIfUnsupported(toPlatform)])).filter(
                Boolean
              )) {
                console.error(warning);
              }
              const result = migrate({ from: fromPlatform, to: toPlatform, chatId: selectedChat });
              setLastResult({ title: ir.title, cwd: ir.cwd, ...result });
              setScreen(SCREENS.HOPPING);
            } catch (err) {
              goToError(err);
            }
          },
          onCancel: () => setScreen(SCREENS.BROWSE_CHATS),
        })
      );
    }
  } else if (screen === SCREENS.HOPPING) {
    content = e(HoppingScreen, { from: fromPlatform, to: toPlatform, onDone: () => setScreen(SCREENS.SUCCESS) });
  } else if (screen === SCREENS.SUCCESS) {
    content = e(
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
  } else if (screen === SCREENS.ERROR) {
    content = e(ErrorScreen, { message: errorMessage, onBack: () => setScreen(SCREENS.BROWSE_CHATS) });
  } else {
    content = null;
  }

  // alignItems:'flex-start' on this single root Box is what makes every
  // screen's content (in particular Banner's bordered box) shrink to fit
  // its actual content instead of stretching to the terminal's full width --
  // Ink/yoga's real "hug content" mechanism, confirmed by measuring a bare
  // bordered Box with and without this wrapper (100 cols wide vs 4).
  return e(Box, { flexDirection: 'column', alignItems: 'flex-start' }, content);
}

function ReturnToListOnEnter({ onReturn }) {
  useInput((input, key) => {
    if (key.return) onReturn();
  });
  return null;
}

function GreetingScreen({ onContinue }) {
  const t = useBlinkTimer();
  useInput((input, key) => {
    if (key.return) onContinue();
  });
  return e(Banner, { tagline: 'Ready to hop a chat between tools?', pose: 'idle', t });
}

function ExitScreen() {
  const { exit } = useApp();
  const t = useBlinkTimer();
  useEffect(() => {
    const timer = setTimeout(() => exit(), 0);
    return () => clearTimeout(timer);
  }, [exit]);
  return e(
    Box,
    { flexDirection: 'column' },
    e(Banner, { tagline: 'See you next hop!', pose: 'happy', t }),
    e(Text, { dimColor: true }, 'Session ended.')
  );
}

// Styled failure screen, deliberately mirroring SuccessPanel's bordered-box
// look (just red instead of green) rather than letting an exception unmount
// the whole Ink tree and print a bare, unstyled "Error: <message>" after the
// fact -- previously the only failure handling anywhere in this file.
function ErrorScreen({ message, onBack }) {
  useInput((input, key) => {
    if (key.return || key.escape) onBack();
  });
  return e(
    Box,
    { flexDirection: 'column' },
    e(MiniHeader, { pose: 'alert' }),
    e(
      Box,
      { flexDirection: 'column', borderStyle: 'single', borderColor: 'red', padding: 1 },
      e(Text, { color: 'red', bold: true }, '✖ Something went wrong'),
      e(Box, { marginTop: 1 }, e(Text, null, message))
    ),
    e(Box, { marginTop: 1 }, e(Text, { dimColor: true }, 'Press Enter to go back.'))
  );
}

module.exports = App;
