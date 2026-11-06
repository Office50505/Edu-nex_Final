from pathlib import Path
p=Path('appcopyai/App.js'); s=p.read_text()
def rep(a,b,n=1):
 global s
 assert s.count(a)>=n,a[:110]
 s=s.replace(a,b,n)
rep('const url = `${API_BASE}/api/courses/${courseId}/videos/${video._id}/playback-access`;', 'const publicPath = video.publicPlayback ? "/public" : "";\n    const url = `${API_BASE}/api${publicPath}/courses/${courseId}/videos/${video._id}/playback-access`;')
# A separate public request API keeps authenticated session behavior intact.
rep('const AI_FEATURE_ENABLED = true;', '''async function requestCourseVideos(session, user, courseId) {
  const path = `/api/${hasCourseAccess(user) && user?._id ? "" : "public/"}courses/${encodeURIComponent(courseId)}/videos`;
  return hasCourseAccess(user) && user?._id
    ? session.requestJson(path)
    : fetchApiJson(path, null);
}
const AI_FEATURE_ENABLED = true;''')
rep('const [user, setUserState] = useState(null);', 'const [user, setUserState] = useState(null);\n  const [showAuth, setShowAuth] = useState(false);')
rep('    if (!user) {\n      return {\n        key: `auth:', '    if (!user && showAuth) {\n      return {\n        key: `auth:')
rep('    screen,\n    selectedCourse,\n    startIndex,\n    user,', '    screen,\n    showAuth,\n    selectedCourse,\n    startIndex,\n    user,')
rep('    if (route.authScreen) {\n      setScreen', '    if (route.authScreen && !userRef.current) {\n      setShowAuth(true);\n      setScreen')
rep('    setCourseAiTarget(route.courseAiTarget || null);', '    setShowAuth(false);\n    setCourseAiTarget(route.courseAiTarget || null);')
rep('    if (!userRef.current) {\n      if (resetVisible)', '    if (!userRef.current && showAuth) {\n      if (resetVisible)')
rep('      return true;\n    }\n\n    if (mainScreen === "courses" && selectedCourse && startIndex !== null)', '      setShowAuth(false);\n      return true;\n    }\n\n    if (mainScreen === "courses" && selectedCourse && startIndex !== null)')
rep('    showAppUpgrade,\n    showProblemReport,\n    startIndex,', '    showAppUpgrade,\n    showAuth,\n    showProblemReport,\n    startIndex,')
rep('Boolean(user) && (canGoBack || fallbackBackAvailable)', '(canGoBack || fallbackBackAvailable || showAuth)')
rep('// ── Auth screens ────────────────────────────────────────────────────────────\n  if (!user) {', '// ── Optional authentication: public browsing is the default. ─────────────────\n  if (!user && showAuth) {')
rep('            <View style={s.authHeadingBlock}', '            <View style={s.authHeadingBlock}') if False else None
rep('            <View style={[s.authHeadingBlock, isTabletLayout && s.authHeadingBlockTablet]}>', '''            <TouchableOpacity onPress={() => { setShowAuth(false); clearLoginForm(); resetSignup(); }}
              style={[s.btn, s.btnOutline, { marginBottom: 20 }]} accessibilityRole="button" accessibilityLabel="Continue as Guest">
              <Text style={{ color: C.primary, fontWeight: "700" }}>Continue as Guest</Text>
            </TouchableOpacity>
            <View style={[s.authHeadingBlock, isTabletLayout && s.authHeadingBlockTablet]}>''')
