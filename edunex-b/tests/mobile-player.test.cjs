const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parser = require('../../edunex-f/node_modules/@babel/parser');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../appcopyai/App.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
const nodes = [];
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type) nodes.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'loc') continue;
    if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
  }
}
visit(ast);
const declaration = name => nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === name);
const compile = (node, context) => vm.runInNewContext(`(${source.slice(node.start, node.end)})`, context);
function navigation(preview) {
  const state = { mainScreen: 'courses', startIndex: 1, selectedCourse: { _id: 'course', videos: [{ _id: 'lesson' }] }, initialTime: 42, isPreviewOnly: preview, preloadedVideos: null };
  let refreshes = 0;
  const context = { ...state, userRef: { current: { _id: 'user' } }, legalPage: null, courseAiTarget: null, certModal: null, showAppUpgrade: false, loadCourseProgress: () => refreshes++ };
  for (const name of Object.keys(state)) context[`set${name[0].toUpperCase()}${name.slice(1)}`] = value => { state[name] = value; context[name] = value; };
  context.backToLessons = compile(declaration('backToLessons').init.arguments[0], context);
  const hardware = nodes.findLast(n => n.type === 'CallExpression' && n.callee?.object?.name === 'BackHandler' && n.arguments[0]?.value === 'hardwareBackPress');
  return { state, context, back: compile(hardware.arguments[1], context), refreshes: () => refreshes };
}
for (const preview of [false, true]) {
  test(`Back exits ${preview ? 'preview' : 'enrolled'} playback one level and keeps lessons`, () => {
    const n = navigation(preview);
    assert.equal(n.back(), true);
    assert.equal(n.state.mainScreen, 'courses');
    assert.equal(n.state.selectedCourse._id, 'course');
    assert.equal(n.state.startIndex, null);
    assert.equal(n.state.initialTime, 0);
    assert.equal(n.state.preloadedVideos[0]._id, 'lesson');
    assert.equal(n.refreshes(), preview ? 0 : 1);
  });
}
test('on-screen Back uses the same lesson-preserving transition', () => {
  const component = nodes.find(n => n.type === 'JSXOpeningElement' && n.name.name === 'ReelsScreen');
  const handler = component.attributes.find(a => a.name?.name === 'onBack').value.expression;
  const n = navigation(false);
  compile(handler, n.context)();
  assert.equal(n.state.startIndex, null);
  assert.equal(n.state.selectedCourse._id, 'course');
});
test('player overlays cover the screen with the React Native 0.86 StyleSheet API', () => {
  const properties = nodes.find(n => n.type === 'CallExpression' && n.callee?.object?.name === 'StyleSheet' && n.arguments[0]?.properties?.some(p => p.key?.name === 'pauseOverlay')).arguments[0].properties;
  const context = { StyleSheet: { absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } };
  for (const name of ['pauseOverlay', 'restartOverlay']) {
    const style = compile(properties.find(p => p.key.name === name).value, context);
    assert.equal(style.position, 'absolute');
    for (const edge of ['top', 'bottom', 'left', 'right']) assert.equal(style[edge], 0);
    assert.equal(style.justifyContent, 'center');
  }
  const style = compile(properties.find(p => p.key.name === 'player').value, context);
  assert.equal(style.flexShrink, 0);
  assert.equal(style.overflow, 'hidden');
});

test('uploaded CloudFront lesson thumbnails win over provider guesses', () => {
  const context = { API_BASE: 'https://api.example', getBunnyGuid: () => '', getCourseThumbnailUri: () => 'https://api.example/course.jpg' };
  for (const name of ['getGoogleDriveFileId', 'normalizeThumbnailUrl', 'getLessonThumbnailUrl', 'getHomeLessonThumbnailUrl']) {
    context[name] = compile(nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name), context);
  }
  assert.equal(context.getHomeLessonThumbnailUrl({ provider: 'aws_cloudfront', thumbnailUrl: '/uploads/lesson.jpg' }, {}), 'https://api.example/uploads/lesson.jpg');
  assert.equal(context.getHomeLessonThumbnailUrl({ thumbnailVerticalUrl: 'https://cdn.example/portrait.jpg' }, {}), 'https://cdn.example/portrait.jpg');
  assert.equal(context.getHomeLessonThumbnailUrl({ provider: 'aws_cloudfront', videoId: 'database-id' }, {}), 'https://api.example/course.jpg');
});

