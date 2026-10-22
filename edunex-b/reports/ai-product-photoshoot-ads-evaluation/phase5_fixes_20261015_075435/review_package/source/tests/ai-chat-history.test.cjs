const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function backend(options = {}) {
  const routes = {};
  const calls = [];
  const authCalls = [];
  const query = { select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return options.courses || []; } };
  const sandbox = {
    require(name) {
      if (name === 'node:crypto') return require('node:crypto');
      if (name === 'mongoose') return require('mongoose');
      if (name.includes('aiTutorService')) return serviceModule.exports;
      if (name === 'express') return { Router: () => ({
        delete() {},
        get: (url, ...handlers) => { routes[`GET ${url}`] = handlers; },
        put: (url, ...handlers) => { routes[`PUT ${url}`] = handlers; },
        post: (url, ...handlers) => { routes[`POST ${url}`] = handlers; },
      }) };
      if (name.includes('compatAuth')) return {
        requireCompatibleAuth: config => (req, res, next) => {
          authCalls.push(config);
          if (!req.compatAuth) return res.status(401).json({ error: 'Invalid session' });
          return next();
        },
      };
      if (name.includes('aiCompliance')) return require('../services/aiCompliance');
      if (name.includes('AiTutorSession')) return options.sessions ? {
        findOne: filter => ({select(){return this;},lean:async()=>options.sessions.get(`${filter.user}:${filter.course}`)||null}),
        findOneAndUpdate:async(filter,update)=>{options.sessions.set(`${filter.user}:${filter.course}`,update);return update;},
        deleteMany:async()=>({deletedCount:0}),
      } : { deleteMany: async () => ({ deletedCount: 0 }) };
      if (name.includes('AiResponseReport')) return { create: async () => ({}) };
      if (name.includes('/models/User')) return { updateOne: async () => ({}) };
      if (name.includes('tutorKnowledge')) return require('../services/tutorKnowledge');
      if (name === './tutorProvider') return require('../services/tutorProvider');
      if (name === './productTutorResponse') return require('../services/productTutorResponse');
      if (name.endsWith('/subscriptionAccess')) return require('../services/subscriptionAccess');
      if (name.endsWith('/AppleSubscription')) return { findOne: () => ({ lean: async () => options.apple || null }) };
      if (name.endsWith('/GooglePlaySubscription')) return { findOne: () => ({ lean: async () => options.google || null }) };
      if (name.endsWith('/Subscription')) return { findOne: () => ({ lean: async () => options.subscription || null }) };
      if (name.endsWith('/Order')) return { findOne: () => ({ select() { return this; }, sort() { return this; }, lean: async () => options.order || null }) };
      if (name.includes('Course')) return { find: () => query };
      return { requireCompatibleAuth: () => () => {} };
    },
    module: { exports: {} }, AbortSignal, process: { env: { FAL_KEY: options.noKey ? '' : 'test' } }, console,
    fetch: async (_, request) => {
      calls.push(JSON.parse(request.body));
      if (options.fail) throw new Error("Provider offline");
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: options.reply ?? 'Example answer' } }] }) };
    },
  };
  const serviceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/aiTutorService.js'), 'utf8'), { ...sandbox, module: serviceModule });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8'), sandbox);
  async function request(method, url, body = {}, authenticated = true) {
    let result;
    let statusCode = 200;
    const headers = {};
    const response = {
      json(data) { result = data; return data; },
      status(code) { statusCode = code; return this; },
      set(name, value) { headers[name.toLowerCase()] = value; return this; },
    };
    const req = {
      body,
      compatUser: options.user || {},
      compatAuth: authenticated ? { userId: options.userId || 'learner' } : undefined,
      ip: '127.0.0.1',
    };
    const handlers = routes[`${method} ${url}`];
    assert.ok(handlers, `Missing ${method} ${url} route`);
    async function dispatch(index) {
      if (index >= handlers.length) return;
      let downstream;
      await handlers[index](req, response, () => {
        downstream = dispatch(index + 1);
        return downstream;
      });
      await downstream;
    }
    await dispatch(0);
    return { result, statusCode, headers };
  }
  const rawChat = body => request('POST', '/chat', body);
  return {
    calls,
    authCalls,
    request,
    rawChat,
    async chat(body) { return (await rawChat(body)).result; },
  };
}

