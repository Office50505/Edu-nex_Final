const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const nativeTabSource = fs.readFileSync(
  path.join(__dirname, "..", "ios", "ProtectedVideo", "SkillomateNativeTabBar.m"),
  "utf8",
);
const productionCatalogFallbackSource = fs.readFileSync(
  path.join(__dirname, "..", "productionCatalogFallback.js"),
  "utf8",
);

test("production root navigation uses the stable native pager path", () => {
  assert.match(appSource, /const ROOT_TAB_SWIPE_ENABLED = true;/);
  assert.match(appSource, /ROOT_TAB_SWIPE_ENABLED \? <StableSwipeableRootTabsPager/);
});

test("stable root tabs use a single mounted foreground with bidirectional edge-safe swipes", () => {
  const start = appSource.indexOf("function StableSwipeableRootTabsPager(");
  const end = appSource.indexOf("function SwipeableRootTabs(", start);
  assert.ok(start >= 0 && end > start, "stable pager source block should exist");
  const source = appSource.slice(start, end);

  assert.match(source, /PanResponder\.create/);
  assert.match(source, /renderTab\(activeTab/);
  assert.match(source, /staticRootTabUnderlay/);
  assert.doesNotMatch(source, /<PagerView/);
  assert.doesNotMatch(source, /Reanimated|useSharedValue|useAnimatedStyle|useNativePagerScrollHandler/);

  const underlay = appSource.slice(
    appSource.indexOf("staticRootTabUnderlay:"),
    appSource.indexOf("staticRootTabForeground:", appSource.indexOf("staticRootTabUnderlay:")),
  );
  assert.match(underlay, /width: "100%"/);
  assert.match(underlay, /height: "100%"/);
});

test("active root page stays in normal flex flow and owns its safe-area header", () => {
  const foreground = appSource.slice(
    appSource.indexOf("staticRootTabForeground:"),
    appSource.indexOf("bottomTabAI:", appSource.indexOf("staticRootTabForeground:")),
  );
  assert.match(foreground, /flex: 1/);
  assert.doesNotMatch(foreground, /StyleSheet\.absoluteFillObject/);

  const stableStart = appSource.indexOf("function StableSwipeableRootTabsPager(");
  const stableEnd = appSource.indexOf("function SwipeableRootTabs(", stableStart);
  const stableSource = appSource.slice(stableStart, stableEnd);
  assert.match(stableSource, /renderTab\(activeTab, \{ isActive: true, suppressHeader: false \}\)/);
  assert.doesNotMatch(stableSource, /<PersistentAppHeader/);
});

test("bottom navigation does not use worklet-driven or duplicated tab visuals", () => {
  const start = appSource.indexOf("function BottomNav(");
  const end = appSource.indexOf("const ROOT_TAB_ORDER", start);
  assert.ok(start >= 0 && end > start, "BottomNav source block should exist");
  const source = appSource.slice(start, end);

  assert.doesNotMatch(source, /useAnimatedStyle|useSharedValue|withUiSpring|withUiTiming/);
  assert.doesNotMatch(source, /AnimatedBottomTabVisual|Reanimated\.View/);
  assert.doesNotMatch(source, /<BlurView/);
});


test("navbar shell keeps a complete neutral outline", () => {
  const navShell = appSource.slice(
    appSource.indexOf("bottomNav:"),
    appSource.indexOf("bottomNavCompact:"),
  );
  assert.match(navShell, /borderWidth: 1/);
  assert.doesNotMatch(navShell, /borderTopWidth: 0/);
});

test("native and fallback tab selections use the Skillomate gold palette", () => {
  assert.match(appSource, /const activeNavColor = C\.primary;/);
  assert.match(nativeTabSource, /UIColor \*skillomateGold/);
  assert.match(nativeTabSource, /colorWithRed:231\.0 \/ 255\.0/);
  assert.match(nativeTabSource, /green:188\.0 \/ 255\.0/);
  assert.match(nativeTabSource, /blue:104\.0 \/ 255\.0/);
  assert.match(nativeTabSource, /_tabs\.tabBar\.tintColor = skillomateGold/);
  assert.doesNotMatch(nativeTabSource, /systemBlueColor/);
});

test("lesson player opens with deliberate motion and cross-fades its first frame", () => {
  assert.match(appSource, /key="course-player"[\s\S]*motion="player"/);
  assert.match(appSource, /motion === "player"[\s\S]*duration: 440/);
  assert.match(appSource, /onFirstFrameRender=\{revealFirstFrame\}/);
  assert.match(appSource, /duration: 280[\s\S]*setRenderFirstFrameCover\(false\)/);
  assert.match(appSource, /Opening lesson/);
});

test("player back swipe preserves the mounted lesson screen underneath", () => {
  assert.match(appSource, /\{courseRouteVisible \? \([\s\S]*key="course-lessons"[\s\S]*renderCourseLessonList/);
  assert.match(appSource, /\{playerRouteVisible \? \([\s\S]*key="course-player"[\s\S]*transparentHost/);
  assert.doesNotMatch(appSource, /genieRouteUnderlay/);
  assert.doesNotMatch(appSource, /courseRouteOverlay|playerRouteOverlay/);

  const routeStyles = appSource.slice(
    appSource.indexOf("genieRouteHost:"),
    appSource.indexOf("pageHeader:", appSource.indexOf("genieRouteHost:")),
  );
  assert.match(routeStyles, /genieRouteHost:[\s\S]*width: "100%"[\s\S]*height: "100%"/);
  assert.match(routeStyles, /routeStackForeground:[\s\S]*width: "100%"[\s\S]*height: "100%"/);
});

test("lesson-list back swipe keeps root mounted and uses a non-virtualized visible snapshot", () => {
  const rootIndex = appSource.indexOf("<SwipeableRootTabs", appSource.indexOf("const courseRouteVisible"));
  const courseLayerIndex = appSource.indexOf("{courseRouteVisible ? (", rootIndex);
  const playerLayerIndex = appSource.indexOf("{playerRouteVisible ? (", courseLayerIndex);
  assert.ok(rootIndex >= 0 && courseLayerIndex > rootIndex && playerLayerIndex > courseLayerIndex);
  assert.match(appSource, /<SwipeableRootTabs[\s\S]*hideBottomNav/);
  assert.match(appSource, /<CourseCatalogBackPreview[\s\S]*restoreScrollOffset=\{courseCatalogScrollOffsetRef\.current\}/);
  const previewStart = appSource.indexOf("function CourseCatalogBackPreview(");
  const previewEnd = appSource.indexOf("function CourseListSkeleton(", previewStart);
  const previewSource = appSource.slice(previewStart, previewEnd);
  assert.match(previewSource, /courses\.map/);
  assert.match(previewSource, /translateY: -Math\.max/);
  assert.doesNotMatch(previewSource, /<ScrollView|<FlatList/);
});

test("iPhone headers use safe-area-context instead of the deprecated React Native view", () => {
  assert.match(appSource, /SafeAreaView as SafeAreaContextView/);
  assert.match(appSource, /function SafeAreaView\(\{ edges = \["top", "left", "right"\]/);
  assert.match(appSource, /<SafeAreaContextView[\s\S]*edges=\{edges\}/);
  assert.match(appSource, /minimumPortraitTopInset = screenHeight >= 700 \? 50 : 0/);
  assert.match(appSource, /height >= 700 \? 50 : 0/);
});

test("lesson list reserves the complete floating navbar clearance", () => {
  assert.match(appSource, /const navClearance = Platform\.OS === "ios" \? 82 \+ insets\.bottom : 94/);
  assert.match(appSource, /style=\{\{ marginBottom: navClearance \}\}[\s\S]*contentContainerStyle=\{\{ padding: 16, paddingBottom: 24/);
});

test("catalogue refresh bypasses stale empty responses without wiping a valid cache", () => {
  assert.match(appSource, /"Cache-Control": "no-cache"/);
  assert.match(appSource, /refresh=\$\{Date\.now\(\)\}/);
  assert.match(appSource, /if \(!courses\.length && cached\?\.courses\?\.length\) return cached\.courses/);
  assert.match(appSource, /accessibilityLabel="Reload course catalogue"/);
});

test("cold-start catalogue uses real production metadata instead of a blank page", () => {
  assert.match(appSource, /PRODUCTION_CATALOG_FALLBACK/);
  assert.match(appSource, /HOME_FALLBACK_COURSES = PRODUCTION_CATALOG_FALLBACK/);
  assert.match(appSource, /return PRODUCTION_CATALOG_FALLBACK/);
  assert.match(productionCatalogFallbackSource, /AI Product Photoshoot & Ads/);
  assert.match(productionCatalogFallbackSource, /6acf6a0c0fbf30bb42142d68/);
  assert.doesNotMatch(productionCatalogFallbackSource, /videos\s*:/);
});

test("course cards are never hidden behind a scroll-restoration opacity gate", () => {
  const start = appSource.indexOf("function CourseListScreen(");
  const end = appSource.indexOf("function VideoListScreen(", start);
  const source = appSource.slice(start, end);
  assert.doesNotMatch(source, /courseListVisible/);
  assert.doesNotMatch(source, /style=\{\{ opacity:/);
});
