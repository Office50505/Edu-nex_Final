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
  compile(handler, { ...n.context, close: n.context.backToLessons })();
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
    TOP_COURSES_CACHE_KEY:'top',ALL_COURSES_CACHE_KEY:'all',networkApplied:false,
    fetchCourseCatalog:async(_key,path)=>path.includes('summary=home')?[{_id:'c',title:'Course',videos:[{_id:'v'}]}]:[],
    courseArray:value=>Array.isArray(value)?value:[],
    selectHomeCatalogCourse:value=>value[0]||null,
    prefetchHomeCourseThumbnails:()=>{},
    session:{requestJson:async()=>new Promise(resolve=>{finishPlayback=resolve;})}};
  const load=compile(nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadPrimaryCourse'),context);
  const pending=load();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.course._id,'c');assert.equal(state.loading,false);
  finishPlayback({videos:[{_id:'v',playbackRequired:true}]});await pending;
  assert.equal(state.course.__homePlayableVideos,true);
});

test('Home uses the lightweight thumbnail-ready catalogue and warms it during session restore', () => {
  assert.match(source, /fetchCourseCatalog\(TOP_COURSES_CACHE_KEY, "\/api\/courses\?summary=home"\)/);
  assert.match(source, /"\/api\/courses\?summary=home",\s*\{ maxCacheAgeMs: 15000 \}/);
  assert.match(source, /prefetchHomeCourseThumbnails\(course\)/);
});

test('native Bunny playback enables cache and uses anti-stall buffer settings', () => {
  const sourceFactory = compile(nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'videoSourceFromUri'), {
    Platform: { OS: 'android' },
  });
  const hls = sourceFactory('https://edunex.b-cdn.net/video-id/playlist.m3u8');
  assert.equal(hls.contentType, 'hls');
  assert.equal(hls.useCaching, true);
  assert.equal(sourceFactory('https://private.example/video.m3u8').useCaching, false);
  assert.match(source, /preferredForwardBufferDuration:\s*45/);
  assert.match(source, /minBufferForPlayback:\s*2\.5/);
  assert.match(source, /prioritizeTimeOverSizeThreshold:\s*true/);
  assert.match(source, /player\.bufferOptions = NATIVE_VIDEO_BUFFER_OPTIONS/);
});

test('player mounts network media only for the active visible lesson', () => {
  assert.match(source, /const shouldMountMediaSurface = Boolean\(isActive && !suspendSurface\)/);
  assert.match(source, /shouldMountMediaSurface \? videoSourceFromUri\(nativeVideoUrl\) : null/);
  assert.match(source, /const showLiveSurface = shouldMountMediaSurface/);
  assert.match(source, /showLiveSurface && renderPlayerChrome/);
  assert.match(source, /removeClippedSubviews=\{false\}/);
});

test('course playlist requests are deduplicated and cached for instant reopen', async () => {
  const context = {
    COURSE_PLAYLIST_CACHE_TTL_MS: 10 * 60 * 1000,
    COURSE_PLAYLIST_CACHE_MAX_ENTRIES: 24,
    coursePlaylistCache: new Map(),
    coursePlaylistRequests: new Map(),
    Date,
    encodeURIComponent,
    Error,
  };
  for (const name of ['coursePlaylistCacheKey', 'readCoursePlaylistCache', 'writeCoursePlaylistCache', 'requestCoursePlaylist']) {
    context[name] = compile(nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name), context);
  }
  let calls = 0;
  let finish;
  const session = {
    requestJson: async () => {
      calls += 1;
      return new Promise(resolve => { finish = resolve; });
    },
  };
  const user = { _id: 'u', sessionId: 's' };
  const first = context.requestCoursePlaylist(session, user, 'course');
  const second = context.requestCoursePlaylist(session, user, 'course');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  finish({ videos: [{ _id: 'lesson', hlsUrl: 'https://cdn.example/lesson.m3u8' }] });
  assert.deepEqual(await first, await second);
  assert.equal((await context.requestCoursePlaylist(session, user, 'course'))[0]._id, 'lesson');
  assert.equal(calls, 1);
});

test('course cards open an immediate lesson shell while uncached data loads', () => {
  assert.match(source, /setSelectedCourse\(immediateCourse\)[\s\S]{0,400}?setCourseDetailLoading\(!cachedVideos\)[\s\S]{0,160}?setMainScreen\("courses"\)/);
  assert.match(source, /onPressIn=\{\(\) => onCourseIntent\?\.\(item\)\}/);
  assert.match(source, /playlistLoading=\{courseDetailLoading\}/);
  assert.match(source, /Preparing your lessons/);
});

