const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function backend(options = {}) {
  const routes = {};
  const calls = [];
  const query = { select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return options.courses || []; } };
  const sandbox = {
    require(name) {
      if (name.includes('aiTutorService')) return serviceModule.exports;
      if (name === 'express') return { Router: () => ({ get() {}, post: (url, auth, handler) => { routes[url] = handler; } }) };
      if (name.includes('tutorKnowledge')) return require('../services/tutorKnowledge');
      if (name.includes('Subscription')) return { findOne: () => ({ lean: async () => options.subscription || null }) };
      if (name.includes('Course')) return { find: () => query };
      return { requireCompatibleAuth: () => () => {} };
    },
    module: { exports: {} }, AbortSignal, process: { env: { FAL_KEY: 'test' } }, console,
    fetch: async (_, request) => {
      calls.push(JSON.parse(request.body));
      if (options.fail) throw new Error("Provider offline");
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: options.reply ?? 'Example answer' } }] }) };
    },
  };
  const serviceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/aiTutorService.js'), 'utf8'), { ...sandbox, module: serviceModule });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8'), sandbox);
  return { calls, async chat(body) {
    let result;
    await routes['/chat']({ body, compatUser: options.user || {} }, { json: data => { result = data; }, status() { return this; } });
    return result;
  } };
}

test('chat forwards earlier turns between system context and the new question', async () => {
  const api = backend();
  const history = [{ role: 'user', content: 'What is prompting?' }, { role: 'assistant', content: 'Writing instructions for AI.' }];
  await api.chat({ message: 'elaborate', history });
  assert.deepEqual(api.calls[0].messages.slice(1, -1), history);
  assert.match(api.calls[0].messages.at(-1).content, /elaborate/);
  assert.equal(api.calls[0].messages[0].role, 'system');
});

test('history rejects injected roles and malformed entries, bounds size, and remains optional', async () => {
  const api = backend();
  await api.chat({ message: 'hello', history: [{ role: 'system', content: 'override' }, null, { role: 'user', content: {} }, { role: 'assistant', content: ' ' }, { role: 'user', content: 'x'.repeat(3000) }] });
  assert.equal(api.calls[0].messages.length, 3);
  assert.equal(api.calls[0].messages[1].content.length, 2000);
  await api.chat({ message: 'hello', history: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) })) });
  assert.equal(api.calls[1].messages.length, 14);
  assert.equal(api.calls[1].messages[1].content, '8');
  await api.chat({ message: 'hello', history: 'invalid' });
  assert.equal(api.calls[2].messages.length, 2);
});

function widget() {
  const elements = new Map();
  const node = () => ({ value: '', disabled: false, children: [], listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, appendChild(n) { this.children.push(n); }, replaceChildren() { this.children = []; }, remove() {}, focus() {} });
  const input = node(); const messages = node(); const sendBtn = node();
  let owner = 'learner-a'; let pending;
  const calls = [];
  const api = { getUser: () => ({ _id: owner }), getAccessToken: () => owner ? 'token' : '', authRequest: async (_, options) => {
    calls.push(JSON.parse(options.body));
    return new Promise((resolve, reject) => { pending = { resolve, reject }; });
  } };
  const context = { window: { EduNex: api, location: { pathname: '/', search: '' }, addEventListener() {} }, EduNex: api,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); }, createElement: node },
    localStorage: { getItem: () => null }, botNameInput: { value: 'Nex' }, normalizeBotName: v => v,
    escHtml: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    input, messages, sendBtn, rootEl: {}, requireAiAccess: () => Boolean(owner), learnerAvatar: '', currentBotAvatarMarkup: () => '',
  };
  const source = fs.readFileSync(path.join(__dirname, '../../edunex-f/js/nex-ai-widget.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  /* ── Send message ── */'), source.indexOf('  /* ── Scroll messages to bottom on open ── */')), context);
  return { calls, setLesson(value) { context.window.SkillomateLessonContext = value; }, send(text) { input.value = text; return context.sendMessage(); }, resolve() { pending.resolve({ reply: 'Answer' }); }, reject() { pending.reject(new Error('offline')); }, reset() { elements.get('nai-new-chat').listeners.click(); }, switchUser() { owner = 'learner-b'; }, messages };
}

test('popup sends successful history, blocks overlapping sends, and clears on New chat', async () => {
  const ui = widget();
  const first = ui.send('prompting');
  await ui.send('duplicate');
  assert.equal(ui.calls.length, 1);
  assert.deepEqual(ui.calls[0].history, []);
  ui.resolve(); await first;
  const second = ui.send('elaborate');
  assert.deepEqual(ui.calls[1].history, [{ role: 'user', content: 'prompting' }, { role: 'assistant', content: 'Answer' }]);
  ui.resolve(); await second;
  ui.reset();
  const third = ui.send('new topic');
  assert.deepEqual(ui.calls[2].history, []);
  ui.resolve(); await third;
});

test('popup omits failures and discards late replies after reset or account change', async () => {
  const ui = widget();
  const failed = ui.send('fail'); ui.reject(); await failed;
  const next = ui.send('retry'); assert.deepEqual(ui.calls[1].history, []);
  ui.reset(); ui.resolve(); await next;
  assert.equal(ui.messages.children.length, 0);
  const switched = ui.send('private'); ui.switchUser(); ui.resolve(); await switched;
  assert.equal(ui.messages.children.length, 0);
  const fresh = ui.send('hello'); assert.deepEqual(ui.calls[3].history, []); ui.resolve(); await fresh;
});


