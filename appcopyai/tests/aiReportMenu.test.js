const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = require('node:fs').readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
function collect(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) collect(child, predicate, result);
  return result;
}
const slice = node => source.slice(node.start, node.end);
const reasonsNode = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'AI_REPORT_REASONS');
const reasons = vm.runInNewContext(slice(reasonsNode.init));
function fixture(request = async () => ({ message: 'Received' })) {
  const alerts = [], requests = [];
  const c = { AI_REPORT_REASONS: reasons, reportMessage: null, reportBusy: false, reportError: '',
    aiMounted: { current: true }, reportInFlight: { current: false }, reportGeneration: { current: 1 },
    Alert: { alert: (...args) => alerts.push(args) },
    session: { requestJson: async (...args) => { requests.push(args); return request(...args); } },
  };
  for (const [setter, key] of Object.entries({ setReportMessage: 'reportMessage', setReportBusy: 'reportBusy', setReportError: 'reportError' })) c[setter] = value => { c[key] = value; };
  vm.createContext(c);
  for (const name of ['reportAiResponse', 'submitAiReport']) {
    const fn = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === name);
    vm.runInContext(slice(fn), c);
  }
  return { c, alerts, requests };
}

test('reporting opens the custom menu rather than a native multi-button alert', () => {
  const f = fixture(); f.c.reportAiResponse({ id: 'response-1', content: 'Answer' });
  assert.equal(f.c.reportMessage.id, 'response-1'); assert.deepEqual(f.alerts, []);
  f.c.reportAiResponse({ content: 'Old answer' }); assert.equal(f.alerts[0][0], 'Report unavailable');
});

test('every reason, including Privacy and Other, submits the intended response and backend reason', async () => {
  assert.deepEqual(Array.from(reasons, item => item[1]), ['incorrect', 'harmful_or_unsafe', 'inappropriate', 'privacy_concern', 'other']);
  for (const [, reason] of reasons) {
    const f = fixture(); f.c.reportAiResponse({ id: 'response-1', content: 'Answer' }); await f.c.submitAiReport(reason);
    assert.equal(f.requests[0][0], '/api/ai/reports');
    assert.deepEqual(JSON.parse(f.requests[0][1].body), { messageId: 'response-1', reason, response: 'Answer' });
    assert.equal(f.c.reportMessage, null); assert.equal(f.alerts[0][0], 'Report received'); assert.equal(f.c.reportBusy, false);
  }
});

test('failed submissions stay open with a retry message and allow another attempt', async () => {
  let online = false;
  const f = fixture(async () => { if (!online) throw new Error('network'); return {}; });
  f.c.reportAiResponse({ id: 'response-1', content: 'Answer' }); await f.c.submitAiReport('privacy_concern');
  assert.equal(f.c.reportMessage.id, 'response-1'); assert.match(f.c.reportError, /not sent/); assert.equal(f.c.reportBusy, false);
  online = true; await f.c.submitAiReport('privacy_concern');
  assert.equal(f.requests.length, 2); assert.equal(f.c.reportMessage, null); assert.equal(f.c.reportError, '');
});

test('rapid taps cannot submit two reports or replace the message in flight', async () => {
  let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
  f.c.reportAiResponse({ id: 'first', content: 'First' }); const pending = f.c.submitAiReport('other');
  await f.c.submitAiReport('incorrect'); f.c.reportAiResponse({ id: 'second', content: 'Second' });
  assert.equal(f.requests.length, 1); assert.equal(f.c.reportMessage.id, 'first'); assert.equal(f.c.reportBusy, true);
  resolve({}); await pending; assert.equal(f.c.reportInFlight.current, false);
});

test('late report responses after unmount or account change cannot show confirmation', async () => {
  for (const change of [c => { c.aiMounted.current = false; }, c => { c.reportGeneration.current++; }]) {
    let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
    f.c.reportAiResponse({ id: 'first', content: 'Answer' }); const pending = f.c.submitAiReport('other');
    change(f.c); resolve({}); await pending;
    assert.deepEqual(f.alerts, []);
  }
});

test('custom modal renders all five reasons plus Cancel, supports scrolling and disables duplicate taps', () => {
  const component = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'AiReportReasonModal');
  const code = babel.transformSync(slice(component), { configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx')] }).code;
  const c = { AI_REPORT_REASONS: reasons, C: {}, React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) } };
  for (const name of ['Modal', 'SafeAreaView', 'View', 'Text', 'ScrollView', 'TouchableOpacity', 'ActivityIndicator']) c[name] = name;
  vm.createContext(c); vm.runInContext(code, c);
  for (const busy of [false, true]) {
    let cancelled = 0; const selected = [];
    const tree = c.AiReportReasonModal({ visible: true, busy, error: '', onClose: () => cancelled++, onSubmit: reason => selected.push(reason) });
    const buttons = collect(tree, node => node.type === 'TouchableOpacity');
    assert.equal(buttons.length, 6); assert.ok(find(tree, node => node.type === 'ScrollView'));
    for (const [index, button] of buttons.entries()) {
      assert.equal(button.props.disabled, busy);
      if (!busy) button.props.onPress();
      if (index < 5) assert.equal(button.props.accessibilityLabel, `Report AI response: ${reasons[index][0]}`);
    }
    assert.equal(buttons[5].props.accessibilityLabel, 'Cancel AI response report');
    assert.equal(cancelled, busy ? 0 : 1);
    assert.equal(selected.length, busy ? 0 : 5);
    tree.props.onRequestClose(); assert.equal(cancelled, busy ? 0 : 2);
  }
});