test('leaving playback tolerates an already released native player',()=>{
  const nativePlayer={pause(){throw new Error('Native player released');}};
  const runNativePlayer=compile(declaration('runNativePlayer').init.arguments[0],{nativePlayer});
  assert.doesNotThrow(()=>runNativePlayer(player=>player.pause()));
  assert.equal(runNativePlayer(player=>player.pause()),undefined);
  assert.match(source,/return \(\) => \{\s*cancelled = true;[\s\S]{0,300}?pauseNativePlayer\(\);\s*\};/);
});

test('temporary next-lecture preview is removed until the approved reference is supplied', () => {
  assert.doesNotMatch(source, /Player up next preview/);
  assert.doesNotMatch(source, />UP NEXT</);
  assert.doesNotMatch(source, /webPlayerNextPreview/);
});

test('course lesson list restores its per-course scroll position after returning from playback', () => {
  assert.match(source, /const courseLessonListOffsetsRef = useRef\(new Map\(\)\)/);
  assert.match(source, /onSelectVideo\(index, scrollOffsetRef\.current\)/);
  assert.match(source, /scrollToOffset\(\{ offset: normalizedRestoreOffset, animated: false \}\)/);
  assert.match(source, /restoreScrollOffset=\{courseLessonListOffsetsRef\.current\.get\(String\(selectedCourse\?\._id\)\) \|\| 0\}/);
});

test('courses panel restores its exact scroll offset after returning from a course', () => {
  assert.match(source, /const courseCatalogScrollOffsetRef = useRef\(0\)/);
  assert.match(source, /onSelect\(item, courseScrollOffsetRef\.current\)/);
  assert.match(source, /courseCatalogScrollOffsetRef\.current = Math\.max\(0, Number\(scrollOffset\) \|\| 0\)/);
  assert.match(source, /restoreScrollOffset=\{courseCatalogScrollOffsetRef\.current\}/);
  assert.match(source, /courseListRef\.current\?\.scrollToOffset\(\{[\s\S]{0,180}?offset: Math\.min\(normalizedRestoreOffset, maxOffset\),[\s\S]{0,80}?animated: false/);
});

test('courses panel waits for enough content before applying a deep saved offset', () => {
  let applied;
  const context = {
    normalizedRestoreOffset: 1200,
    restoreCourseScrollAppliedRef: { current: false },
    courseListViewportHeightRef: { current: 600 },
    courseListContentHeightRef: { current: 0 },
    courseListRef: { current: { scrollToOffset: value => { applied = value; } } },
    setCourseListVisible: () => {},
    requestAnimationFrame: callback => callback(),
    Number,
    Math,
  };
  const restore = compile(declaration('restoreCourseListScroll').init.arguments[0], context);
  restore(undefined, 900);
  assert.equal(applied, undefined);
  assert.equal(context.restoreCourseScrollAppliedRef.current, false);
  restore(undefined, 1900);
  assert.equal(applied.offset, 1200);
  assert.equal(applied.animated, false);
  assert.equal(context.restoreCourseScrollAppliedRef.current, true);
});

test('course back swipe keeps the root mounted and exposes a catalogue preview', () => {
  assert.doesNotMatch(source, /courseDetailOverlay/);
  assert.doesNotMatch(source, /style=\{\{ opacity: courseListVisible \? 1 : 0 \}\}/);
  assert.match(source, /const courseRouteVisible = mainScreen === "courses" && Boolean\(selectedCourse\)/);
  assert.match(source, /<SwipeableRootTabs[\s\S]{0,900}?\{courseRouteVisible \? \(/);
  assert.match(source, /<CourseCatalogBackPreview[\s\S]{0,260}?restoreScrollOffset=\{courseCatalogScrollOffsetRef\.current\}/);
  assert.match(source, /key="course-lessons"[\s\S]{0,160}?transparentHost/);
  assert.match(source, /keepPreviewMounted/);
});

test('lesson reels use one-page paging and activate visible media reliably', () => {
  assert.doesNotMatch(source, /pendingActiveIndexRef/);
  assert.match(source, /if \(visible\) setActiveIndex\(visible\.index\)/);
  assert.match(source, /pagingEnabled[\s\S]{0,120}?bounces=\{false\}[\s\S]{0,80}?overScrollMode="never"/);
  assert.match(source, /initialNumToRender=\{2\}[\s\S]{0,100}?windowSize=\{5\}/);
  assert.match(source, /setActiveIndex\(index\);\s*flatListRef\.current\?\.scrollToIndex/);
  assert.doesNotMatch(source, /onMomentumScrollEnd=\{onReelMomentumEnd\}/);
});
