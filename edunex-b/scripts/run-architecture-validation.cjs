const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const testsPath = path.join(__dirname, '../tests/architecture_validation_tests.json');
const resultsPath = path.join(__dirname, '../reports/architecture_validation_results.json');
const testSuite = JSON.parse(fs.readFileSync(testsPath, 'utf8'));
const { retrieveKnowledge } = require('../services/tutorKnowledge');
const { aiFilmmakingDirectReply } = require('../services/aiTutorService');

const COURSES = {
  filmmaking: {
    _id: '6abe5bb2bced21d7211be185',
    slug: 'ai-filmmaking-course',
    title: 'AI Filmmaking Course',
    description: 'Create AI short films with story, shots, voice, editing, Google Flow, ElevenLabs, and CapCut.',
    videos: [
      { _id: 'film-tools', title: 'Tools Setup', description: 'Set up Google Flow, ChatGPT, ElevenLabs, and CapCut.' },
      { _id: 'film-consistency', title: 'Character Consistency', description: 'Use locked character references, same face prompts, Start frame, and Ingredients mode.' },
    ],
  },
  influencer: {
    _id: '6a9e67c46bcb631b8118d341',
    slug: 'ai-influencer-course',
    title: 'AI Influencer Course',
    description: 'INFLUENCER_SENTINEL Create consistent AI influencer images and videos using an Original Reference Photo workflow.',
    videos: [
      { _id: 'influencer-face', title: 'Same Face Every Time', description: 'INFLUENCER_SENTINEL Original Reference Photo for AI influencer identity.' },
    ],
  },
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasText(text, needle) {
  return String(text || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function matches(text, pattern) {
  return new RegExp(pattern, 'i').test(String(text || ''));
}

function courseFor(key) {
  return COURSES[key] || null;
}

function filterCourses(courses, query) {
  if (!query?._id && !query?.slug) return courses;
  return courses.filter(course => {
    if (query._id && String(course._id) !== String(query._id)) return false;
    if (query.slug && String(course.slug) !== String(query.slug)) return false;
    return true;
  });
}

function createBackend({ courses, providerFail = false, providerReply = 'Provider answer' } = {}) {
  const routes = {};
  const calls = [];
  const queries = [];
  let lastQuery = null;
  const queryApi = {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return filterCourses(courses, lastQuery); },
  };
  const sandbox = {
    require(name) {
      if (name === 'node:crypto') return require('node:crypto');
      if (name.includes('aiTutorService')) return serviceModule.exports;
      if (name === 'express') return { Router: () => ({
        get() {}, put() {}, delete() {},
        post: (url, ...handlers) => { routes[url] = handlers.at(-1); },
      }) };
      if (name.includes('aiCompliance')) return require('../services/aiCompliance');
      if (name.includes('tutorKnowledge')) return require('../services/tutorKnowledge');
      if (name.includes('AiTutorSession')) return { findOneAndUpdate: async () => ({}) };
      if (name.includes('AiResponseReport')) return { create: async () => ({}) };
      if (name.includes('/models/User')) return { updateOne: async () => ({}) };
      if (name.includes('Subscription')) return { findOne: () => ({ lean: async () => ({ status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) }) }) };
      if (name.includes('Course')) return { find: (query) => { lastQuery = query; queries.push(query); return queryApi; } };
      return { requireCompatibleAuth: () => () => {} };
    },
    module: { exports: {} }, AbortSignal, process: { env: { FAL_KEY: 'test' } }, console,
    fetch: async (_, request) => {
      calls.push(JSON.parse(request.body));
      if (providerFail) throw new Error('Provider offline');
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: providerReply } }] }) };
    },
  };
  const serviceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/aiTutorService.js'), 'utf8'), { ...sandbox, module: serviceModule });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8'), sandbox);
  return {
    calls,
    queries,
    async chat(body) {
      let result;
      let statusCode = 200;
      await routes['/chat'](
        { body, compatUser: { _id: 'architecture-fixture' }, compatAuth: { userId: 'architecture-fixture' }, ip: '127.0.0.1' },
        { json(data) { result = data; return data; }, status(code) { statusCode = code; return this; } }
      );
      return { result, statusCode, calls, queries };
    },
  };
}

