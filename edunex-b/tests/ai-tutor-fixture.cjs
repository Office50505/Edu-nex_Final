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
      if (name.includes('tutorKnowledge')) {
        const knowledge = options.knowledgeModule || require('../services/tutorKnowledge');
        return options.knowledgeTransform ? { ...knowledge, retrieveKnowledge: input => options.knowledgeTransform(knowledge.retrieveKnowledge(input)) } : knowledge;
      }
      if (name === './productTutorState') return require('../services/productTutorState');
      if (name === './tutorProvider') return require('../services/tutorProvider');
      if (name === './productTutorResponse') return require('../services/productTutorResponse');
      if (name.endsWith('/subscriptionAccess')) return require('../services/subscriptionAccess');
      if (name.endsWith('/AppleSubscription')) return { findOne: () => ({ lean: async () => options.apple || null }) };
      if (name.endsWith('/GooglePlaySubscription')) return { findOne: () => ({ lean: async () => options.google || null }) };
      if (name.endsWith('/Subscription')) return { findOne: () => ({ lean: async () => options.subscription || null }) };
      if (name.endsWith('/Order')) return { findOne: () => ({ select() { return this; }, sort() { return this; }, lean: async () => options.order || null }) };
      if (name.includes('Course')) return { find: () => query,
        findOne: () => ({sort(){return this;},select(){return this;},lean:async()=>options.trialCourse||null}) };
      return { requireCompatibleAuth: () => () => {} };
    },
    module: { exports: {} }, AbortSignal, process: { env: { FAL_KEY: options.noKey ? '' : 'test' } }, console,
    fetch: async (_, request) => {
      calls.push(JSON.parse(request.body));
      if (options.fail || options.failAt?.includes(calls.length)) throw new Error("Provider offline");
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: options.replies?.[calls.length-1] ?? options.reply ?? 'Example answer' } }] }) };
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


module.exports={backend};
