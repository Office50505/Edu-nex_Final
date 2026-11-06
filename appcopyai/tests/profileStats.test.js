const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const profile = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'ProfileScreen');
const effect = profile.body.body.find(node => node.type === 'ExpressionStatement' && node.expression.callee?.name === 'useEffect').expression.arguments[0];
const value = profile.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id?.name === 'statisticValue'));
const slice = node => source.slice(node.start, node.end);
function fixture(request) {
  const c = { user: { _id: 'learner' }, refreshing: false, learningStats: null, learningStatsError: false,
    session: { requestJson: request }, setLearningStats: data => { c.learningStats = data; }, setLearningStatsError: error => { c.learningStatsError = error; } };
  vm.createContext(c); vm.runInContext(`${slice(value)}\nthis.value = statisticValue;`, c);
  return { c, load: () => vm.runInContext(`(${slice(effect)})()`, c) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Profile loads account statistics and shows real counts, including zero', async () => {
  const f = fixture(async url => { assert.equal(url, '/api/user/learner/learning-stats'); return { daysLearning: 3, coursesDone: 0 }; });
  f.load();
  assert.equal(f.c.value('daysLearning'), 'Loading…');
  await settle();
  assert.equal(f.c.value('daysLearning'), '3');
  assert.equal(f.c.value('coursesDone'), '0');
});

test('errors and malformed counts show N/A rather than a fabricated zero', async () => {
  for (const request of [async () => { throw Error('offline'); }, async () => ({ daysLearning: -1, coursesDone: 3 })]) {
    const f = fixture(request); f.load(); await settle();
    assert.equal(f.c.value('daysLearning'), 'N/A');
    assert.equal(f.c.value('coursesDone'), 'N/A');
  }
});

test('unmounting or switching accounts prevents late results from updating Profile', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const cleanup = f.load(); cleanup();
  resolve({ daysLearning: 99, coursesDone: 99 }); await settle();
  assert.equal(f.c.learningStats, null);
});

test('a profile refresh can retry after a failed request', async () => {
  const f = fixture(async () => { throw Error('offline'); });
  f.load(); await settle();
  f.c.session.requestJson = async () => ({ daysLearning: 2, coursesDone: 1 });
  f.load(); await settle();
  assert.equal(f.c.learningStatsError, false);
  assert.equal(f.c.value('coursesDone'), '1');
});