test('phase5 route persists supplied colour fields for a later request without client history', async()=>{
 const courseId='6e0000000000000000000001';const sessions=new Map();
 const api=backend({noKey:true,sessions,courses:[{_id:courseId,slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]}],
  user:{_id:'phase5-learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)}});
 const scope={courseId,conversationId:'phase5-colour'};
 await api.chat({...scope,message:'Change the colour of the metal rim to bronze brown, while keeping the body unchanged. Lesson 04.'});
 const result=await api.chat({...scope,message:'Copy the exact L04 Colour Variant Sheet prompt.'});
 assert.match(result.answer,/Only change the colour of the metal rim to bronze brown\./);
 assert.equal(result.outcome.type,'local_rule');assert.equal(result.outcome.liveModelAnswer,false);assert.equal(api.calls.length,0);
});

test('phase5 route preserves saved video topic across an omitted-history language follow-up',async()=>{
 const courseId='6e0000000000000000000002';const sessions=new Map();
 const api=backend({noKey:true,sessions,courses:[{_id:courseId,slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]}],
  user:{_id:'phase5-learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)}});
 const scope={courseId,conversationId:'phase5-video'};
 await api.chat({...scope,message:'Explain the Lesson 06 product video settings.'});
 const result=await api.chat({...scope,message:'Switch to English and explain those settings again.'});
 assert.match(result.answer,/Lesson 06.*16:9.*Omni 1\.1 Flash.*720p.*6 sec.*x1/s);
 const saved=[...sessions.values()][0];assert.equal(saved.productContext.topic,'video');assert.equal(saved.productContext.lessonNumber,6);
 assert.equal(api.calls.length,0);
});

test('phase5 colour slots do not cross a new conversation boundary',async()=>{
 const courseId='6e0000000000000000000003';const sessions=new Map();
 const api=backend({noKey:true,sessions,courses:[{_id:courseId,slug:'ai-product-photoshoot-ads',title:'AI Product Photoshoot & Ads',videos:[]}],
  user:{_id:'phase5-learner'},subscription:{status:'active',currentPeriodEnd:new Date(Date.now()+60000)}});
 await api.chat({courseId,conversationId:'phase5-old',message:'Change the colour of the clasp to pearl white. Lesson 04.'});
 const result=await api.chat({courseId,conversationId:'phase5-new',message:'Give exact L04 Colour Variant Sheet prompt.'});
 assert.match(result.answer,/\[the part/);assert.match(result.answer,/\[new colour/);assert.doesNotMatch(result.answer,/pearl white/);
 assert.equal(result.outcome.liveModelAnswer,false);
});

test('AI lesson materials use independent store access and reject revoked store mirrors', async () => {
  const courseId = '6a9e67c46bcb631b8118d341';
  const lessonId = 'lesson-verified';
  const courses = [{ _id: courseId, slug: 'learning-course', title: 'Learning Course', videos: [
    { _id: lessonId, title: 'Prompting', notes: 'PROVIDER_ACCESS_SENTINEL teaches how to structure a clear prompt.' },
  ] }];
  const expiresAt = new Date(Date.now() + 60000);
  for (const [store, active] of [
    [{ google: { entitlementState: 'ACTIVE', expiresAt } }, true],
    [{ apple: { entitlementState: 'ACTIVE', expiresAt } }, true],
    [{ google: { entitlementState: 'REVOKED', expiresAt } }, false],
    [{ google: { entitlementState: 'BILLING_RETRY', expiresAt } }, false],
  ]) {
    const api = backend({ courses, ...store, user: { _id: 'learner', subscriptionStatus: active ? 'expired' : 'active', subscriptionExpiry: expiresAt } });
    await api.chat({ courseId, lessonId, message: 'Explain this video' });
    assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].messages[0].content.includes('PROVIDER_ACCESS_SENTINEL'), active);
  }
});

// Preserve the validation contract in already-installed mobile clients, even after
// their consent helper has been removed from the current app source.
function legacyMobileAcceptsConsent(consent) {
  return consent?.granted === true
    && consent.policyVersion === '2026-09-25'
    && typeof consent.providerVersion === 'string'
    && consent.providerVersion.length > 0;
}

for (const [method, body] of [['GET', {}], ['PUT', { granted: true }], ['PUT', { granted: false }]]) {
  test(`legacy mobile client accepts ${method} /consent ${JSON.stringify(body)} without a cached gate`, async () => {
    const api = backend({ user: { aiConsentGranted: false } });
    const response = await api.request(method, '/consent', body);
    assert.equal(response.statusCode, 200);
    assert.equal(legacyMobileAcceptsConsent(response.result), true);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(api.authCalls.length, 1);
    assert.equal(api.calls.length, 0);
  });
}

test('legacy consent compatibility and chat retain authentication before their handlers', async () => {
  for (const [method, url, body] of [
    ['GET', '/consent', {}],
    ['PUT', '/consent', { granted: true }],
    ['POST', '/chat', { message: 'Explain prompting' }],
  ]) {
    const api = backend();
    const response = await api.request(method, url, body, false);
    assert.equal(response.statusCode, 401, `${method} ${url}`);
    assert.equal(response.result.error, 'Invalid session');
    assert.equal(response.result.granted, undefined);
    assert.equal(api.authCalls.length, 1);
    assert.match(api.authCalls[0].userProjection, /\+activeSessionId\b/);
    assert.equal(api.calls.length, 0);
  }
});

for (const [state, user] of [
  ['absent', {}],
  ['declined', { aiConsentGranted: false }],
  ['outdated', { aiConsentGranted: true, aiConsentPolicyVersion: '2026-01-01', aiConsentProviderVersion: 'old-provider' }],
]) {
  test(`chat answers a valid prompt with ${state} retired consent data`, async () => {
    const api = backend({ user });
    const response = await api.rawChat({ message: 'Explain prompting' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.result.reply, 'Example answer');
    assert.equal(api.calls.length, 1);
  });
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
  const api = { getUser: () => ({ _id: owner }), getAccessToken: () => owner ? 'token' : '', authRequest: async (url, options) => {
    calls.push(JSON.parse(options.body));
    return new Promise((resolve, reject) => { pending = { resolve, reject }; });
  } };
  const context = { window: { EduNex: api, location: { pathname: '/', search: '' }, addEventListener() {} }, EduNex: api,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); }, createElement: node },
    localStorage: { getItem: () => null }, botNameInput: { value: 'Nex' }, normalizeBotName: v => v,
    escHtml: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    input, messages, sendBtn,
    rootEl: {}, requireAiAccess: () => Boolean(owner), learnerAvatar: '', currentBotAvatarMarkup: () => '',
  };
  const source = fs.readFileSync(path.join(__dirname, '../../edunex-f/js/nex-ai-widget.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  /* ── Send message ── */'), source.indexOf('  /* ── Scroll messages to bottom on open ── */')), context);
  return { calls, setLesson(value) { context.window.SkillomateLessonContext = value; }, send(text) { input.value = text; return context.sendMessage(); }, resolve() { pending.resolve({ reply: 'Answer' }); }, reject() { pending.reject(new Error('offline')); }, reset() { elements.get('nai-new-chat').listeners.click(); }, switchUser() { owner = 'learner-b'; }, messages };
}

test('popup sends successful history, blocks overlapping sends, and clears on New chat', async () => {
  const ui = widget();
  const first = ui.send('prompting');
  await new Promise(resolve => setImmediate(resolve));
  await ui.send('duplicate');
  assert.equal(ui.calls.length, 1);
  assert.deepEqual(ui.calls[0].history, []);
  ui.resolve(); await first;
  const second = ui.send('elaborate');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.calls[1].history, [{ role: 'user', content: 'prompting' }, { role: 'assistant', content: 'Answer' }]);
  ui.resolve(); await second;
  ui.reset();
  const third = ui.send('new topic');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.calls[2].history, []);
  ui.resolve(); await third;
});

