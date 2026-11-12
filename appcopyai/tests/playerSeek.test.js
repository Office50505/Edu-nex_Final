const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
const video = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'VideoItem');
const slice = node => source.slice(node.start, node.end);
const functions = video.body.body.filter(n => n.type === 'FunctionDeclaration'
  && ['seekToPosition', 'handleSeekDrag', 'handleSeekCommit', 'seekBy'].includes(n.id.name));

function fixture({ intended = false, active = true, playing = intended } = {}) {
  const commands = [], saved = [];
  const state = { playing, buffering: false, time: 30, ended: false, timersCleared: 0 };
  const c = {
    isActive: active, currentTime: 30, duration: 90,
    shouldBePlayingRef: { current: intended },
    seekGuardRef: { current: {} }, isDraggingRef: { current: false },
    dragTargetRef: { current: 30 }, seekBarWidth: { current: 100 },
    clampSeconds: (t, d) => Math.max(0, Math.min(t, d)),
    flushProgress: (...args) => saved.push(args),
    clearAutoPlayTimers: () => { state.timersCleared++; },
    sendCmd: (...args) => commands.push(args),
    setCurrentTime: t => { state.time = t; },
    setIsPlaying: v => { state.playing = v; },
    setIsBuffering: v => { state.buffering = v; },
    setIsEnded: v => { state.ended = v; },
    setSeekAnim() {}, setTimeout: () => 0,
  };
  vm.createContext(c);
  vm.runInContext(functions.map(slice).join('\n'), c);
  return { c, state, commands, saved };
}

for (const intended of [false, true]) {
  for (const seconds of [-10, 10]) {
    test(`${intended ? 'playing' : 'paused'} skip ${seconds} seconds preserves playback intent`, () => {
      const f = fixture({ intended });
      f.c.seekBy(seconds);
      assert.equal(f.state.time, 30 + seconds);
      assert.equal(f.state.playing, intended);
      assert.equal(f.c.shouldBePlayingRef.current, intended);
      assert.equal(f.state.timersCleared, 1);
      assert.equal(f.commands[0][0], intended ? 'seekAndPlay' : 'seekTo');
      assert.equal(f.commands[0][1][0], 30 + seconds);
      if (!intended) assert.equal(f.commands.at(-1)[0], 'pauseVideo');
    });
  }
  test(`${intended ? 'playing' : 'paused'} timeline drag preserves playback intent and saves the position`, () => {
    const f = fixture({ intended });
    f.c.handleSeekDrag(50);
    f.c.handleSeekCommit();
    assert.equal(f.state.time, 45);
    assert.equal(f.c.isDraggingRef.current, false);
    assert.equal(f.state.playing, intended);
    assert.equal(f.c.shouldBePlayingRef.current, intended);
    assert.equal(f.saved[0][0], 45);
    assert.equal(f.commands[0][0], intended ? 'seekAndPlay' : 'seekTo');
  });
}

test('a buffering lesson uses intended playback rather than a transient not-playing flag', () => {
  const f = fixture({ intended: true, playing: false });
  f.c.seekBy(10);
  assert.equal(f.commands[0][0], 'seekAndPlay');
});

test('an inactive lesson cannot resume from a stale playing intention', () => {
  const f = fixture({ intended: true, active: false });
  f.c.seekBy(10);
  assert.equal(f.state.playing, false);
  assert.equal(f.c.shouldBePlayingRef.current, false);
  assert.equal(f.commands.at(-1)[0], 'pauseVideo');
});

test('seeking stays within the lesson and a commit without a drag does nothing', () => {
  const f = fixture();
  f.c.handleSeekCommit();
  assert.equal(f.commands.length, 0);
  f.c.seekBy(-100);
  assert.equal(f.state.time, 0);
  f.c.seekBy(100);
  assert.equal(f.state.time, 90);
});

function nativeEvent(event, intended) {
  const call = video.body.body.map(n => n.expression).find(n => n?.type === 'CallExpression'
    && n.callee.name === 'useEventListener' && n.arguments[1]?.value === event);
  assert.ok(call, event);
  const state = { playing: null, plays: 0, pauses: 0 };
  const c = {
    isNativeVideo: true, isActive: true, isOffline: false, __DEV__: false,
    requestedInitialTime: 0, duration: 90, nativePlayer: { duration: 90, availableVideoTracks: [] },
    shouldBePlayingRef: { current: intended }, initialSeekDoneRef: { current: true },
    finiteSeconds: (v, fallback) => Number.isFinite(v) ? v : fallback,
    normalizeResumeTime: t => t,
    setDuration() {}, setIsEnded() {}, setIsBuffering() {},
    setIsPlaying: v => { state.playing = v; },
    playNativePlayer: () => { state.plays++; }, pauseNativePlayer: () => { state.pauses++; },
  };
  vm.runInNewContext(`(${slice(call.arguments[2])})(${JSON.stringify(event === 'sourceLoad'
    ? { duration: 90, availableVideoTracks: [] } : { status: 'readyToPlay' })})`, c);
  return state;
}

for (const event of ['sourceLoad', 'statusChange']) {
  test(`${event} after a paused seek cannot restart native playback`, () => {
    const state = nativeEvent(event, false);
    assert.equal(state.plays, 0);
    assert.equal(state.playing, false);
    assert.equal(state.pauses, 1);
  });
  test(`${event} still starts native playback when playback is intended`, () => {
    const state = nativeEvent(event, true);
    assert.equal(state.plays, 1);
    assert.equal(state.playing, true);
  });
}