rep('    if (!hasCourseAccess(u)) { setShowAppUpgrade(true); return false; }', '')
rep('    const isCurrentRequest = () => courseOpenRequestRef.current === requestId;', '    const ownerKey = `${u?._id || "guest"}:${u?.sessionId || ""}`;\n    const isCurrentRequest = () => courseOpenRequestRef.current === requestId\n      && `${userRef.current?._id || "guest"}:${userRef.current?.sessionId || ""}` === ownerKey;')
rep('if (fixtureCourse || course?.__homePlayableVideos ||', 'if (fixtureCourse || (hasCourseAccess(u) && course?.__homePlayableVideos) ||')
rep('const data = await nativeSession.requestJson(`/api/courses/${encodeURIComponent(targetCourseId)}/videos`);', 'const data = await requestCourseVideos(nativeSession, u, targetCourseId);')
# Public course playback gets a source-checked playlist and no progress writes.
rep('      setPreloadedVideos(null);\n      setIsPreviewOnly(false);\n      setInitialTime(options.initialTime || 0);', '      setPreloadedVideos(nextCourse.videos.filter(video => !video.locked));\n      setIsPreviewOnly(!u?._id);\n      setInitialTime(options.initialTime || 0);')
rep('    if (isRestoring || !user?._id || !user?.sessionId || !pendingAppLink) return;', '    if (isRestoring || !pendingAppLink) return;')
# Home metadata cache must never store members-only playable URLs.
rep('            homeCatalogCourses = nextCourses;\n', '')
rep('                <AvatarImage avatarId={user.avatar || "a1"}', '                <AvatarImage avatarId={user?.avatar || "a1"}')
rep('''        if (!hasAccess) {
          setShowUpgrade(true);
          return;
        }
        onSelectCourse(targetCourse);''', '        onSelectCourse(targetCourse);')
# Home and catalogue entry points always open course details; lesson permissions are per lesson.
rep('''  const requireAccess = useCallback(action => {
    if (!hasAccess) {
      setShowUpgrade(true);
      return;
    }
    action();
  }, [hasAccess]);''', '  const requireAccess = useCallback(action => action(), []);')
rep('''  const openCourse = useCallback(course => {
    if (!course) return;
    if (!hasAccess) {
      setShowUpgrade(true);
      return;
    }
    onSelect(course);
  }, [hasAccess, onSelect]);''', '''  const openCourse = useCallback(course => {
    if (course) onSelect(course);
  }, [onSelect]);''')
# Account features display a contextual sign-in page instead of attempting private APIs.
rep('    if (targetTab === "downloads" && !hasCourseAccess(userRef.current)) {', '    if (targetTab === "downloads" && userRef.current && !hasCourseAccess(userRef.current)) {')
rep('    if (!u) return;\n    // Optimistic update', '    if (!u) { setMainScreen("wishlist"); return; }\n    // Optimistic update')
rep('    if (!accountScope?.active()) return;', '    if (!u?._id) { setMainScreen("downloads"); return; }\n    if (!hasCourseAccess(u)) { setShowAppUpgrade(true); return; }\n    if (!accountScope?.active()) return;')
rep('    setUser(null); setSelectedCourse(null); setStartIndex(null); setCourseAiTarget(null); setMainScreen("home");', '    setShowAuth(false);\n    setUser(null); setSelectedCourse(null); setStartIndex(null); setCourseAiTarget(null); setMainScreen("home");')
# Clear public lists when logging in so future playback uses the current account.
rep('        setUser(authUser);', '        setShowAuth(false); setSelectedCourse(null); setStartIndex(null); setMainScreen("home");\n        setUser(authUser);', 2)
rep('        onSelectVideo={idx => setStartIndex(idx)}', '''        onSelectVideo={idx => {
          const video = selectedCourse.videos?.[idx];
          if (video?.locked) {
            if (!user) { setShowAuth(true); return; }
            openSubscriptionDetails(); return;
          }
          setStartIndex(idx);
        }}''')
rep('            initialIndex={startIndex}', '            initialIndex={selectedCourse.videos?.slice(0, startIndex).filter(video => !video.locked).length || 0}')
rep('            preloadedVideos={preloadedVideos || (DEV_UI_QA_ENABLED ? selectedCourse.videos : null)}', '            preloadedVideos={(preloadedVideos || selectedCourse.videos || []).filter(video => !video.locked)}')
rep('            onVideoComplete={isPreviewOnly ? undefined : markVideoComplete}', '            onRequireSignIn={() => setShowAuth(true)}\n            onVideoComplete={!user || isPreviewOnly ? undefined : markVideoComplete}')
rep('            onVideoProgress={isPreviewOnly ? undefined : saveVideoProgress}', '            onVideoProgress={!user || isPreviewOnly ? undefined : saveVideoProgress}')
rep('preloadedVideos, useAppBackTransition = false }) {', 'preloadedVideos, onRequireSignIn, useAppBackTransition = false }) {')
rep('    if (!user?._id || !user?.sessionId) { setError("Subscription required."); setLoading(false); return; }', '    if (preloadedVideos) { setLoading(false); return; }')
rep('    session.requestJson(`/api/courses/${courseId}/videos`)\n      .then(d => {', '    requestCourseVideos(session, user, courseId)\n      .then(d => {')
rep('const freshVideos = Array.isArray(d.videos) ? d.videos : [];', 'const freshVideos = Array.isArray(d?.videos) ? d.videos.filter(video => !video.locked) : [];')
rep('onPress={() => setShowCourseAi(true)}', 'onPress={() => user?._id ? setShowCourseAi(true) : onRequireSignIn?.()}')
rep('  function renderRootTab(tab, { isActive = false } = {}) {', '''  const renderGuestAccount = (feature = mainScreen) => (
    <GuestAccountScreen feature={feature} onSignIn={() => { resetSignup(); setShowAuth(true); }}
      onBrowse={() => navigateRootTab("courses")} onBack={requestAnimatedBack} />
  );

  function renderRootTab(tab, { isActive = false } = {}) {
    if (!user && ["ai", "downloads"].includes(tab)) return renderGuestAccount(tab);''')