test('popup omits failures and discards late replies after reset or account change', async () => {
  const ui = widget();
  const failed = ui.send('fail'); await new Promise(resolve => setImmediate(resolve)); ui.reject(); await failed;
  const next = ui.send('retry'); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(ui.calls[1].history, []);
  ui.reset(); ui.resolve(); await next;
  assert.equal(ui.messages.children.length, 0);
  const switched = ui.send('private'); await new Promise(resolve => setImmediate(resolve)); ui.switchUser(); ui.resolve(); await switched;
  assert.equal(ui.messages.children.length, 0);
  const fresh = ui.send('hello'); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(ui.calls[3].history, []); ui.resolve(); await fresh;
});


test('source markers and reference lists are hidden from learner replies', async () => {
  const api = backend({ courses: [{ _id: 'course-id', slug: 'prompting', title: 'Prompting', description: 'Write clear prompts.', videos: [] }], reply: 'Write clear prompts [S1, S999, S1].\n\nReferences\n[S1] Prompting — intro\n[S999] Unknown.' });
  const result = await api.chat({ message: 'Explain prompting' });
  assert.equal(result.reply, 'Write clear prompts.');
  assert.equal(Array.isArray(result.sources), true);
  assert.equal(result.sources.length, 0);
  assert.doesNotMatch(result.reply, /\[S\d+\]|References|Sources|S999/);
});