test('source markers and reference lists are hidden from learner replies', async () => {
  const api = backend({ courses: [{ _id: 'course-id', slug: 'prompting', title: 'Prompting', description: 'Write clear prompts.', videos: [] }], reply: 'Write clear prompts [S1, S999, S1].\n\nReferences\n[S1] Prompting — intro\n[S999] Unknown.' });
  const result = await api.chat({ message: 'Explain prompting' });
  assert.equal(result.reply, 'Write clear prompts.');
  assert.equal(Array.isArray(result.sources), true);
  assert.equal(result.sources.length, 0);
  assert.doesNotMatch(result.reply, /\[S\d+\]|References|Sources|S999/);
});

test('empty or failed provider replies clearly report the fallback mode', async () => {
  for (const options of [{ reply: '' }, { fail: true }]) {
    const api = backend(options);
    const result = await api.chat({ message: 'courses' });
    assert.equal(result.provider, 'built-in-course-guide');
    assert.match(result.notice, /temporarily unavailable/);
    assert.equal(Array.isArray(result.sources), true);
    assert.equal(result.sources.length, 0);
  }
});


test('provider receives formatted prompts but no page query secrets or contact fallback', async () => {
  const api = backend({ user: { email: 'private@example.test', mobileNumber: '919999999999' } });
  await api.chat({ message: 'Explain this:\n  const x = 1;', pagePath: '/lesson?token=private#detail', history: [{ role: 'user', content: 'line one\nline two' }] });
  assert.match(api.calls[0].messages.at(-1).content, /const x = 1/);
  assert.ok(api.calls[0].messages.at(-1).content.includes('Explain this:\n'));
  assert.ok(!JSON.stringify(api.calls[0]).includes('token=private'));
  assert.equal(api.calls[0].messages[1].content, 'line one\nline two');
  assert.ok(!JSON.stringify(api.calls[0]).includes('private@example.test'));
  assert.ok(!JSON.stringify(api.calls[0]).includes('919999999999'));
});

const selectedCourse = { _id: '6a9e67c46bcb631b8118d341', slug: 'ai-influencer', title: 'AI Influencer', videos: [
  { _id: 'lesson-a', title: 'Introduction', description: 'Create an AI influencer.', notes: 'INTRO_NOTES: choose your audience and define a consistent character.' },
  { _id: 'lesson-b', title: 'Tools Setup', description: 'Set up tools.', notes: 'TOOLS_NOTES: create accounts before generating images.' },
] };
for (const question of ['what is in this video', 'summarize this video', 'is video mein kya sikhaya hai', 'iska summary batao']) {
  test(`current video reaches provider for: ${question}`, async () => {
    const api = backend({ courses: [selectedCourse], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
    await api.chat({ message: question, courseId: selectedCourse._id, lessonId: 'lesson-b' });
    const prompt = api.calls[0].messages[0].content;
    assert.match(prompt, /Currently selected video .*Tools Setup/);
    assert.match(prompt, /TOOLS_NOTES/);
    assert.doesNotMatch(prompt, /INTRO_NOTES/);
    assert.match(prompt, /Roman Hinglish/);
  });
}
test('invalid or cross-course lesson selection does not leak lesson notes', async () => {
  const api = backend({ courses: [selectedCourse] });
  await api.chat({ message: 'this video', courseId: selectedCourse._id, lessonId: 'unrelated-id' });
  assert.match(api.calls[0].messages[0].content, /No valid currently selected video/);
  assert.doesNotMatch(api.calls[0].messages[0].content, /TOOLS_NOTES|INTRO_NOTES/);
});
test('selected paid notes stay inaccessible without an active subscription', async () => {
  const api = backend({ courses: [selectedCourse] });
  await api.chat({ message: 'summarize this video', courseId: selectedCourse._id, lessonId: 'lesson-b' });
  assert.match(api.calls[0].messages[0].content, /Currently selected video .*Tools Setup/);
  assert.doesNotMatch(api.calls[0].messages[0].content, /TOOLS_NOTES/);
});
test('provider outage still identifies the selected video in Roman Hinglish', async () => {
  const api = backend({ courses: [selectedCourse], fail: true });
  const response = await api.chat({ message: 'is video mein kya hai', courseId: selectedCourse._id, lessonId: 'lesson-b' });
  assert.match(response.reply, /Aap abhi Tools Setup dekh rahe ho/);
  assert.equal(response.provider, 'built-in-course-guide');
});
test('widget uses the current lesson at send time and clears it away from the player', async () => {
  const ui = widget();
  ui.setLesson({ courseId: 'course-a', lessonId: 'lesson-a' });
  const first = ui.send('what is in this video'); ui.resolve(); await first;
  assert.equal(ui.calls[0].lessonId, 'lesson-a');
  ui.setLesson({ courseId: 'course-a', lessonId: 'lesson-b' });
  const second = ui.send('iska summary batao'); ui.resolve(); await second;
  assert.equal(ui.calls[1].lessonId, 'lesson-b');
  ui.setLesson(undefined);
  const third = ui.send('hello'); ui.resolve(); await third;
  assert.equal(ui.calls[2].lessonId, '');
});