# Account prompt must be declared before early returns (course pager calls renderRootTab).
rep('  const renderGuestAccount = (feature = mainScreen) => (', '  function renderGuestAccount(feature = mainScreen) { return (')
rep('      onBrowse={() => navigateRootTab("courses")} onBack={requestAnimatedBack} />\n  );', '      onBrowse={() => navigateRootTab("courses")} onBack={requestAnimatedBack} />\n  ); }')
rep('  // ── Logged-in ───────────────────────────────────────────────────────────────', '''  if (!user && ["profile", "wishlist", "certificates", "subscription"].includes(mainScreen) && !selectedCourse) {
    return withGlobalBackGesture(renderGuestAccount());
  }

  // ── Public browsing and account screens ─────────────────────────────────────''')
# Explicit lesson labels and lock icon.
rep('accessibilityLabel={`Play lesson ${index + 1}:', 'accessibilityLabel={`${item.locked ? "Premium lesson" : item.isFree ? "Play free lesson" : "Play lesson"} ${index + 1}:')
rep('<Ionicons name="play" size={10} color="#fff" />', '<Ionicons name={item.locked ? "lock-closed" : "play"} size={10} color="#fff" />')
rep('<Text style={s.videoRowTitle} numberOfLines={2}>{item.title || `Video ${index + 1}`}</Text>', '<Text style={s.videoRowTitle} numberOfLines={2}>{item.title || `Video ${index + 1}`}</Text>\n                  <Text style={{ color: C.textSub, fontSize: 12, marginTop: 4 }}>{item.locked ? "Premium lesson" : item.isFree ? "Free · No sign-in required" : "Included with your membership"}</Text>')
rep('// ── App ───────────────────────────────────────────────────────────────────────', '''function GuestAccountScreen({ feature, onSignIn, onBrowse, onBack }) {
  const labels = { profile: "Your profile", wishlist: "Your saved courses", certificates: "Your certificates",
    subscription: "Your membership", ai: "Your AI tutor", downloads: "Your downloads" };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 20 }} accessibilityRole="button" accessibilityLabel="Back to browsing">
        <Ionicons name="arrow-back" size={24} color={C.text} />
      </TouchableOpacity>
      <View style={[s.centered, { padding: 28 }]}>
        <Ionicons name="person-circle-outline" size={64} color={C.primary} />
        <Text style={{ color: C.text, fontSize: 24, fontWeight: "800", marginTop: 18 }}>{labels[feature] || "Your account"}</Text>
        <Text style={{ color: C.textSub, textAlign: "center", lineHeight: 22, marginVertical: 18 }}>
          Sign in to manage your account, sync learning progress and use your membership features. You can browse courses and watch free lessons without an account.
        </Text>
        <TouchableOpacity onPress={onSignIn} style={[s.btn, s.btnFill]} accessibilityRole="button" accessibilityLabel="Sign in or create an account">
          <Text style={s.btnText}>Sign in / Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBrowse} style={[s.btn, s.btnOutline, { marginTop: 14 }]} accessibilityRole="button" accessibilityLabel="Browse courses as guest">
          <Text style={{ color: C.primary, fontWeight: "700" }}>Browse courses as guest</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────''')
p.write_text(s)