test('empty or failed provider replies fall back without learner-facing outage copy', async () => {
  for (const options of [{ reply: '' }, { fail: true }]) {
    const api = backend(options);
    const result = await api.chat({ message: 'courses' });
    assert.equal(result.provider, 'built-in-course-guide');
    assert.equal(result.notice, null);
    assert.equal(Array.isArray(result.sources), true);
    assert.equal(result.sources.length, 0);
  }
});

test('plan questions bypass provider and answer with current Skillomate access facts', async () => {
  const api = backend();
  const result = await api.chat({ message: 'but it show 499 me all course access kar sakte' });
  assert.equal(result.provider, 'skillomate-plan-facts');
  assert.match(result.reply, /₹499/);
  assert.match(result.reply, /30 days/);
  assert.match(result.reply, /all Skillomate courses/);
  assert.match(result.reply, /PhonePe one-time payment/i);
  assert.equal(api.calls.length, 0);
});

test('product ad price questions stay in active course flow instead of subscription facts', async () => {
  const productCourse = {
    _id: '6d0000000000000000000000',
    slug: 'ai-product-photoshoot-ads',
    title: 'AI Product Photoshoot & Ads',
    description: 'Create AI product photos, product videos, and honest ad assets.',
    videos: [{ _id: 'lesson-05', title: 'Lesson 05 - chat G.P.T Se Ad Plan', description: 'Plan buyers, ad angles, hooks, scripts, captions, and Flow prompts.' }],
  };
  const api = backend({
    courses: [productCourse],
    user: { _id: 'learner' },
    subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) },
  });
  const result = await api.chat({ message: 'I sell a copper water bottle on Instagram. Price is 899. Plan an ad.', courseId: productCourse._id });
  assert.equal(result.provider, 'course-knowledge-rule');
  assert.equal(api.calls.length, 0);
  assert.equal(result.outcome.liveModelAnswer, false);
  assert.doesNotMatch(result.reply, /₹499|PhonePe|all Skillomate courses|web offer/i);
  assert.match(result.reply, /copper water bottle.*899/s);
  assert.match(result.reply, /Lesson 05.*Hooks.*15-second script.*Caption/s);
});

test('active product course still answers explicit Skillomate subscription questions deterministically', async () => {
  const productCourse = {
    _id: '6d0000000000000000000000',
    slug: 'ai-product-photoshoot-ads',
    title: 'AI Product Photoshoot & Ads',
    description: 'Create AI product photos, product videos, and honest ad assets.',
    videos: [],
  };
  const api = backend({ courses: [productCourse], user: { _id: 'learner' } });
  const result = await api.chat({ message: 'What is the Skillomate subscription plan?', courseId: productCourse._id });
  assert.equal(result.provider, 'skillomate-plan-facts');
  assert.match(result.reply, /₹499|30 days|all Skillomate courses/i);
  assert.equal(api.calls.length, 0);
});