test('mute and playback speed changes do not trigger a source reload', () => {
  const effect = nodes.find(n => n.type === 'CallExpression' && n.callee.name === 'useEffect' && source.slice(n.arguments[0].start, n.arguments[0].end).includes('player.replaceAsync'));
  assert.ok(effect);
  const dependencies = effect.arguments[1].elements.map(dependency => source.slice(dependency.start, dependency.end));
  assert.ok(dependencies.includes('nativeVideoSource'));
  for (const state of ['isMuted', 'playbackRate', 'isActive']) assert.equal(dependencies.includes(state), false);
});

test('AI suggestions disappear after the first user message', () => {
  const hasConversation = declaration('hasConversation').init;
  assert.equal(compile(hasConversation, { messages: [{ role: 'assistant' }], loading: false }), false);
  assert.equal(compile(hasConversation, { messages: [{ role: 'user' }, { role: 'assistant' }], loading: false }), true);
  const courseCondition = nodes.find(n => n.type === 'LogicalExpression' && source.slice(n.start, n.end) === '!courseAiLoading && !courseAiMessages.some(message => message.role === "user")');
  assert.ok(courseCondition);
  assert.equal(compile(courseCondition, { courseAiMessages: [{ role: 'assistant' }], courseAiLoading: false }), true);
  assert.equal(compile(courseCondition, { courseAiMessages: [{ role: 'user' }], courseAiLoading: false }), false);
});

test('mobile JSON requests time out while waiting for response data', async () => {
  let expire, cleared=false;
  const fn=compile(nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='fetchApiJson'), {
    API_BASE:'https://api.example', AbortController,
    setTimeout(callback){expire=callback;return 1;}, clearTimeout(){cleared=true;},
    fetch:async (_url,{signal})=>({ok:true,signal}),
    readJsonResponse:res=>new Promise((resolve,reject)=>res.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Timed out'),{name:'AbortError'}))))
  });
  const pending=fn('/courses');
  await new Promise(resolve => setImmediate(resolve));
  expire();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(cleared,true);
});
test('mobile JSON requests honor cancellation and reject HTTP failures', async()=>{
  const fn=compile(nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='fetchApiJson'), {
    API_BASE:'https://api.example',AbortController,setTimeout,clearTimeout,
    fetch:async(_url,{signal})=>{assert.equal(signal.aborted,true);return {ok:false,status:503};},
    readJsonResponse:async()=>({error:'Unavailable'})
  });
  const controller=new AbortController();controller.abort();
  await assert.rejects(fn('/courses',null,controller.signal),/Unavailable/);
});

test('Home displays course metadata before its playback request finishes',async()=>{
  const state={};let finishPlayback;
  const context={cancelled:false,homeAbort:new AbortController(),homeCatalogCourse:null,hasAccess:true,user:{_id:'u',sessionId:'s'},
    setLoading:value=>state.loading=value,setLoadError:value=>state.error=value,setPrimaryCourse:value=>state.course=value,
    fetchApiJson:async path=>path.includes('/top')?[{_id:'c',title:'Course',videos:[{_id:'v'}]}]:[],
    session:{requestJson:async()=>new Promise(resolve=>{finishPlayback=resolve;})}};
  const load=compile(nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadPrimaryCourse'),context);
  const pending=load();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.course._id,'c');assert.equal(state.loading,false);
  finishPlayback({videos:[{_id:'v',playbackRequired:true}]});await pending;
  assert.equal(state.course.__homePlayableVideos,true);
});

test('leaving playback tolerates an already released native player',()=>{
  const nativePlayer={pause(){throw new Error('Native player released');}};
  const runNativePlayer=compile(declaration('runNativePlayer').init.arguments[0],{nativePlayer});
  assert.doesNotThrow(()=>runNativePlayer(player=>player.pause()));
  assert.equal(runNativePlayer(player=>player.pause()),undefined);
  assert.match(source,/return \(\) => \{\s*cancelled = true;[\s\S]{0,300}?pauseNativePlayer\(\);\s*\};/);
});