function assertExpectation(test, subject, meta = {}) {
  const failures = [];
  const expect = test.expect || {};
  for (const value of expect.contains || []) {
    if (!hasText(subject, value)) failures.push(`missing text: ${value}`);
  }
  for (const value of expect.notContains || []) {
    if (hasText(subject, value)) failures.push(`forbidden text present: ${value}`);
  }
  for (const pattern of expect.matches || []) {
    if (!matches(subject, pattern)) failures.push(`pattern did not match: ${pattern}`);
  }
  for (const pattern of expect.notMatches || []) {
    if (matches(subject, pattern)) failures.push(`forbidden pattern matched: ${pattern}`);
  }
  if (expect.provider && meta.provider !== expect.provider) failures.push(`provider ${meta.provider || 'none'} !== ${expect.provider}`);
  if (expect.courseScoped !== undefined && meta.courseScoped !== expect.courseScoped) failures.push(`courseScoped ${meta.courseScoped} !== ${expect.courseScoped}`);
  if (expect.courseQueryScoped !== undefined) {
    const query = meta.query || {};
    const scoped = Boolean(query._id || query.slug);
    if (scoped !== expect.courseQueryScoped) failures.push(`course query scoped ${scoped} !== ${expect.courseQueryScoped}`);
  }
  return failures;
}

async function runTest(test) {
  const activeCourse = courseFor(test.activeCourse);
  const courses = [COURSES.filmmaking, COURSES.influencer];
  if (test.type === 'directFilmmaking') {
    const output = aiFilmmakingDirectReply({
      message: test.message,
      courseId: activeCourse?._id || activeCourse?.slug || '',
      knowledge: { activeCourse, courseSlugs: courses.map(course => course.slug) },
      history: test.history || [],
    });
    return { output, meta: { provider: output ? 'course-knowledge-rule' : 'none' } };
  }
  if (test.type === 'retrieve') {
    const result = retrieveKnowledge({
      courses,
      message: test.message,
      includeMaterials: true,
      activeCourse,
      allowCrossCourse: false,
    });
    return { output: result.excerpts, meta: { courseScoped: result.courseScoped } };
  }
  if (test.type === 'chat' || test.type === 'promptContext') {
    const api = createBackend({ courses, providerFail: Boolean(test.providerFail) });
    const body = {
      message: test.message,
      history: test.history || [],
      ...(activeCourse ? { courseId: activeCourse._id } : {}),
    };
    const response = await api.chat(body);
    const prompt = api.calls[0]?.messages?.[0]?.content || '';
    const output = test.type === 'promptContext' ? prompt : (response.result?.reply || response.result?.answer || '');
    return {
      output,
      meta: {
        provider: response.result?.provider,
        query: api.queries[0],
        statusCode: response.statusCode,
      },
    };
  }
  throw new Error(`Unknown test type: ${test.type}`);
}

(async () => {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const test of testSuite.tests) {
    try {
      const { output, meta } = await runTest(test);
      const failures = assertExpectation(test, output, meta);
      results.push({
        id: test.id,
        category: test.category,
        status: failures.length ? 'fail' : 'pass',
        failures,
        provider: meta.provider || null,
        outputSample: String(output || '').slice(0, 600),
      });
    } catch (error) {
      results.push({
        id: test.id,
        category: test.category,
        status: 'error',
        failures: [error.message],
        provider: null,
        outputSample: '',
      });
    }
  }
  const summary = {
    total: results.length,
    passed: results.filter(result => result.status === 'pass').length,
    failed: results.filter(result => result.status !== 'pass').length,
    failedIds: results.filter(result => result.status !== 'pass').map(result => result.id),
  };
  const report = {
    suite: testSuite.suite,
    version: testSuite.version,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary,
    results,
  };
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ resultsPath, summary }, null, 2));
  if (summary.failed) process.exitCode = 1;
})();