test('ambiguous product ad follow-ups keep active course context', async () => {
  const productCourse = {
    _id: '6d0000000000000000000000',
    slug: 'ai-product-photoshoot-ads',
    title: 'AI Product Photoshoot & Ads',
    description: 'Create AI product photos, product videos, and honest ad assets.',
    videos: [{ _id: 'lesson-05', title: 'Lesson 05 - chat G.P.T Se Ad Plan', description: 'Plan buyers, ad angles, hooks, scripts, captions, and Flow prompts.' }],
  };
  const api = backend({
    courses: [productCourse],
    user: { _id: 'learner' },
    subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) },
  });
  const history = [
    { role: 'user', content: 'I sell a copper water bottle on Instagram. Price is 899. Plan an ad.' },
    { role: 'assistant', content: 'Pick one buyer angle and use only the product details provided.' },
  ];
  const result = await api.chat({ message: 'Now write the hooks without fake claims.', history, courseId: productCourse._id });
  assert.equal(result.provider, 'course-knowledge-rule');
  assert.equal(api.calls.length, 0);
  assert.match(result.reply, /copper water bottle.*899/s);
  assert.match(result.reply, /Hooks.*15-second script.*Caption/s);
  assert.doesNotMatch(result.reply, /AI Filmmaking|AI Influencer|health benefits|keeps water cold/i);
});

