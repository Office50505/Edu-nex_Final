const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const { subscriptionPresentation } = require('../services/subscriptionPresentation');

// Exercise the actual membership component's rendered buttons and callbacks.
const appSource = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const source = appSource.slice(appSource.indexOf('function appleSubscriptionPriceCopy('), appSource.indexOf('const PROBLEM_REPORT_CATEGORIES'));
const compiled = babel.transformSync(source, {
  babelrc: false, configFile: false,
  plugins: [require.resolve('@babel/plugin-transform-react-jsx')],
}).code;

function fixture({ platform = 'android', refresh, working = false } = {}) {
  let index = 0, refIndex = 0, closed = 0, opened = 0, purchased = 0;
  const states = [], refs = [];
  const context = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    Platform: { OS: platform }, StyleSheet: { absoluteFill: {} }, C: {}, s: {},
    Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
    ScrollView: 'ScrollView', Ionicons: 'Ionicons', ActivityIndicator: 'ActivityIndicator',
    useEffect() {},
    useRef(value) { const i = refIndex++; return refs[i] ||= { current: value }; },
    useState(value) {
      const i = index++;
      if (!(i in states)) states[i] = value;
      return [states[i], next => { states[i] = next; }];
    },
    subscriptionPresentation,
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  const props = {
    visible: true, onClose: () => closed++, onOpenSubscription: () => opened++,
    appleSubscription: {
      working, purchaseReady: true, productLoadStatus: 'ready', localizedPrice: '₹99',
      purchase: () => purchased++, restore() {}, refreshAccess: refresh,
    },
  };
  function render() { index = 0; refIndex = 0; return context.UpgradeModal(props); }
  function nodes(node, result = []) {
    if (!node || typeof node !== 'object') return result;
    if (Array.isArray(node)) { node.forEach(child => nodes(child, result)); return result; }
    result.push(node);
    nodes(node.props?.children, result);
    return result;
  }
  return {
    render, nodes,
    button(tree, label) { return nodes(tree).find(node => node.props?.accessibilityLabel === label); },
    counts: () => ({ closed, opened, purchased }),
  };
}

test('both platforms offer their native subscribe action and access refresh', () => {
  for (const [platform, store] of [['android', 'Google Play'], ['ios', 'App Store']]) {
    const f = fixture({ platform });
    const tree = f.render();
    const subscribe = f.button(tree, `Subscribe with ${store}`);
    assert.equal(subscribe.props.disabled, false);
    subscribe.props.onPress();
    assert.equal(f.counts().purchased, 1);
    assert.ok(f.button(tree, 'Refresh membership access'));
  }
});

test('verified access closes the gate without starting a purchase', async () => {
  const f = fixture({ refresh: async () => ({ entitlementState: 'ACTIVE', entitlementActive: true, subscriptionExpiry: '2099-01-01' }) });
  await f.button(f.render(), 'Refresh membership access').props.onPress();
  assert.deepEqual(f.counts(), { closed: 1, opened: 0, purchased: 0 });
});

test('inactive and failed refreshes stay open with actionable feedback', async () => {
  for (const [refresh, message] of [
    [async () => ({ entitlementState: 'NONE', entitlementActive: false }), 'No active membership found'],
    [async () => { throw Error('offline'); }, 'Could not refresh access'],
  ]) {
    const f = fixture({ refresh });
    await f.button(f.render(), 'Refresh membership access').props.onPress();
    const feedback = f.nodes(f.render()).find(node => node.props?.accessibilityLiveRegion === 'polite');
    assert.ok(feedback.props.children.join('').includes(message));
    assert.equal(f.counts().closed, 0);
    assert.equal(f.counts().purchased, 0);
  }
});

test('rapid refresh taps make one request and disable billing actions until finished', async () => {
  let calls = 0, resolve;
  const f = fixture({ refresh: () => { calls++; return new Promise(done => { resolve = done; }); } });
  const press = f.button(f.render(), 'Refresh membership access').props.onPress;
  const first = press();
  await press();
  assert.equal(calls, 1);
  assert.equal(f.button(f.render(), 'Subscribe with Google Play').props.disabled, true);
  resolve({ entitlementState: 'NONE' });
  await first;
  assert.equal(f.button(f.render(), 'Refresh membership access').props.disabled, false);
});

test('refresh is blocked while a purchase is running', async () => {
  let calls = 0;
  const f = fixture({ working: true, refresh: async () => calls++ });
  const button = f.button(f.render(), 'Refresh membership access');
  assert.equal(button.props.disabled, true);
  await button.props.onPress();
  assert.equal(calls, 0);
});

test('subscription details remains a fallback when refresh is unavailable', async () => {
  const f = fixture();
  await f.button(f.render(), 'Refresh membership access').props.onPress();
  assert.deepEqual(f.counts(), { closed: 1, opened: 1, purchased: 0 });
});