test('learner account questions bypass provider with safe profile and payment facts', async () => {
  const expiresAt = new Date(Date.now() + 3 * 86400000);
  const api = backend({
    user: {
      _id: 'learner',
      fullName: 'User Five',
      email: 'user5@example.test',
      mobileNumber: '919876543210',
      isMobileVerified: true,
      subscriptionStatus: 'active',
      subscriptionExpiry: expiresAt,
      age: 21,
      gender: 'male',
      avatar: 'avatar-1',
    },
    order: {
      gateway: 'phonepe',
      orderType: 'one_time_access',
      totalAmount: 49900,
      paidAt: new Date(),
      phonePePaymentInstrument: 'UPI',
      refundedAmount: 0,
    },
  });
  const result = await api.chat({ message: 'my payment details and how many days remaining in my plan?' });
  assert.equal(result.provider, 'skillomate-learner-facts');
  assert.match(result.reply, /User Five|₹499|phonepe|UPI|remaining/i);
  assert.match(result.reply, /3 days? remaining/i);
  assert.doesNotMatch(result.reply, /919876543210|user5@example\.test/i);
  assert.equal(api.calls.length, 0);
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

test('active course scope excludes other course catalog and materials from provider context', async () => {
  const aiFilmmaking = {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Create AI short films with story, shots, voice, and editing.',
    videos: [{ _id: 'film-tools', title: 'Tools Setup', description: 'Set up Google Flow.' }],
  };
  const aiInfluencer = {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'AI_INFLUENCER_SENTINEL should not enter an active AI Filmmaking prompt.',
    videos: [{ _id: 'influencer-face', title: 'Same Face Every Time', description: 'INFLUENCER_FACE_SENTINEL' }],
  };
  const api = backend({ courses: [aiFilmmaking, aiInfluencer], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
  await api.chat({ message: 'Explain the tools setup', courseId: aiFilmmaking._id });
  const prompt = api.calls[0].messages[0].content;
  assert.match(prompt, /Active course scope: AI Filmmaking Course/);
  assert.match(prompt, /AI Filmmaking Course/);
  assert.doesNotMatch(prompt, /AI Influencer Course|AI_INFLUENCER_SENTINEL|INFLUENCER_FACE_SENTINEL/);
});

test('active AI Filmmaking face consistency answer does not call provider or merge courses', async () => {
  const aiFilmmaking = {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Create AI short films.',
    videos: [],
  };
  const aiInfluencer = {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'Other course.',
    videos: [],
  };
  const api = backend({ courses: [aiFilmmaking, aiInfluencer], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
  const response = await api.chat({ message: 'face keeps changing every clip what should i do', courseId: aiFilmmaking._id });
  assert.equal(response.provider, 'course-knowledge-rule');
  assert.equal(api.calls.length, 0);
  assert.match(response.reply, /same face, same outfit/i);
  assert.match(response.reply, /USE THIS IMAGE \[saved last frame\] AS THE FIRST FRAME/);
  assert.doesNotMatch(response.reply, /AI Influencer|Original Reference Photo|newly generated image/i);
});

test('production path isolates direct AI Filmmaking course question from AI Influencer chunks', async () => {
  const aiFilmmaking = {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Create AI short films with consistent characters.',
    videos: [],
  };
  const aiInfluencer = {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'AI Influencer same original reference photo and exact same face guidance.',
    videos: [{ _id: 'influencer-face', title: 'Same Face', description: 'Do not use a newly generated image as reference.' }],
  };
  const api = backend({ courses: [aiFilmmaking, aiInfluencer], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
  const response = await api.chat({
    message: 'How do I keep the same character across clips?',
    activeCourseId: aiFilmmaking._id,
    conversationId: 'uat-direct-course-isolation',
    debugAi: true,
  });
  assert.equal(response.provider, 'course-knowledge-rule');
  assert.match(response.reply, /AI Filmmaking workflow|character reference sheet|same face, same outfit/i);
  assert.doesNotMatch(response.reply, /AI Influencer|same original reference photo|newly generated image/i);
  assert.equal(response.debug.retrieved_course_ids.length, 1);
  assert.equal(response.debug.retrieved_course_ids[0], aiFilmmaking._id);
  assert.ok(response.debug.retrieved_course_names.every(name => name === 'AI Filmmaking Course'));
});

test('production path keeps AI Filmmaking topic through exact follow-up prompt lookup', async () => {
  const aiFilmmaking = {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Create AI short films with consistent characters.',
    videos: [],
  };
  const aiInfluencer = {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'AI Influencer exact same face same woman prompts.',
    videos: [{ _id: 'same-face', title: 'Same Face', description: 'use the exact same face, same woman, same facial features' }],
  };
  const api = backend({ courses: [aiFilmmaking, aiInfluencer], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
  const history = [];
  async function turn(message, extra = {}) {
    const response = await api.chat({ message, history, conversationId: 'uat-multiturn-exact', debugAi: true, ...extra });
    history.push({ role: 'user', content: message }, { role: 'assistant', content: response.reply });
    return response;
  }

  const first = await turn('My character face changes between shots. How do I fix it?', { activeCourseId: aiFilmmaking._id });
  const second = await turn('Should I use the last frame too?');
  const third = await turn('And the character sheet?');
  const fourth = await turn('What exact line should I use?');

  for (const response of [first, second, third, fourth]) {
    assert.equal(response.debug.resolved_active_course_id, aiFilmmaking._id);
    assert.equal(response.debug.current_topic, 'face_consistency');
    assert.ok(response.debug.retrieved_course_ids.every(id => id === aiFilmmaking._id));
    assert.doesNotMatch(response.reply, /AI Influencer|same woman, same facial features/i);
  }
  assert.match(fourth.reply, /USE THIS IMAGE \[saved last frame\] AS THE FIRST FRAME/);
  assert.match(fourth.reply, /CHARACTER SHEET \[character reference sheet\]/);
  assert.equal(fourth.debug.selected_exact_prompt_template_id, 'ai-filmmaking.ingredients_face_fix.template');
});

test('production path allows explicit AI Influencer comparison without blended course answer', async () => {
  const aiFilmmaking = {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Use saved last frame and character sheet for film shot continuity.',
    videos: [],
  };
  const aiInfluencer = {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'Use one original reference photo for influencer identity.',
    videos: [],
  };
  const api = backend({ courses: [aiFilmmaking, aiInfluencer], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) }, reply: 'AI Filmmaking: use saved last frame + character sheet.\n\nAI Influencer: use the original reference photo. These are separate workflows.' });
  const history = [
    { role: 'user', content: 'My character face changes between shots. How do I fix it?' },
    { role: 'assistant', content: 'Use this AI Filmmaking workflow with saved last frame and character sheet.' },
  ];
  const response = await api.chat({
    message: 'How is this different from AI Influencer?',
    history,
    conversationId: 'uat-explicit-comparison',
    debugAi: true,
  });
  const prompt = api.calls[0].messages[0].content;
  assert.equal(response.provider, 'fal-openrouter');
  assert.match(prompt, /multiple courses may be compared/i);
  assert.match(prompt, /AI Filmmaking Course/);
  assert.match(prompt, /AI Influencer Course/);
  assert.match(response.reply, /AI Filmmaking:/);
  assert.match(response.reply, /AI Influencer:/);
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
  const first = ui.send('what is in this video'); await new Promise(resolve => setImmediate(resolve)); ui.resolve(); await first;
  assert.equal(ui.calls[0].lessonId, 'lesson-a');
  ui.setLesson({ courseId: 'course-a', lessonId: 'lesson-b' });
  const second = ui.send('iska summary batao'); await new Promise(resolve => setImmediate(resolve)); ui.resolve(); await second;
  assert.equal(ui.calls[1].lessonId, 'lesson-b');
  ui.setLesson(undefined);
  const third = ui.send('hello'); await new Promise(resolve => setImmediate(resolve)); ui.resolve(); await third;
  assert.equal(ui.calls[2].lessonId, '');
});

// Production-route checks for the product course; every provider call is a local fetch stub.
const qualityProductCourse = { _id: '6d0000000000000000000000', slug: 'ai-product-photoshoot-ads', title: 'AI Product Photoshoot & Ads', videos: [] };
function qualityBackend(options = {}) {
  return backend({ courses: [qualityProductCourse], user: { _id: 'learner' }, subscription: { status: 'active', currentPeriodEnd: new Date(Date.now()+86400000) }, ...options });
}

test('product exact prompt route uses a complete authorized template without a provider request', async () => {
  const api=qualityBackend();const r=await api.chat({courseId:qualityProductCourse._id,message:'Give exact L07 UGC 2 prompt for a painted wooden tray.',debugAi:true});
  assert.equal(api.calls.length,0);assert.equal(r.provider,'course-knowledge-rule');assert.equal(r.outcome.liveModelAnswer,false);
  assert.match(r.reply,/painted wooden tray/);assert.doesNotMatch(r.reply,/\[PRODUCT\]|\[painted wooden tray\]/);
  assert.match(r.reply,/NO phone visible anywhere.*NO background music\./s);
  assert.match(r.debug.selected_exact_prompt_template_id,/exact-template:l07-ugc-2/);
});

test('product procedural questions use source-linked localized workflow facts',async()=>{
  for(const [message,pattern] of [['What are the Lesson 06 video settings?',/Ingredients.*16:9.*Omni 1\.1 Flash.*720p.*6 sec.*x1/s],['Lesson 02 ka product sheet workflow Hinglish mein batao.',/photos.*Google Flow.*save/s],['Lesson 07 की सेटिंग हिंदी में बताओ।',/9:16.*720p.*8 sec/s]]){
    const api=qualityBackend();const r=await api.chat({courseId:qualityProductCourse._id,message});
    assert.match(r.reply,pattern);assert.equal(api.calls.length,0);assert.equal(r.outcome.type,'local_rule');
  }
});

test('product route never gives paid template bodies to an inactive learner',async()=>{
  const api=qualityBackend({subscription:null});await api.chat({courseId:qualityProductCourse._id,message:'Give exact L02 Product Sheet prompt for a glass vase.'});
  assert.equal(api.calls.length,1);assert.doesNotMatch(api.calls[0].messages[0].content,/Create a clean product reference sheet/);
});

test('product provider output with wrong language is marked as a local replacement',async()=>{
  const api=qualityBackend({reply:'Yeh guide hai, product sheet use karo.'});
  const r=await api.chat({courseId:qualityProductCourse._id,message:'Explain how composition affects advertising without drafting copy.',debugAi:true});
  assert.equal(api.calls.length,1);assert.equal(r.provider,'course-response-policy');assert.equal(r.outcome.liveModelAnswer,false);
  assert.equal(r.outcome.responseIssue,'response_language_mismatch');assert.equal(r.debug.provider.status,'success');
  assert.doesNotMatch(r.reply,/use karo|Yeh guide/);
});

test('product policy catches an invented first-person endorsement in an otherwise successful provider answer',async()=>{
  const api=qualityBackend({reply:'No fake claims. I personally loved this item!'});
  const r=await api.chat({courseId:qualityProductCourse._id,message:'Explain how composition affects advertising without drafting copy.'});
  assert.equal(r.provider,'course-response-policy');assert.equal(r.outcome.liveModelAnswer,false);
  assert.match(r.reply,/not a real customer/);assert.doesNotMatch(r.reply,/personally loved/);
});

test('product safety refusal works without paid material and without calling a provider',async()=>{
  const api=qualityBackend({subscription:null});
  const r=await api.chat({courseId:qualityProductCourse._id,message:'Can an AI actor claim it is a real customer who loved the product?'});
  assert.equal(api.calls.length,0);assert.match(r.reply,/not a real customer/);assert.equal(r.outcome.type,'local_rule');
});

test('product provider failures retain relevant guidance with safe diagnostic status',async()=>{
  const api=qualityBackend({fail:true});
  const r=await api.chat({courseId:qualityProductCourse._id,message:'Explain how composition affects advertising without drafting copy.',debugAi:true});
  assert.equal(api.calls.length,2);assert.equal(r.provider,'built-in-course-guide');assert.equal(r.outcome.type,'provider_fallback');
  assert.equal(r.outcome.liveModelAnswer,false);assert.equal(r.debug.provider.status,'connection_error');assert.equal(r.debug.provider.attempts.length,2);
  assert.ok(r.notice);assert.doesNotMatch(JSON.stringify(r.debug.provider),/Provider offline|test|Authorization/);
});

test('unconfigured provider is explicitly fallback rather than a live answer',async()=>{
  const api=qualityBackend({noKey:true});
  const r=await api.chat({courseId:qualityProductCourse._id,message:'Explain how composition affects advertising without drafting copy.'});
  assert.equal(api.calls.length,0);assert.equal(r.outcome.providerStatus,'not_configured');assert.equal(r.outcome.type,'provider_fallback');
});

test('phase3 negated platform terms cannot reroute a supplied product price to subscription facts',async()=>{
  for(const suffix of ['Do not discuss a Skillomate subscription.','This is about my product, not the platform plan.','Ignore the subscription; use my product price.']){
    const api=qualityBackend();const r=await api.chat({courseId:qualityProductCourse._id,message:`I sell a woven coin purse on Etsy for 389 rupees. Plan an ad. ${suffix}`});
    assert.equal(r.provider,'course-knowledge-rule');assert.match(r.reply,/woven coin purse.*389/s);
    assert.doesNotMatch(r.reply,/PhonePe|₹499|Premium access/);assert.equal(api.calls.length,0);
  }
  const api=qualityBackend();const r=await api.chat({courseId:qualityProductCourse._id,message:'I sell a product. Separately, what is the Skillomate subscription price?'});
  assert.equal(r.provider,'skillomate-plan-facts');assert.match(r.reply,/₹499/);
});

test('phase3 persisted product memory survives omitted client history and stays within learner and conversation',async()=>{
  const sessions=new Map();const a=qualityBackend({sessions,userId:'synthetic-a'});
  await a.chat({courseId:qualityProductCourse._id,conversationId:'draft-a',message:'I sell a felt desk organiser on Etsy. Price is 1190. Material: wool. Lesson 05. Plan an ad.'});
  const r=await a.chat({courseId:qualityProductCourse._id,conversationId:'draft-a',message:'Use angle 2 and write a caption.'});
  assert.match(r.reply,/Caption:.*felt desk organiser.*1190.*Etsy/s);assert.match(r.reply,/Known price and ordering details/);
  assert.equal(a.calls.length,0);assert.ok([...sessions.values()][0].productContext);
  const b=qualityBackend({sessions,userId:'synthetic-b'});
  const other=await b.chat({courseId:qualityProductCourse._id,conversationId:'draft-b',message:'Write a caption.'});
  assert.doesNotMatch(other.reply,/felt desk organiser|1190|Etsy/);assert.match(other.reply,/Which product/);
  const fresh=await a.chat({courseId:qualityProductCourse._id,conversationId:'new-chat',message:'Write a caption.'});
  assert.doesNotMatch(fresh.reply,/felt desk organiser|1190|Etsy/);assert.match(fresh.reply,/Which product/);
});

test('phase3 persisted facts from a different active course are not reused',async()=>{
  const sessions=new Map([[`synthetic-a:${qualityProductCourse._id}`,{activeCourseId:'different-course',conversationId:'shared',productContext:{product:'foreign course notebook',price:'8290'}}]]);
  const api=qualityBackend({sessions,userId:'synthetic-a'});
  const result=await api.chat({courseId:qualityProductCourse._id,conversationId:'shared',message:'Write a caption.'});
  assert.match(result.reply,/Which product/);assert.doesNotMatch(result.reply,/foreign course notebook|8290/);
});
