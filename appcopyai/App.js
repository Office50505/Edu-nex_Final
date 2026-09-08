
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import * as ScreenCapture from "expo-screen-capture";
import Constants from "expo-constants";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { Video } from "expo-av";
import {
  DEV_UI_QA_ENABLED,
  UI_QA_AI_MESSAGES,
  UI_QA_CERTIFICATES,
  UI_QA_COURSES,
  UI_QA_DOWNLOADS,
  UI_QA_PROGRESS,
  UI_QA_WISHLIST,
} from "./dev/uiQaFixtures";

const PLAYER_ORIGIN = "https://protected-video.local";

const AI_ROBOT_IMAGES = {
  r1: require("./assets/ai-avatars/r1.jpg"),
  r2: require("./assets/ai-avatars/r2.jpg"),
  r3: require("./assets/ai-avatars/r3.jpg"),
  r4: require("./assets/ai-avatars/r4.jpg"),
  r5: require("./assets/ai-avatars/r5.jpg"),
  r6: require("./assets/ai-avatars/r6.jpg"),
  r7: require("./assets/ai-avatars/r7.jpg"),
  r8: require("./assets/ai-avatars/r8.jpg"),
  r9: require("./assets/ai-avatars/r9.jpg"),
};
const AI_ROBOT_AVATARS = Object.keys(AI_ROBOT_IMAGES).map((id, index) => ({
  id,
  label: `Nex companion ${index + 1}`,
}));
const AI_AVATAR_STORAGE_KEY = "edunex_ai_avatar";

function getQaCertificatesForUser(user) {
  const learnerName = user?.fullName || user?.email || user?.mobileNumber || "Skillomate Learner";
  return UI_QA_CERTIFICATES.map(certificate => ({ ...certificate, userName: learnerName }));
}

const AVATAR_IMAGES = {
  a1:  require("./assets/avatars/a1.jpeg"),
  a2:  require("./assets/avatars/a2.jpeg"),
  a3:  require("./assets/avatars/a3.jpeg"),
  a4:  require("./assets/avatars/a4.jpeg"),
  a5:  require("./assets/avatars/a5.jpeg"),
  a6:  require("./assets/avatars/a6.jpeg"),
  a7:  require("./assets/avatars/a7.jpeg"),
  a8:  require("./assets/avatars/a8.jpeg"),
  a9:  require("./assets/avatars/a9.jpeg"),
  a10: require("./assets/avatars/a10.jpeg"),
  a11: require("./assets/avatars/a11.jpeg"),
  a12: require("./assets/avatars/a12.jpeg"),
  a13: require("./assets/avatars/a13.jpeg"),
  a14: require("./assets/avatars/a14.jpeg"),
  a15: require("./assets/avatars/a15.jpeg"),
  // Legacy DB codes — map to new images
  f1: require("./assets/avatars/a1.jpeg"),
  f2: require("./assets/avatars/a4.jpeg"),
  f3: require("./assets/avatars/a5.jpeg"),
  f4: require("./assets/avatars/a6.jpeg"),
  f5: require("./assets/avatars/a7.jpeg"),
  f6: require("./assets/avatars/a13.jpeg"),
  m1: require("./assets/avatars/a2.jpeg"),
  m2: require("./assets/avatars/a3.jpeg"),
  m3: require("./assets/avatars/a8.jpeg"),
  m4: require("./assets/avatars/a9.jpeg"),
  m5: require("./assets/avatars/a10.jpeg"),
  m6: require("./assets/avatars/a11.jpeg"),
};
const DEMO_AVATARS = Object.keys(AVATAR_IMAGES).map((id, index) => ({ id, label: `Profile avatar ${index + 1}` }));
const HOME_ARTWORK_IMAGES = [
  AVATAR_IMAGES.a1,
  AVATAR_IMAGES.a2,
  AVATAR_IMAGES.a3,
  AVATAR_IMAGES.a4,
  AVATAR_IMAGES.a5,
  AVATAR_IMAGES.a6,
  AVATAR_IMAGES.a7,
  AVATAR_IMAGES.a8,
  AVATAR_IMAGES.a9,
  AVATAR_IMAGES.a10,
  AVATAR_IMAGES.a11,
  AVATAR_IMAGES.a12,
  AVATAR_IMAGES.a13,
  AVATAR_IMAGES.a14,
  AVATAR_IMAGES.a15,
];
const HOME_FALLBACK_TITLES = [
  "ChatGPT for Professionals",
  "AI Content Creation Masterclass",
  "Prompt Engineering Mastery",
  "Make Money with AI",
  "AI Automation Agency",
  "Midjourney Mastery",
  "Canva AI for Designers",
  "Build AI Apps Without Coding",
  "AI Avatars from Scratch",
  "Claude AI Complete Guide",
  "YouTube Growth with AI",
  "Notion AI Productivity",
  "AI Video Creation",
  "Start Freelancing with AI",
  "Get Your First Client",
  "AI Side Hustles",
];
const HOME_FALLBACK_COURSES = HOME_FALLBACK_TITLES.map((title, index) => ({
  _id: `mock-home-${index}`,
  title,
  isMock: true,
  thumbnailAsset: HOME_ARTWORK_IMAGES[index % HOME_ARTWORK_IMAGES.length],
  thumbnailVerticalAsset: HOME_ARTWORK_IMAGES[index % HOME_ARTWORK_IMAGES.length],
  videos: Array.from({ length: 8 + (index % 8) }, (_, i) => ({ title: `${String(i + 1).padStart(2, "0")}. ${title}` })),
}));
const COURSE_LIST_RATINGS = [4.8, 4.9, 4.7, 4.8, 4.6, 4.9];
const ANDROID_CLIPPED_SUBVIEWS = Platform.OS === "android";

function sanitizeImageUrlForLog(url) {
  const value = String(url || "");
  if (!value) return "";
  const queryIndex = value.indexOf("?");
  return queryIndex >= 0 ? `${value.slice(0, queryIndex)}?...` : value;
}

function getImageHost(url) {
  const value = String(url || "");
  const match = value.match(/^https?:\/\/([^/]+)/i);
  return match?.[1] || "";
}

function traceImageFailure({ screen, courseId, imageUrl, fallbackUsed }) {
  if (!__DEV__) return;
  // Thumbnail failures are recoverable because every caller supplies a fallback.
  // Keep the diagnostic in Metro without promoting it to a blocking LogBox warning.
  console.info("[Skillomate:image-fail]", {
    screen,
    courseId: courseId || "unknown",
    resolvedImageUrl: sanitizeImageUrlForLog(imageUrl),
    host: getImageHost(imageUrl),
    fallbackUsed: Boolean(fallbackUsed),
  });
}

function PosterImage({ course, index = 0, vertical = true, style }) {
  const fallbackTitle = course?.title || "Skillomate";
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const uri = !useLocalFallback ? getCourseThumbnailUri(course, vertical) : null;
  const localSource = (vertical ? course?.thumbnailVerticalAsset : course?.thumbnailAsset) || course?.thumbnailAsset || HOME_ARTWORK_IMAGES[index % HOME_ARTWORK_IMAGES.length];

  useEffect(() => {
    setUseLocalFallback(false);
  }, [course?._id, vertical]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <View style={s.artworkFallback}>
        <Ionicons name="play-circle-outline" size={28} color={C.primary} />
        <Text style={s.artworkFallbackText} numberOfLines={2}>{fallbackTitle}</Text>
      </View>
      <Image
        source={uri ? { uri } : localSource}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => {
          traceImageFailure({
            screen: vertical ? "PosterImage.vertical" : "PosterImage.landscape",
            courseId: course?._id || course?.id,
            imageUrl: uri,
            fallbackUsed: true,
          });
          setUseLocalFallback(true);
        }}
      />
    </View>
  );
}

function HorizontalRail({ data, renderItem, contentContainerStyle, keyExtractor }) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      updateCellsBatchingPeriod={40}
      removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
      keyboardShouldPersistTaps="handled"
      directionalLockEnabled
      decelerationRate="fast"
    />
  );
}

function AvatarImage({ avatarId, size = 40, style }) {
  const src = AVATAR_IMAGES[avatarId];
  if (!src) return (
    <View accessible={false} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: EDUNEX_MOBILE_TOKENS.colors.light.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: EDUNEX_MOBILE_TOKENS.colors.light.border }, style]}>
      <Text style={{ color: EDUNEX_MOBILE_TOKENS.colors.light.text, fontWeight: "800", fontSize: size * 0.4 }}>?</Text>
    </View>
  );
  return <Image accessible={false} source={src} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} resizeMode="cover" />;
}
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}edunex_dl/`;
const DOWNLOADS_STORAGE_KEY = "edunex_downloads_v1";
const hasCourseAccess = user => DEV_UI_QA_ENABLED || !!(user?.subscriptionStatus && user.subscriptionStatus !== "none");
const AI_FEATURE_ENABLED = true;

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VIDEO_COMPLETE_THRESHOLD = 0.85;

// SDK 51: host may live in manifest2.extra.expoGo.debuggerHost, not at the root
const _m1 = Constants.__unsafeNoWarnManifest || Constants.expoConfig || {};
const _m2 = Constants.__unsafeNoWarnManifest2 || {};
const _rawHost =
  _m1.debuggerHost ||
  _m1.hostUri ||
  _m2.extra?.expoGo?.debuggerHost ||
  _m2.extra?.expoClient?.hostUri ||
  "";
const EXPO_HOST = _rawHost.split(":")[0] || "localhost";
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || "3000";
const DEFAULT_API_BASE = __DEV__
  ? (Platform.OS === "android"
    ? `http://${EXPO_HOST === "localhost" ? "10.0.2.2" : EXPO_HOST}:${DEV_API_PORT}`
    : `http://${EXPO_HOST}:${DEV_API_PORT}`)
  : "http://15.206.129.125:3001";
const DEFAULT_AI_BASE = __DEV__ ? DEFAULT_API_BASE : "http://43.205.171.165:3002";
const normalizeBaseUrl = url => String(url || "").replace(/\/+$/, "");
const API_BASE = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE || DEFAULT_API_BASE);
const AI_BASE = normalizeBaseUrl(process.env.EXPO_PUBLIC_AI_BASE || DEFAULT_AI_BASE);

const SUBSCRIPTION_URL = "https://edunexmvp.netlify.app/payment";
const WEB_APP_BASE = normalizeBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_BASE || "https://edunexmvp.netlify.app");
const TERMS_URL = `${WEB_APP_BASE}/terms`;
const PRIVACY_URL = `${WEB_APP_BASE}/privacy`;

function openAppLink(url, label) {
  Linking.openURL(url).catch(() => {
    Alert.alert(`${label} unavailable`, `Could not open ${label.toLowerCase()}. Check your connection and try again.`);
  });
}

async function readJsonResponse(res) {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { error: raw }; }
}

async function fetchApiJson(path, fallback = null) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await readJsonResponse(res);
  return res.ok ? data : fallback;
}

async function postApiJson(paths, body) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let last = null;
  for (const path of candidates) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJsonResponse(res);
    last = { res, data };
    if (res.status !== 404) return last;
  }
  return last;
}

function normalizeAuthUser(data = {}) {
  const source = data.user && typeof data.user === "object" ? data.user : data;
  const id = source._id || source.id || source.userId || data.userId;
  if (!id) return null;
  return {
    ...source,
    _id: String(id),
    sessionId: source.sessionId || data.sessionId || source.token || data.token || "",
    wishlist: source.wishlist || data.wishlist || [],
  };
}

const FONT = {
  heading: Platform.select({ ios: "System", android: "sans-serif", default: "sans-serif" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "sans-serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

const SPACE = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

const RADIUS = {
  xs: 4,
  sm: 8,
  md: 8,
  lg: 8,
  xl: 12,
  pill: 999,
};

const ELEVATION = {
  none: {
    shadowOpacity: 0,
    elevation: 0,
  },
  hairline: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  soft: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

const TYPE = {
  display: { fontFamily: FONT.heading, fontSize: 32, lineHeight: 36, fontWeight: "700", letterSpacing: 0 },
  h1: { fontFamily: FONT.heading, fontSize: 27, lineHeight: 32, fontWeight: "700", letterSpacing: 0 },
  h2: { fontFamily: FONT.heading, fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: 0 },
  h3: { fontFamily: FONT.heading, fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: 0 },
  title: { fontFamily: FONT.body, fontSize: 16, lineHeight: 22, fontWeight: "700", letterSpacing: 0 },
  body: { fontFamily: FONT.body, fontSize: 14, lineHeight: 21, fontWeight: "400", letterSpacing: 0 },
  bodyMedium: { fontFamily: FONT.body, fontSize: 14, lineHeight: 21, fontWeight: "600", letterSpacing: 0 },
  caption: { fontFamily: FONT.body, fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0 },
  label: { fontFamily: FONT.body, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0 },
  button: { fontFamily: FONT.body, fontSize: 15, lineHeight: 20, fontWeight: "700", letterSpacing: 0 },
};

const ICON_FAMILY = "Ionicons";

// Skillomate mobile design tokens. Light mode follows the production website
// palette from app.css: warm cream surfaces, charcoal text, and muted gold.
const EDUNEX_MOBILE_TOKENS = {
  colors: {
    light: {
      isDark: false,
      background: "#FAF7F1",
      navigation: "#FBF8F2",
      surface: "#FFFDF8",
      surfaceWarm: "#FFFCF6",
      surfaceElevated: "#FFFDF8",
      surfacePressed: "#F6F0E7",
      panel: "#F3EBDD",
      panelSecondary: "#F6F0E7",
      textStrong: "#2B211A",
      text: "#332820",
      textSecondary: "#756A60",
      textMuted: "#9A8E82",
      border: "#E2D6C6",
      borderStrong: "#E2D6C6",
      primary: "#C58B2A",
      primaryPressed: "#A96F18",
      accent: "#B9853E",
      accentSoft: "#F3EBDD",
      success: "#6F7D52",
      warning: "#B9853E",
      error: "#EF4444",
    },
    dark: {
      isDark: true,
      background: "#11110F",
      navigation: "#151411",
      surface: "#1B1A17",
      surfaceWarm: "#222019",
      surfaceElevated: "#24221E",
      surfacePressed: "#2C2923",
      panel: "#2A241C",
      panelSecondary: "#211F1A",
      textStrong: "#FFFDF8",
      text: "#F7F1E8",
      textSecondary: "#C8BFB3",
      textMuted: "#9E9387",
      border: "#343029",
      borderStrong: "#4B4034",
      primary: "#C58B2A",
      primaryPressed: "#A96F18",
      accent: "#B9853E",
      accentSoft: "#2A241C",
      success: "#6F7D52",
      warning: "#B9853E",
      error: "#EF4444",
    },
  },
  fonts: FONT,
  type: TYPE,
  space: SPACE,
  radius: RADIUS,
  elevation: ELEVATION,
  icons: { family: ICON_FAMILY, style: "outline" },
};

function buildTheme(mode) {
  const base = EDUNEX_MOBILE_TOKENS.colors[mode];
  return {
    ...base,
    // Legacy aliases retained so existing screens keep working during migration.
    deepBlue: base.primary,
    softBlue: base.accent,
    lightGray: base.panelSecondary || base.surfaceWarm,
    slateGray: base.textSecondary,
    white: base.navigation || base.surface,
    bg: base.background,
    cardBg: base.surface,
    textSub: base.textSecondary,
    danger: base.error,
    primaryLight: base.panel || base.accentSoft,
    primaryDark: base.primaryPressed,
  };
}

const LIGHT_THEME = buildTheme("light");
const DARK_THEME = buildTheme("dark");
const C = { ...LIGHT_THEME };
const THEME_STORAGE_KEY = "themeMode";

function stringToColor(str) {
  const palette = [
    "#C58B2A", "#A96F18", "#B9853E", "#756A60", "#9A8E82", "#F3EBDD",
  ];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

// ── Player HTML ───────────────────────────────────────────────────────────────
const PLAYER_CSS = `
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000}
  .wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#000}
  iframe{width:100%;height:100%;border:0;pointer-events:none}
  .shield{position:absolute;inset:0;z-index:2;background:transparent}
`;

function buildYoutubePlayerHtml(videoId, origin) {
  return `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
  <style>${PLAYER_CSS}</style>
</head><body>
  <div class="wrap">
    <div id="yt"></div>
    <div class="shield"></div>
  </div>
  <script src="https://www.youtube.com/iframe_api"><\/script>
  <script>
    var player = null;
    var pending = [];
    var pollTimer = null;
    function post(data) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e) {}
    }
    function readyExec(fn) {
      if (player && typeof player.getPlayerState === 'function') fn();
      else pending.push(fn);
    }
    function emitState() {
      try {
        var state = player.getPlayerState ? player.getPlayerState() : -1;
        var current = player.getCurrentTime ? player.getCurrentTime() : 0;
        var duration = player.getDuration ? player.getDuration() : 0;
        post({ type:'stateChange', playing: state === 1, playerState: state });
        post({ type:'timeUpdate', currentTime: current || 0, duration: duration || 0, playerState: state });
      } catch(e) {}
    }
    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(emitState, 500);
      emitState();
    }
    function postLegacyCommand(func, args) {
      try {
        var frame = player && player.getIframe ? player.getIframe() : document.querySelector('iframe');
        if (!frame || !frame.contentWindow) return;
        frame.contentWindow.postMessage(JSON.stringify({ event:'command', func:func, args:args || [] }), '*');
      } catch(e) {}
    }
    window.onYouTubeIframeAPIReady = function() {
      player = new YT.Player('yt', {
        width: '100%',
        height: '100%',
        videoId: ${JSON.stringify(String(videoId || ""))},
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, enablejsapi: 1, fs: 0,
          iv_load_policy: 3, mute: 0, rel: 0, playsinline: 1, cc_load_policy: 0,
          origin: ${JSON.stringify(origin)}
        },
        events: {
          onReady: function() {
            pending.forEach(function(fn) { try { fn(); } catch(e) {} });
            pending = [];
            try { player.unMute(); player.playVideo(); } catch(e) {}
            startPolling();
            post({ type:'ready' });
          },
          onStateChange: emitState,
          onError: function(e) { post({ type:'error', code: e && e.data }); }
        }
      });
    };
    window.ytCmd = function(func, args) {
      readyExec(function() {
        args = args || [];
        try {
          if (func === 'playVideo') player.playVideo();
          else if (func === 'pauseVideo') player.pauseVideo();
          else if (func === 'seekTo') player.seekTo(Number(args[0]) || 0, args[1] !== false);
          else if (func === 'mute') player.mute();
          else if (func === 'unMute') player.unMute();
          else if (func === 'setPlaybackRate') player.setPlaybackRate(Number(args[0]) || 1);
        } catch(e) {}
        postLegacyCommand(func, args);
        if (func === 'playVideo') post({ type:'stateChange', playing: true, playerState: 1 });
        else if (func === 'pauseVideo') post({ type:'stateChange', playing: false, playerState: 2 });
        emitState();
      });
    };
  </script>
</body></html>`;
}

// Bunny embed builder — uses playerjs protocol to control inner Bunny iframe
function buildEmbedPlayerHtml(embedUrl, initialTime = 0) {
  const src = (embedUrl.includes('?') ? embedUrl + '&' : embedUrl + '?') + 'autoplay=true&controls=false';
  return `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
  <style>${PLAYER_CSS}</style>
  <script src="https://assets.mediadelivery.net/playerjs/0.1.1/player-0.1.1.min.js"><\/script>
</head><body>
  <div class="wrap">
    <iframe id="p" src="${src}"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowfullscreen="false">
    </iframe>
    <div class="shield"></div>
  </div>
  <script>
    var p = document.getElementById('p');
    var player = null;
    var dur = 0;
    var ready = false;
    var pending = [];
    var pollTimer = null;
    function post(data) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e) {}
    }
    function asNumber() {
      for (var i = 0; i < arguments.length; i++) {
        var n = Number(arguments[i]);
        if (isFinite(n) && n >= 0) return n;
      }
      return 0;
    }
    function emitTime(data, playerState) {
      data = data || {};
      var current = asNumber(data.seconds, data.currentTime, data.position, data.time);
      dur = asNumber(data.duration, data.totalDuration, data.end, dur);
      post({ type:'timeUpdate', currentTime: current, duration: dur, playerState: playerState });
    }
    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function() {
        exec(function() {
          try {
            player.getCurrentTime(function(current) {
              player.getDuration(function(duration) {
                emitTime({ seconds: current, duration: duration }, null);
              });
            });
          } catch(e) {}
        });
      }, 500);
    }
    function exec(fn) { if (ready) fn(); else pending.push(fn); }
    function playerMessage(method, value) {
      try {
        p.contentWindow.postMessage(JSON.stringify({
          context:'player.js', version:'0.0.11', method: method, value: value
        }), '*');
      } catch(e) {}
    }
    p.addEventListener('load', function() {
      player = new playerjs.Player(p);
      player.on('ready', function() {
        ready = true;
        player.on('timeupdate', function(data) {
          emitTime(data, 1);
        });
        player.on('ended', function() {
          post({ type:'timeUpdate', currentTime: dur, duration: dur, playerState: 0 });
        });
        player.on('play', function() {
          post({ type:'stateChange', playing: true, playerState: 1 });
        });
        player.on('pause', function() {
          post({ type:'stateChange', playing: false, playerState: 2 });
        });
        try {
          player.getQualities(function(qs) {
            if (qs && qs.length) {
              post({ type:'qualities', qualities: qs });
            }
          });
        } catch(e) {}
        if (${initialTime} > 0) { player.setCurrentTime(${initialTime}); }
        player.play();
        startPolling();
        post({ type:'ready' });
        pending.forEach(function(fn) { fn(); });
        pending = [];
      });
    });
    window.bunnyPlay  = function() {
      exec(function(){
        try { player.play(); } catch(e) {}
        playerMessage('play');
        post({ type:'stateChange', playing: true, playerState: 1 });
      });
    };
    window.bunnyPause = function() {
      exec(function(){
        try { player.pause(); } catch(e) {}
        playerMessage('pause');
        post({ type:'stateChange', playing: false, playerState: 2 });
      });
    };
    window.bunnySeek  = function(t) {
      exec(function(){
        t = Number(t) || 0;
        try { player.setCurrentTime(t); } catch(e) {}
        playerMessage('setCurrentTime', t);
      });
    };
    window.bunnyMute  = function(m) {
      exec(function(){
        try { m ? player.mute() : player.unmute(); } catch(e) {}
        playerMessage(m ? 'mute' : 'unmute');
      });
    };
    window.bunnySpeed = function(r) {
      exec(function(){
        try { player.setPlaybackRate(r); } catch(e) {}
        playerMessage('setPlaybackRate', r);
      });
    };
    window.bunnyQuality = function(q) {
      exec(function(){
        try { player.setQuality(q); } catch(e) {}
        playerMessage('setQuality', q);
      });
    };
  </script>
</body></html>`;
}

function buildPlayerHtml(video, origin) {
  if (video?.bunnyGuid) return buildEmbedPlayerHtml(`https://iframe.mediadelivery.net/embed/675520/${video.bunnyGuid}`);
  return buildYoutubePlayerHtml(video?.youtubeId || video || "", origin);
}

function buildPreviewPlayerHtml(video) {
  const bunnyUrl = video?.videoUrl || (video?.bunnyGuid
    ? `https://iframe.mediadelivery.net/embed/${video?.bunnyLibraryId || "675520"}/${video.bunnyGuid}`
    : "");
  const youtubeId = video?.youtubeId || video?.videoId || "";

  if (bunnyUrl) {
    const src = `${bunnyUrl}${bunnyUrl.includes("?") ? "&" : "?"}autoplay=true&muted=false&controls=false`;
    return `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
  <style>${PLAYER_CSS}</style>
  <script src="https://assets.mediadelivery.net/playerjs/0.1.1/player-0.1.1.min.js"><\/script>
</head><body>
  <div class="wrap">
    <iframe id="p" src="${src}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen="false"></iframe>
    <div class="shield"></div>
  </div>
  <script>
    var p = document.getElementById('p');
    var player = null;
    function forcePlay() {
      try {
        if (!player) player = new playerjs.Player(p);
        player.unmute();
        player.play();
      } catch(e) {}
    }
    p.addEventListener('load', function() {
      try {
        player = new playerjs.Player(p);
        player.on('ready', function() {
          forcePlay();
          setInterval(forcePlay, 1800);
        });
      } catch(e) {
        setInterval(forcePlay, 1800);
      }
    });
    setTimeout(forcePlay, 700);
  </script>
</body></html>`;
  }

  if (!youtubeId) return "";
  return `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
  <style>${PLAYER_CSS}</style>
</head><body>
  <div class="wrap">
    <iframe id="yt"
      src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&controls=0&disablekb=1&enablejsapi=1&fs=0&iv_load_policy=3&loop=1&playlist=${encodeURIComponent(youtubeId)}&rel=0&playsinline=1"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture">
    </iframe>
    <div class="shield"></div>
  </div>
  <script>
    var yt = document.getElementById('yt');
    function forcePlay() {
      try {
        yt.contentWindow.postMessage(JSON.stringify({event:'command',func:'unMute',args:[]}), '*');
        yt.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), '*');
      } catch(e) {}
    }
    yt.addEventListener('load', function(){ setTimeout(forcePlay, 500); });
    setTimeout(forcePlay, 1000);
    setInterval(forcePlay, 1800);
  </script>
</body></html>`;
}

function formatTime(secs) {
  const s = Math.max(0, Math.floor(Number.isFinite(Number(secs)) ? Number(secs) : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function finiteSeconds(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampSeconds(value, max = 0) {
  const next = finiteSeconds(value, 0);
  const upper = finiteSeconds(max, 0);
  return upper > 0 ? Math.max(0, Math.min(next, upper)) : Math.max(0, next);
}

function isDirectMediaUrl(url) {
  const value = String(url || "").trim();
  return /\.(m3u8|mp4|m4v|mov|webm)(?:[?#]|$)/i.test(value) || /\/playlist\.m3u8(?:[?#]|$)/i.test(value);
}

function getNativeVideoUrl(video, localPath) {
  if (localPath) return localPath;
  return (
    video?.hlsUrl ||
    video?.playlistUrl ||
    video?.streamUrl ||
    (isDirectMediaUrl(video?.videoUrl) ? video.videoUrl : "")
  );
}

function getVideoDurationLabel(video) {
  const raw = video?.duration ?? video?.durationSeconds ?? video?.lengthSeconds ?? video?.videoDuration ?? video?.durationText;
  if (typeof raw === "number" && raw > 0) return formatTime(raw);
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return "";
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? formatTime(numeric) : text;
  }
  return "";
}

function getVideoDescription(video) {
  return [
    video?.description,
    video?.videoDescription,
    video?.desc,
    video?.summary,
    video?.about,
    video?.details,
  ].find(value => typeof value === "string" && value.trim())?.trim() || "";
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") return String(item.text || item.prompt || item.title || item.label || "").trim();
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n{2,}|(?:^|\n)\s*[-•]\s+/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getVideoNotes(video) {
  const direct = [
    video?.notes,
    video?.lectureNotes,
    video?.lessonNotes,
    video?.keyNotes,
    video?.summary,
  ].find(value => typeof value === "string" && value.trim());
  if (direct) return direct.trim();
  return getVideoDescription(video);
}

function getVideoPrompts(video) {
  return normalizeTextList(video?.prompts || video?.lessonPrompts || video?.practicePrompts || video?.aiPrompts);
}

function getVideoResources(video) {
  const raw = video?.resources || video?.attachments || video?.links || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      if (typeof item === "string") return { title: item, url: item };
      if (item && typeof item === "object") {
        return {
          title: item.title || item.label || item.name || item.url || "Resource",
          url: item.url || item.href || item.link || "",
        };
      }
      return null;
    })
    .filter(Boolean);
}

function getVideoKey(video, index = 0) {
  return String(video?._id || video?.id || video?.bunnyGuid || video?.bunnyVideoId || video?.youtubeId || video?.videoId || index);
}

function isPlayableVideo(video) {
  return !!(video?.hlsUrl || video?.playlistUrl || video?.streamUrl || video?.embedUrl || video?.videoUrl || video?.bunnyGuid || video?.bunnyVideoId || video?.youtubeId || video?.videoId);
}

function getBunnyGuid(video) {
  if (video?.bunnyGuid) return String(video.bunnyGuid);
  if (video?.bunnyVideoId) return String(video.bunnyVideoId);
  const url = typeof video?.videoUrl === "string" ? video.videoUrl : typeof video?.embedUrl === "string" ? video.embedUrl : "";
  const match = url.match(/\/(?:embed\/\d+\/)?([0-9a-f-]{32,36})(?:[/?#]|$)/i);
  return match?.[1] || "";
}

function getBunnyLibraryId(video) {
  if (video?.bunnyLibraryId) return String(video.bunnyLibraryId);
  const url = typeof video?.videoUrl === "string" ? video.videoUrl : typeof video?.embedUrl === "string" ? video.embedUrl : "";
  return url.match(/\/embed\/(\d+)\//)?.[1] || "";
}

function getResumeInfo(course, progressByCourse = {}) {
  const progress = progressByCourse?.[course?._id];
  const videos = Array.isArray(course?.videos) ? course.videos : [];
  const completed = new Set((progress?.completedVideoIds || []).map(String));
  const videoProgress = progress?.videoProgress || {};
  for (let i = 0; i < videos.length; i++) {
    const key = getVideoKey(videos[i], i);
    if (!completed.has(key)) {
      const vp = videoProgress[key];
      return { index: i, seconds: Math.floor(vp?.watchedSeconds || 0) };
    }
  }
  return { index: 0, seconds: 0 };
}

function getCourseProgressPercent(course, progressByCourse = {}) {
  const saved = progressByCourse?.[course?._id];
  if (typeof saved?.progressPercent === "number") return Math.max(0, Math.min(100, saved.progressPercent));
  const videos = Array.isArray(course?.videos) ? course.videos : [];
  if (!videos.length) return 0;
  const completed = new Set((saved?.completedVideoIds || []).map(String));
  const completedCount = videos.filter((video, index) => completed.has(getVideoKey(video, index))).length;
  return Math.round((completedCount / videos.length) * 100);
}

function getCourseThumbnailUri(course, preferVertical = false) {
  const verticalUrl = course?.thumbnailVerticalUrl || null;
  const thumbnailUrl = course?.thumbnailUrl || null;
  return preferVertical
    ? verticalUrl || thumbnailUrl
    : thumbnailUrl || verticalUrl;
}

function getCourseThumbnailUris(course, preferVertical = false) {
  const urls = preferVertical
    ? [course?.thumbnailVerticalUrl, course?.thumbnailUrl]
    : [course?.thumbnailUrl, course?.thumbnailVerticalUrl];
  return [...new Set(urls.filter(Boolean))];
}

function getCourseThumbnailAsset(course, preferVertical = false) {
  const configuredAsset = preferVertical
    ? course?.thumbnailVerticalAsset || course?.thumbnailAsset || null
    : course?.thumbnailAsset || course?.thumbnailVerticalAsset || null;
  if (configuredAsset) return configuredAsset;

  const key = String(course?._id || course?.id || course?.title || "edunex");
  const hash = [...key].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0);
  return HOME_ARTWORK_IMAGES[hash % HOME_ARTWORK_IMAGES.length];
}

function getCourseThumbnailSource(course, preferVertical = false, uriIndex = 0) {
  const uris = getCourseThumbnailUris(course, preferVertical);
  if (uris[uriIndex]) return { uri: uris[uriIndex] };
  return getCourseThumbnailAsset(course, preferVertical);
}

function applyThemeColors(mode) {
  Object.assign(C, mode === "dark" ? DARK_THEME : LIGHT_THEME);
  if (typeof createStyles === "function") s = createStyles(C);
}

// ── Shared Components ─────────────────────────────────────────────────────────

function CourseThumbnailImage({ course, preferVertical = false }) {
  const uris = useMemo(
    () => getCourseThumbnailUris(course, preferVertical),
    [course?._id, course?.thumbnailUrl, course?.thumbnailVerticalUrl, preferVertical]
  );
  const asset = getCourseThumbnailAsset(course, preferVertical);
  const [uriIndex, setUriIndex] = useState(0);

  useEffect(() => {
    setUriIndex(0);
  }, [uris.join("|"), course?._id, preferVertical]);

  const source = getCourseThumbnailSource(course, preferVertical, uriIndex);
  if (!source) return null;

  return (
    <Image
      key={uris[uriIndex] || course?._id || "asset"}
      source={source}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      onError={() => {
        const failedUrl = uris[uriIndex];
        traceImageFailure({
          screen: preferVertical ? "CourseThumbnail.vertical" : "CourseThumbnail.landscape",
          courseId: course?._id || course?.id,
          imageUrl: failedUrl,
          fallbackUsed: Boolean(asset || uris[uriIndex + 1]),
        });
        setUriIndex(index => asset ? Math.min(index + 1, uris.length) : index + 1);
      }}
    />
  );
}

function RemoteThumbnailImage({ imageUrl, screen, courseId, borderRadius = 8 }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (!imageUrl || failed) return null;

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[StyleSheet.absoluteFill, { borderRadius }]}
      resizeMode="cover"
      onError={() => {
        traceImageFailure({ screen, courseId, imageUrl, fallbackUsed: true });
        setFailed(true);
      }}
    />
  );
}

function SkillomateLogo({ size = "md" }) {
  const iconSize = size === "lg" ? 44 : size === "sm" ? 28 : 36;
  const fontSize = size === "lg" ? 22 : size === "sm" ? 15 : 18;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={[s.logoBox, { width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }]}>
        <Ionicons name="school" size={iconSize * 0.55} color={C.primary} />
      </View>
      <Text style={[s.logoText, { fontSize }]}>Skillomate</Text>
    </View>
  );
}

function StepBar({ current }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
      {[1, 2].map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && (
            <View style={{ width: 44, height: 2, backgroundColor: current > 1 ? C.primary : C.border }} />
          )}
          <View style={[s.stepDot, {
            backgroundColor: n <= current ? C.primary : C.white,
            borderColor: n <= current ? C.primary : C.border,
          }]}>
            {n < current
              ? <Ionicons name="checkmark" size={14} color="#fff" />
              : <Text style={{ color: n === current ? "#fff" : C.textMuted, fontWeight: "700", fontSize: 13 }}>{n}</Text>
            }
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function FieldLabel({ label }) {
  return <Text style={s.fieldLabel}>{label}</Text>;
}

function FieldInput({ label, style, secureTextEntry, ...props }) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  if (secureTextEntry) {
    return (
      <View style={{ marginBottom: 16 }}>
        {label ? <FieldLabel label={label} /> : null}
        <View style={{ position: "relative" }}>
          <TextInput
            style={[s.input, { paddingRight: 52 }, style]}
            placeholderTextColor={C.textMuted}
            secureTextEntry={hidden}
            {...props}
          />
          <TouchableOpacity
            onPress={() => setHidden(h => !h)}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" }}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            accessibilityState={{ expanded: !hidden }}
          >
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <FieldLabel label={label} /> : null}
      <TextInput style={[s.input, style]} placeholderTextColor={C.textMuted} {...props} />
    </View>
  );
}

function PrimaryBtn({ title, onPress, loading, disabled, style, outline }) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled || loading}
      style={[
        s.btn,
        outline ? s.btnOutline : s.btnFill,
        (disabled || loading) && { opacity: 0.55 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
    >
      {loading
        ? <ActivityIndicator color={outline ? C.primary : "#fff"} />
        : <Text style={[s.btnText, outline && { color: C.primary }]}>{title}</Text>
      }
    </TouchableOpacity>
  );
}

function PasswordResetModal({
  visible,
  step,
  mobile,
  onMobileChange,
  otp,
  onOtpChange,
  newPassword,
  onNewPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  error,
  loading,
  onRequest,
  onConfirm,
  onChangeMobile,
  onClose,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}
      >
        <View style={s.resetSheet} accessibilityViewIsModal>
          <View style={s.resetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.resetTitle}>{step === "request" ? "Reset password" : "Create a new password"}</Text>
              <Text style={s.resetSubtitle}>
                {step === "request"
                  ? "We’ll send a one-time code to your registered mobile number."
                  : `Enter the code sent to ${mobile}.`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={s.resetCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close password reset"
            >
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {step === "request" ? (
            <FieldInput
              label="Registered mobile number"
              placeholder="Enter 10-digit number"
              value={mobile}
              onChangeText={value => onMobileChange(value.replace(/[^0-9]/g, ""))}
              keyboardType="phone-pad"
              maxLength={10}
              autoComplete="tel"
              accessibilityLabel="Registered mobile number"
            />
          ) : (
            <>
              <FieldInput
                label="Reset code"
                placeholder="6-digit code"
                value={otp}
                onChangeText={value => onOtpChange(value.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                maxLength={6}
                accessibilityLabel="Password reset code"
              />
              <FieldInput
                label="New password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChangeText={onNewPasswordChange}
                secureTextEntry
                autoComplete="new-password"
              />
              <FieldInput
                label="Confirm new password"
                placeholder="Enter the new password again"
                value={confirmPassword}
                onChangeText={onConfirmPasswordChange}
                secureTextEntry
                autoComplete="new-password"
              />
            </>
          )}

          {!!error && <Text style={s.errorText} accessibilityRole="alert">{error}</Text>}
          <PrimaryBtn
            title={step === "request" ? "Send reset code" : "Update password"}
            onPress={step === "request" ? onRequest : onConfirm}
            loading={loading}
          />
          {step === "confirm" && (
            <PrimaryBtn title="Use a different number" onPress={onChangeMobile} outline style={{ marginTop: 10 }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const AGES = Array.from({ length: 76 }, (_, i) => i + 5); // backend accepts ages 5–80
const AGE_ITEM_W = 60;

function AgePicker({ value, onChange }) {
  const selected = value !== "" && value !== undefined ? Number(value) : 0;
  const scrollRef = useRef(null);
  const [containerW, setContainerW] = useState(Dimensions.get("window").width - 48);
  const [scrollX, setScrollX] = useState(AGES.indexOf(selected) * AGE_ITEM_W);

  const initialOffset = Math.max(0, AGES.indexOf(selected) * AGE_ITEM_W);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialOffset, animated: false });
    }, 150);
  }, []);

  function onMomentumEnd(e) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / AGE_ITEM_W);
    const clamped = Math.max(0, Math.min(AGES.length - 1, idx));
    onChange(String(AGES[clamped]));
  }

  const OPACITIES = [1, 0.55, 0.3, 0.15, 0.08];
  const centreIdx = scrollX / AGE_ITEM_W;
  const padding = (containerW - AGE_ITEM_W) / 2;

  return (
    <View style={{ marginBottom: 20 }} onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
      <View style={{ alignItems: "center", marginBottom: 4 }}>
        <Text style={{ color: C.primary, fontSize: 12 }}>▼</Text>
      </View>
      <View style={{ height: 64, borderRadius: 36, backgroundColor: C.lightGray, overflow: "hidden" }}>
        <View pointerEvents="none" style={{
          position: "absolute", top: 4, bottom: 4,
          left: (containerW - AGE_ITEM_W) / 2, width: AGE_ITEM_W,
          borderRadius: 12, borderWidth: 2, borderColor: C.primary,
          backgroundColor: C.primaryLight,
        }} />
        <ScrollView
          ref={scrollRef}
          horizontal
          snapToInterval={AGE_ITEM_W}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => setScrollX(e.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={onMomentumEnd}
          nestedScrollEnabled
          contentContainerStyle={{ paddingHorizontal: padding }}
        >
          {AGES.map((age, i) => {
            const dist = Math.abs(i - centreIdx);
            const opacity = dist < OPACITIES.length ? OPACITIES[Math.floor(dist)] : 0.05;
            const isCenter = dist < 0.5;
            return (
              <View key={age} style={{ width: AGE_ITEM_W, height: 64, alignItems: "center", justifyContent: "center", opacity }}>
                <Text style={{
                  fontSize: isCenter ? 22 : 16,
                  fontWeight: isCenter ? "800" : "400",
                  color: isCenter ? C.primary : C.text,
                }}>
                  {age}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: C.primary, fontSize: 12 }}>▲</Text>
        <Text style={{ color: C.textSub, fontSize: 12, marginTop: 2 }}>Age: {selected}</Text>
      </View>
    </View>
  );
}

function Badge({ label, color }) {
  const bg = color === "blue" ? C.primaryLight : color === "green" ? "#EDF7EA" : color === "orange" ? "#FBF0DA" : "#FBEAE7";
  const tc = color === "blue" ? C.primary : color === "green" ? C.success : color === "orange" ? C.warning : C.danger;
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: tc }]}>{label}</Text>
    </View>
  );
}

function UpgradeModal({ visible, onClose }) {
  const FEATURES = [
    "Certificate of Completion",
    "Ad-free learning experience",
    "Offline downloads for on-the-go",
    "Exclusive AI workshops",
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.upgradeOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[s.upgradeSheet, { backgroundColor: C.white }]}>

          {/* Close */}
          <TouchableOpacity style={s.upgradeClose} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.textMuted} />
          </TouchableOpacity>

            {/* Banner */}
          <View style={[s.upgradeBanner, { backgroundColor: C.accentSoft }]}>
            {Array.from({ length: 20 }, (_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: `rgba(197,139,42,${(0.08 * Math.pow(i / 19, 2)).toFixed(3)})` }} />
            ))}
            <View style={[s.upgradeBannerBadge, { backgroundColor: C.accent }]}>
              <Text style={s.upgradeBannerBadgeText}>LIMITED TIME OFFER</Text>
            </View>
            <View style={s.upgradeBannerIcon}>
              <Ionicons name="ribbon" size={38} color={C.accent} />
            </View>
            {/* Earning potential badge */}
            <View style={{ position: "absolute", top: 16, right: 56, backgroundColor: "rgba(197,139,42,0.12)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(197,139,42,0.28)" }}>
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: "800" }}>EARNING POTENTIAL +240%</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 14 }}>
            {/* Title */}
            <Text style={[s.upgradeTitle, { color: C.text }]}>Unlock Your AI Future for</Text>
            <Text style={[s.upgradeTitle, { color: C.primary, fontSize: 32, marginTop: -4 }]}>just ₹1</Text>
            <Text style={[s.upgradeSub, { color: C.textSub }]}>Join 100,000+ students mastering the AI economy.</Text>

            {/* Pricing card */}
            <View style={[s.upgradePricingCard, { backgroundColor: C.cardBg, borderColor: C.primary }]}>
              <View style={s.upgradeBestValue}>
                <Text style={s.upgradeBestValueText}>BEST VALUE</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 4 }}>
                <Text style={[s.upgradeCurrency, { color: C.text }]}>₹</Text>
                <Text style={[s.upgradePrice, { color: C.primary }]}>1</Text>
                <Text style={[s.upgradePricePeriod, { color: C.textSub }]}>  Trial for 7 Days</Text>
              </View>
              <Text style={[s.upgradePriceNote, { color: C.textMuted }]}>Then ₹499/month. Cancel anytime before trial ends.</Text>
            </View>

            {/* Features */}
            {FEATURES.map((f, i) => (
              <View key={i} style={s.upgradeFeatureRow}>
                <Ionicons name="checkmark-circle" size={19} color={C.primary} />
                <Text style={[s.upgradeFeatureText, { color: C.text }]}>{f}</Text>
              </View>
            ))}

            {/* CTA */}
            <TouchableOpacity
              style={[s.upgradeBtn, { backgroundColor: C.primary, shadowColor: C.primary }]}
              activeOpacity={0.85}
              onPress={() => { onClose(); Linking.openURL(SUBSCRIPTION_URL); }}
            >
              <Text style={[s.upgradeBtnText, { color: C.bg }]}>Start My ₹1 Trial  →</Text>
            </TouchableOpacity>

            <Text style={{ color: C.textMuted, fontSize: 11, textAlign: "center", marginBottom: 4 }}>No commitment. Cancel anytime before trial ends.</Text>

            {/* Footer */}
            <View style={s.upgradeFooter}>
              <Ionicons name="shield-checkmark" size={13} color={C.textMuted} />
              <Text style={s.upgradeFooterText}>SAFE & SECURE PAYMENT</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NotificationPreviewModal({ visible, onClose, onOpenCourses, onOpenAI, onOpenSubscription }) {
  const items = [
    {
      icon: "play-circle-outline",
      title: "New AI lesson is ready",
      body: "ChatGPT for Professionals added a short lesson on client-ready prompts.",
      time: "2 min ago",
      action: onOpenCourses,
    },
    {
      icon: "ribbon-outline",
      title: "Keep your streak moving",
      body: "Finish one more lesson today to stay on track for your certificate.",
      time: "Today",
      action: onOpenCourses,
    },
    {
      icon: "sparkles-outline",
      title: "Nex AI suggestion",
      body: "Try a 7-day roadmap for learning AI automation and earning with it.",
      time: "Today",
      action: onOpenAI,
    },
    {
      icon: "pricetag-outline",
      title: "Trial reminder",
      body: "Your ₹1 Trial and monthly plan details are available in Subscription Details.",
      time: "This week",
    },
  ];

  const openItem = action => {
    action?.();
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.notificationOverlay} onPress={onClose}>
        <Pressable style={s.notificationSheet}>
          <View style={s.notificationHandle} />
          <View style={s.notificationHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.notificationTitle}>Notifications</Text>
              <Text style={s.notificationSubtitle}>Preview of upcoming Skillomate alerts</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.notificationClose}>
              <Ionicons name="close" size={19} color={C.text} />
            </TouchableOpacity>
          </View>
          {items.map((item, index) => {
            const Row = item.action ? TouchableOpacity : View;
            return (
            <Row
              key={item.title}
              style={[s.notificationItem, index === items.length - 1 && { borderBottomWidth: 0 }]}
              activeOpacity={item.action ? 0.82 : undefined}
              onPress={item.action ? () => openItem(item.action) : undefined}
            >
              <View style={s.notificationIcon}>
                <Ionicons name={item.icon} size={19} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.notificationItemTop}>
                  <Text style={s.notificationItemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.notificationTime}>{item.time}</Text>
                </View>
                <Text style={s.notificationBody} numberOfLines={2}>{item.body}</Text>
              </View>
              {item.action ? <Ionicons name="chevron-forward" size={17} color={C.textMuted} /> : null}
            </Row>
          );})}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BottomNav({ active, onHome, onCourses, onAI, onDownloads, onProfile, aiRobotId }) {
  const tabs = [
    { key: "home", icon: "home", label: "Home", fn: onHome },
    { key: "courses", icon: "compass", label: "Explore", fn: onCourses },
    { key: "downloads", icon: "download", label: "Downloads", fn: onDownloads },
    { key: "ai", icon: "sparkles", label: "Nex AI", fn: onAI },
    { key: "profile", icon: "person", label: "Profile", fn: onProfile },
  ];
  return (
    <View style={s.bottomNav}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          onPress={t.fn}
          style={s.bottomTab}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          accessibilityState={{ selected: active === t.key }}
        >
          <View style={[s.bottomTabIcon, active === t.key && s.bottomTabIconActive]}>
            <Ionicons
              name={active === t.key ? t.icon : `${t.icon}-outline`}
              size={20}
              color={active === t.key ? C.primary : C.slateGray}
            />
          </View>
          <Text
            style={[s.bottomTabLabel, active === t.key && { color: C.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.9}
            maxFontSizeMultiplier={1.15}
          >
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── VideoItem ─────────────────────────────────────────────────────────────────
function VideoItem({ video: videoProp, videoId: videoIdProp, isActive, height, onComplete, onProgress, onEnded, initialTime = 0, localPath }) {
  const video = videoProp || (videoIdProp ? { youtubeId: videoIdProp } : {});
  const nativeVideoUrl = getNativeVideoUrl(video, localPath);
  const hasNativeVideo = !!nativeVideoUrl;
  const isOffline = !!localPath;
  const canFallbackToEmbed = !isOffline && !!(video.bunnyGuid || video.bunnyVideoId || video.videoUrl || video.embedUrl || video.youtubeId || video.videoId);
  const [nativePlaybackFailed, setNativePlaybackFailed] = useState(false);
  const isNativeVideo = hasNativeVideo && !(nativePlaybackFailed && canFallbackToEmbed);
  const isBunny = !isNativeVideo && !!(video.bunnyGuid || video.bunnyVideoId || video.videoUrl || video.embedUrl);
  const webViewRef = useRef(null);
  const videoRef = useRef(null);
  const seekBarWidth = useRef(0);
  const tapInfoRef = useRef({ count: 0, side: null, timer: null });
  const completionSentRef = useRef(false);
  const progressSentAtRef = useRef(0);
  const seekGuardRef = useRef({ until: 0, target: 0 });
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef(0);
  const initialSeekDoneRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState("Auto");
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [seekAnim, setSeekAnim] = useState(null);
  const html = useMemo(() => {
    let provider = "youtube";
    let originalMedia = video?.youtubeId || video?.videoId || "";
    let finalUrl = `https://www.youtube.com/embed/${originalMedia}`;
    let nextHtml;
    if (video.embedUrl || (!isDirectMediaUrl(video.videoUrl) && video.videoUrl)) {
      provider = "bunny-url";
      originalMedia = video.embedUrl || video.videoUrl;
      finalUrl = video.embedUrl || video.videoUrl;
      nextHtml = buildEmbedPlayerHtml(finalUrl, initialTime);
    } else if (video.bunnyGuid || video.bunnyVideoId) {
      provider = "bunny-guid";
      originalMedia = video.bunnyGuid || video.bunnyVideoId;
      finalUrl = `https://iframe.mediadelivery.net/embed/${video?.bunnyLibraryId || "675520"}/${originalMedia}`;
      nextHtml = buildEmbedPlayerHtml(finalUrl, initialTime);
    } else {
      nextHtml = buildYoutubePlayerHtml(video?.youtubeId || video || "", PLAYER_ORIGIN);
    }
    if (__DEV__ && DEV_UI_QA_ENABLED) {
      console.log("[Skillomate LessonPlayer media]", {
        title: video?.title || "",
        provider,
        originalMedia,
        parsedId: originalMedia,
        finalUrl,
      });
    }
    return nextHtml;
  }, [video?.youtubeId, video?.videoId, video?.bunnyGuid, video?.bunnyVideoId, video?.bunnyLibraryId, video?.videoUrl, video?.embedUrl, initialTime]);

  useEffect(() => {
    const startAt = finiteSeconds(initialTime, 0);
    completionSentRef.current = false;
    progressSentAtRef.current = 0;
    initialSeekDoneRef.current = false;
    dragTargetRef.current = startAt;
    seekGuardRef.current = startAt > 0 ? { until: Date.now() + 3000, target: startAt } : { until: 0, target: 0 };
    setCurrentTime(startAt);
    setDuration(0);
    setIsEnded(false);
    setIsPlaying(isActive);
    setNativePlaybackFailed(false);
  }, [video?.youtubeId, video?.videoId, video?.bunnyGuid, video?.bunnyVideoId, video?.videoUrl, video?.hlsUrl, video?.embedUrl, localPath, initialTime, isActive]);

  function sendCmd(func, args = []) {
    if (isNativeVideo) {
      (async () => {
        try {
          const v = videoRef.current;
          if (!v) return;
          if (func === "playVideo") await v.playAsync();
          else if (func === "pauseVideo") await v.pauseAsync();
          else if (func === "seekTo") await v.setPositionAsync(clampSeconds(args[0], duration) * 1000);
          else if (func === "setPlaybackRate") await v.setRateAsync(args[0] || 1, true);
          else if (func === "mute") await v.setIsMutedAsync(true);
          else if (func === "unMute") await v.setIsMutedAsync(false);
        } catch {}
      })();
      return;
    }
    if (isBunny) {
      const map = { playVideo:"bunnyPlay()", pauseVideo:"bunnyPause()", mute:"bunnyMute(true)", unMute:"bunnyMute(false)" };
      const call = func === "setPlaybackRate" ? `bunnySpeed(${args[0]})` : func === "seekTo" ? `bunnySeek(${args[0]})` : map[func];
      if (call) {
        webViewRef.current?.injectJavaScript(`
          (function(){
            var tries = 0;
            function run(){
              try { ${call}; return; } catch(e) {}
              if (++tries < 20) setTimeout(run, 100);
            }
            run();
          })();
          true;
        `);
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function(){
          var func = ${JSON.stringify(func)};
          var args = ${JSON.stringify(args)};
          var tries = 0;
          function run(){
            try {
              if (typeof window.ytCmd === 'function') {
                window.ytCmd(func, args);
                return;
              }
            } catch(e) {}
            if (++tries < 20) setTimeout(run, 100);
          }
          run();
        })();
        true;
      `);
    }
  }

  useEffect(() => {
    if (isActive) { sendCmd("playVideo"); setIsPlaying(true); }
    else { sendCmd("pauseVideo"); setIsPlaying(false); }
  }, [isActive, isNativeVideo, isBunny]);

  useEffect(() => {
    if (!isNativeVideo) return;
    sendCmd(isMuted ? "mute" : "unMute");
  }, [isMuted, isNativeVideo]);

  useEffect(() => {
    if (!isNativeVideo) return;
    sendCmd("setPlaybackRate", [playbackRate]);
  }, [playbackRate, isNativeVideo]);

  useEffect(() => () => {
    const timer = tapInfoRef.current.timer;
    if (timer) clearTimeout(timer);
  }, []);

  function markCompleteOnce() {
    if (completionSentRef.current) return;
    completionSentRef.current = true; onComplete?.();
  }

  function handleOfflineStatus(status) {
    if (!status.isLoaded) {
      if (status.error && canFallbackToEmbed) {
        setNativePlaybackFailed(true);
        setDuration(0);
        setCurrentTime(0);
        setIsPlaying(false);
      }
      return;
    }
    const dur = finiteSeconds((status.durationMillis || 0) / 1000, duration);
    const ct = clampSeconds((status.positionMillis || 0) / 1000, dur);
    if (!initialSeekDoneRef.current && initialTime > 0 && dur > 0) {
      initialSeekDoneRef.current = true;
      const startAt = clampSeconds(initialTime, dur);
      dragTargetRef.current = startAt;
      seekGuardRef.current = { until: Date.now() + 3000, target: startAt };
      setCurrentTime(startAt);
      videoRef.current?.setPositionAsync(startAt * 1000).catch(() => {});
      return;
    }
    if (isDraggingRef.current) {
      if (dur > 0) setDuration(dur);
      setIsPlaying(!!status.isPlaying);
      return;
    }
    if (Date.now() < seekGuardRef.current.until && Math.abs(ct - seekGuardRef.current.target) > 1.5) {
      if (dur > 0) setDuration(dur);
      setIsPlaying(!!status.isPlaying);
      return;
    }
    setCurrentTime(ct);
    if (dur > 0) setDuration(dur);
    setIsPlaying(!!status.isPlaying);
    if (status.didJustFinish) {
      setIsEnded(true); markCompleteOnce(); onEnded?.();
    } else {
      setIsEnded(false);
    }
    if (dur > 0 && ct / dur >= VIDEO_COMPLETE_THRESHOLD) markCompleteOnce();
    const now = Date.now();
    if (dur > 0 && now - progressSentAtRef.current >= 5000) {
      progressSentAtRef.current = now; onProgress?.(ct, dur);
    }
  }

  function handleMsg(e) {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (d.type === "ready") {
        if (isActive) {
          if (initialTime > 0) sendCmd("seekTo", [initialTime, true]);
          sendCmd("playVideo");
        } else {
          sendCmd("pauseVideo");
        }
        return;
      }
      if (d.type === "stateChange") {
        if (typeof d.playing === "boolean") setIsPlaying(d.playing);
        if (d.playerState === 0) setIsEnded(true);
        return;
      }
      if (d.type === "qualities") { setQualities(d.qualities || []); return; }
      if (d.type === "timeUpdate") {
        const nextDuration = finiteSeconds(d.duration, duration);
        const nextTime = clampSeconds(d.currentTime, nextDuration);
        if (isDraggingRef.current) {
          if (nextDuration > 0) setDuration(nextDuration);
          return;
        }
        if (Date.now() < seekGuardRef.current.until && Math.abs(nextTime - seekGuardRef.current.target) > 1.5) {
          if (nextDuration > 0) setDuration(nextDuration);
          return;
        }
        setCurrentTime(nextTime);
        if (nextDuration > 0) setDuration(nextDuration);
        if (d.playerState === 0) { setIsPlaying(false); setIsEnded(true); markCompleteOnce(); onEnded?.(); }
        else if (d.playerState === 1) { setIsPlaying(true); setIsEnded(false); }
        else if (d.playerState === 2 || d.playerState === 5) setIsPlaying(false);
        if (nextDuration > 0 && nextTime / nextDuration >= VIDEO_COMPLETE_THRESHOLD) markCompleteOnce();
        const now = Date.now();
        if (nextDuration > 0 && now - progressSentAtRef.current >= 5000) {
          progressSentAtRef.current = now; onProgress?.(nextTime, nextDuration);
        }
      }
    } catch {}
  }

  function togglePlay() {
    const nowPlaying = !isPlaying;
    sendCmd(isPlaying ? "pauseVideo" : "playVideo");
    setIsPlaying(nowPlaying);
  }
  function toggleMute() { sendCmd(isMuted ? "unMute" : "mute"); setIsMuted(m => !m); }
  function selectSpeed(r) { sendCmd("setPlaybackRate", [r]); setPlaybackRate(r); setShowSpeedPicker(false); }
  function selectQuality(q) {
    webViewRef.current?.injectJavaScript(`try{bunnyQuality(${JSON.stringify(q)});}catch(e){} true;`);
    setCurrentQuality(q); setShowQualityPicker(false);
  }

  function handleSeekDrag(x) {
    if (!seekBarWidth.current || !duration) return;
    const t = clampSeconds((Math.max(0, Math.min(1, x / seekBarWidth.current)) * duration), duration);
    isDraggingRef.current = true;
    dragTargetRef.current = t;
    setCurrentTime(t);
  }

  function handleSeekCommit() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const t = clampSeconds(dragTargetRef.current, duration);
    seekGuardRef.current = { until: Date.now() + 3000, target: t };
    setCurrentTime(t);
    if (duration <= 0 || t < duration - 0.5) setIsEnded(false);
    sendCmd("seekTo", [t, true]);
  }

  function restart() {
    sendCmd("seekTo", [0, true]); sendCmd("playVideo");
    setIsEnded(false); setIsPlaying(true); setCurrentTime(0);
  }

  function seekBy(secs) {
    const t = clampSeconds(currentTime + secs, duration);
    seekGuardRef.current = { until: Date.now() + 3000, target: t };
    if (duration <= 0 || t < duration - 0.5) setIsEnded(false);
    setCurrentTime(t); sendCmd("seekTo", [t, true]);
    setSeekAnim(secs > 0 ? "right" : "left");
    setTimeout(() => setSeekAnim(null), 600);
  }

  function handleSideTap(side) {
    const info = tapInfoRef.current;
    if (info.timer) clearTimeout(info.timer);
    if (info.count === 1 && info.side === side) {
      info.count = 0; info.side = null; info.timer = null;
      seekBy(side === "right" ? 10 : -10);
    } else {
      info.count = 1; info.side = side;
      info.timer = setTimeout(() => {
        info.count = 0; info.side = null; info.timer = null;
      }, 280);
    }
  }

  function handleCenterTap() {
    if (showSpeedPicker) { setShowSpeedPicker(false); return; }
    if (showQualityPicker) { setShowQualityPicker(false); return; }
    togglePlay();
  }

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  return (
    <View style={[s.player, { height }]}>
      {isNativeVideo ? (
        <Video
          ref={videoRef}
          source={{ uri: nativeVideoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          shouldPlay={isActive && isPlaying}
          isMuted={isMuted}
          rate={playbackRate}
          shouldCorrectPitch
          progressUpdateIntervalMillis={1000}
          onPlaybackStatusUpdate={handleOfflineStatus}
        />
      ) : (
        <WebView
          ref={webViewRef}
          allowsInlineMediaPlayback allowsFullscreenVideo={false}
          domStorageEnabled javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          onLoadEnd={() => { setTimeout(() => isActive ? sendCmd("playVideo") : sendCmd("pauseVideo"), 500); }}
          onMessage={handleMsg}
          originWhitelist={["*"]} thirdPartyCookiesEnabled
          source={{ html, baseUrl: PLAYER_ORIGIN }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!isPlaying && !isEnded && (
        <View style={s.pauseOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.85)" />
        </View>
      )}
      {isEnded ? (
        <TouchableOpacity onPress={restart} style={s.restartOverlay}>
          <Ionicons name="refresh-circle" size={72} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      ) : (
        <>
          <Pressable
            onPress={() => handleSideTap("left")}
            style={s.tapLeft}
            accessibilityRole="button"
            accessibilityLabel="Rewind video"
          />
          <Pressable
            onPress={handleCenterTap}
            style={s.tapCenter}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
          />
          <Pressable
            onPress={() => handleSideTap("right")}
            style={s.tapRight}
            accessibilityRole="button"
            accessibilityLabel="Fast forward video"
          />
          {seekAnim === "left" && (
            <View style={[s.seekFlash, s.seekFlashLeft]} pointerEvents="none">
              <Ionicons name="play-back" size={22} color="#fff" />
              <Text style={s.seekFlashText}>10s</Text>
            </View>
          )}
          {seekAnim === "right" && (
            <View style={[s.seekFlash, s.seekFlashRight]} pointerEvents="none">
              <Text style={s.seekFlashText}>10s</Text>
              <Ionicons name="play-forward" size={22} color="#fff" />
            </View>
          )}
        </>
      )}
      {showSpeedPicker && (
        <View style={s.speedPicker}>
          {SPEEDS.map(r => (
            <TouchableOpacity key={r} onPress={() => selectSpeed(r)} style={[s.speedOption, playbackRate === r && s.speedOptionActive]}>
              <Text style={s.speedOptionText}>{r}×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showQualityPicker && qualities.length > 0 && (
        <View style={s.qualityPicker}>
          {qualities.map(q => (
            <TouchableOpacity key={q} onPress={() => selectQuality(q)} style={[s.speedOption, currentQuality === q && s.speedOptionActive]}>
              <Text style={s.speedOptionText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {isOffline && (
        <View style={s.offlineBadge} pointerEvents="none">
          <Ionicons name="arrow-down-circle" size={11} color="#fff" />
          <Text style={s.offlineBadgeText}>Offline</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={() => { setShowSpeedPicker(v => !v); setShowQualityPicker(false); }}
        style={s.speedButton}
        accessibilityRole="button"
        accessibilityLabel="Change playback speed"
      >
        <Text style={s.speedButtonText}>{playbackRate}×</Text>
      </TouchableOpacity>
      {isBunny && qualities.length > 0 && (
        <TouchableOpacity
          onPress={() => { setShowQualityPicker(v => !v); setShowSpeedPicker(false); }}
          style={s.qualityButton}
          accessibilityRole="button"
          accessibilityLabel="Change video quality"
        >
          <Ionicons name="settings-outline" size={16} color="#fff" />
          <Text style={s.speedButtonText}>{currentQuality}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={toggleMute}
        style={s.muteButton}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
      >
        <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
      </TouchableOpacity>
      {!isEnded && (
        <TouchableOpacity
          onPress={togglePlay}
          style={s.playPauseButton}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
        </TouchableOpacity>
      )}
      <View style={s.timeDisplay} pointerEvents="none">
        <Text style={s.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
      </View>
      <View
        style={s.timeline}
        onLayout={e => { seekBarWidth.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => handleSeekDrag(e.nativeEvent.locationX)}
        onResponderMove={e => handleSeekDrag(e.nativeEvent.locationX)}
        onResponderRelease={handleSeekCommit}
        onResponderTerminate={handleSeekCommit}
      >
        <View style={s.timelineTrack} pointerEvents="none">
          <View style={[s.timelineFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[s.timelineThumb, { left: `${progress * 100}%` }]} pointerEvents="none" />
      </View>
    </View>
  );
}

// ── ReelsScreen ───────────────────────────────────────────────────────────────
function ReelsScreen({ courseId, initialIndex, initialTime, onBack, user, onVideoComplete, onVideoProgress, downloads, preloadedVideos }) {
  const [videos, setVideos] = useState(preloadedVideos || []);
  const [loading, setLoading] = useState(!preloadedVideos);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex ?? 0);
  const [listHeight, setListHeight] = useState(Dimensions.get("window").height);
  const [showDescription, setShowDescription] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showCourseAi, setShowCourseAi] = useState(false);
  const [courseAiInput, setCourseAiInput] = useState("");
  const [courseAiMessages, setCourseAiMessages] = useState([
    { role: "assistant", content: "Ask me to explain this video, summarize key points, or help with doubts from the lesson." },
    ...(DEV_UI_QA_ENABLED ? UI_QA_AI_MESSAGES : []),
  ]);
  const [courseAiLoading, setCourseAiLoading] = useState(false);
  const vcRef = useRef({ itemVisiblePercentThreshold: 50 });
  const flatListRef = useRef(null);

  const activeVideo = videos[activeIndex];
  const activeTitle = activeVideo?.title || "";
  const activeDescription = getVideoDescription(activeVideo) || "No description available.";
  const activeNotes = getVideoNotes(activeVideo);
  const activePrompts = getVideoPrompts(activeVideo);
  const activeResources = getVideoResources(activeVideo);
  const hasSeparateNotes = !!activeNotes && activeNotes !== activeDescription;

  useEffect(() => {
    if (preloadedVideos) return; // already have videos, skip fetch
    if (!user?._id || !user?.sessionId) { setError("Subscription required."); setLoading(false); return; }
    fetch(`${API_BASE}/api/courses/${courseId}/videos?userId=${encodeURIComponent(user._id)}&sessionId=${encodeURIComponent(user.sessionId)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setVideos(d.videos || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (!AI_FEATURE_ENABLED) {
      setCourseAiMessages([{ role: "assistant", content: "AI is paused for now." }]);
      setCourseAiInput("");
      setCourseAiLoading(false);
      return;
    }
    setCourseAiMessages([
      { role: "assistant", content: "Ask me to explain this video, summarize key points, or help with doubts from the lesson." },
      ...(DEV_UI_QA_ENABLED ? UI_QA_AI_MESSAGES : []),
    ]);
    setCourseAiInput("");
    setShowNotes(false);
  }, [activeIndex]);

  const onViewable = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index);
  }, []);


  async function sendCourseAiMessage(promptText = courseAiInput) {
    const question = promptText.trim();
    if (!question || courseAiLoading) return;
    if (!AI_FEATURE_ENABLED) {
      setCourseAiMessages(prev => [...prev, { role: "assistant", content: "AI is paused for now." }]);
      return;
    }
    if (!user?._id || !user?.sessionId) {
      setCourseAiMessages(prev => [...prev, { role: "assistant", content: "Please log in again before using Course AI." }]);
      return;
    }
    setCourseAiMessages(prev => [...prev, { role: "user", content: question }]);
    setCourseAiInput("");
    setCourseAiLoading(true);
    if (DEV_UI_QA_ENABLED) {
      setTimeout(() => {
        setCourseAiMessages(prev => [...prev, ...UI_QA_AI_MESSAGES]);
        setCourseAiLoading(false);
      }, 250);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/course-ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id, sessionId: user.sessionId, videoTitle: activeTitle, videoDescription: activeDescription, question, messages: courseAiMessages }),
      });
      const raw = await res.text();
      let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch {}
      setCourseAiMessages(prev => [...prev, { role: "assistant", content: res.ok ? data.answer : data.error || "AI is unavailable right now." }]);
    } catch {
      setCourseAiMessages(prev => [...prev, { role: "assistant", content: "AI is unavailable right now. Please try again." }]);
    } finally { setCourseAiLoading(false); }
  }

  if (loading) return (
    <View style={[s.centered, { backgroundColor: "#000" }]}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  );

  if (error || videos.length === 0) return (
    <View style={[s.centered, { backgroundColor: "#000" }]}>
      <Text style={{ color: "#fff", marginBottom: 16 }}>{error || "No videos yet."}</Text>
      <TouchableOpacity onPress={onBack} style={s.btnFill}>
        <Text style={s.btnText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}
      onLayout={e => setListHeight(e.nativeEvent.layout.height)}>
      <FlatList
        ref={flatListRef}
        data={videos} keyExtractor={i => i._id}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={initialIndex ?? 0}
        snapToInterval={listHeight} snapToAlignment="start"
        decelerationRate="fast" disableIntervalMomentum
        scrollEnabled={videos.length > 1}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <VideoItem video={item}
            onComplete={() => onVideoComplete?.(courseId, getVideoKey(item, index))}
            onProgress={(currentTime, duration) => onVideoProgress?.(courseId, getVideoKey(item, index), currentTime, duration)}
            onEnded={() => {
              if (index === activeIndex && index < videos.length - 1) {
                flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
              }
            }}
            isActive={index === activeIndex} height={listHeight}
            initialTime={index === (initialIndex ?? 0) ? (initialTime ?? 0) : 0}
            localPath={downloads?.[getBunnyGuid(item)]?.status === "done" ? downloads[getBunnyGuid(item)].path : null} />
        )}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={vcRef.current}
        getItemLayout={(_, i) => ({ length: listHeight, offset: listHeight * i, index: i })}
      />

      <SafeAreaView style={s.reelsTopBar} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onBack}
          style={s.reelsTopBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setShowDescription(true)}
          style={s.reelsTopBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Show lesson information"
        >
          <Ionicons name="information-circle-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
      <TouchableOpacity
        onPress={() => setShowCourseAi(true)}
        style={s.reelsAiBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Ask Course AI"
      >
        <Ionicons name="sparkles" size={16} color="#fff" />
        <Text style={s.playerAiButtonText}>AI</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowNotes(true)}
        style={s.reelsNotesBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Open lecture notes and prompts"
      >
        <Ionicons name="document-text-outline" size={16} color="#fff" />
        <Text style={s.playerAiButtonText}>Notes</Text>
      </TouchableOpacity>

      <Modal visible={showDescription} transparent animationType="slide" onRequestClose={() => setShowDescription(false)}>
        <Pressable style={s.descriptionOverlay} onPress={() => setShowDescription(false)}>
          <Pressable style={s.descriptionSheet}>
            <View style={s.descriptionHandle} />
            <View style={s.descriptionHeader}>
              <Text style={s.descriptionTitle} numberOfLines={2}>{activeTitle || "Video description"}</Text>
              <TouchableOpacity onPress={() => setShowDescription(false)} style={s.descriptionClose}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.descriptionScroll} contentContainerStyle={s.descriptionContent}>
              <View style={s.lessonNotesBlock}>
                <View style={s.lessonNotesBlockHeader}>
                  <Ionicons name="information-circle-outline" size={16} color={C.primary} />
                  <Text style={s.lessonNotesBlockTitle}>About this lesson</Text>
                </View>
                <Text style={s.descriptionBody}>{activeDescription}</Text>
              </View>

              {hasSeparateNotes && (
                <View style={s.lessonNotesBlock}>
                  <View style={s.lessonNotesBlockHeader}>
                    <Ionicons name="reader-outline" size={16} color={C.primary} />
                    <Text style={s.lessonNotesBlockTitle}>Lecture Notes</Text>
                  </View>
                  <Text style={s.lessonNotesBody}>{activeNotes}</Text>
                </View>
              )}

              {activePrompts.length > 0 && (
                <View style={s.lessonNotesBlock}>
                  <View style={s.lessonNotesBlockHeader}>
                    <Ionicons name="sparkles-outline" size={16} color={C.primary} />
                    <Text style={s.lessonNotesBlockTitle}>Practice Prompts</Text>
                  </View>
                  {activePrompts.map((prompt, index) => (
                    <View key={`${prompt}-${index}`} style={s.lessonPromptCard}>
                      <Text style={s.lessonPromptIndex}>{String(index + 1).padStart(2, "0")}</Text>
                      <Text selectable style={s.lessonPromptText}>{prompt}</Text>
                    </View>
                  ))}
                </View>
              )}

              {activeResources.length > 0 && (
                <View style={s.lessonNotesBlock}>
                  <View style={s.lessonNotesBlockHeader}>
                    <Ionicons name="link-outline" size={16} color={C.primary} />
                    <Text style={s.lessonNotesBlockTitle}>Resources</Text>
                  </View>
                  {activeResources.map((resource, index) => (
                    <TouchableOpacity
                      key={`${resource.title}-${index}`}
                      style={s.lessonResourceRow}
                      onPress={() => resource.url ? Linking.openURL(resource.url).catch(() => Alert.alert("Error", "Could not open this resource.")) : null}
                      accessibilityRole="button"
                      accessibilityLabel={`Open resource ${resource.title}`}
                    >
                      <Text style={s.lessonResourceTitle} numberOfLines={2}>{resource.title}</Text>
                      <Ionicons name="open-outline" size={16} color={C.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showNotes} transparent animationType="slide" onRequestClose={() => setShowNotes(false)}>
        <Pressable style={s.descriptionOverlay} onPress={() => setShowNotes(false)}>
          <Pressable style={s.lessonNotesSheet}>
            <View style={s.descriptionHandle} />
            <View style={s.descriptionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.descriptionTitle} numberOfLines={2}>{activeTitle || "Lecture notes"}</Text>
                <Text style={s.lessonNotesSub}>Notes and prompts for this lecture</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotes(false)} style={s.descriptionClose} accessibilityRole="button" accessibilityLabel="Close lecture notes">
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.descriptionScroll} contentContainerStyle={s.lessonNotesContent}>
              <View style={s.lessonNotesBlock}>
                <View style={s.lessonNotesBlockHeader}>
                  <Ionicons name="reader-outline" size={16} color={C.primary} />
                  <Text style={s.lessonNotesBlockTitle}>Lecture Notes</Text>
                </View>
                <Text style={s.lessonNotesBody}>
                  {activeNotes || "No notes shared for this lecture yet."}
                </Text>
              </View>

              <View style={s.lessonNotesBlock}>
                <View style={s.lessonNotesBlockHeader}>
                  <Ionicons name="sparkles-outline" size={16} color={C.primary} />
                  <Text style={s.lessonNotesBlockTitle}>Practice Prompts</Text>
                </View>
                {activePrompts.length ? activePrompts.map((prompt, index) => (
                  <View key={`${prompt}-${index}`} style={s.lessonPromptCard}>
                    <Text style={s.lessonPromptIndex}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text selectable style={s.lessonPromptText}>{prompt}</Text>
                  </View>
                )) : (
                  <Text style={s.lessonNotesBody}>No prompts shared for this lecture yet.</Text>
                )}
              </View>

              {activeResources.length > 0 && (
                <View style={s.lessonNotesBlock}>
                  <View style={s.lessonNotesBlockHeader}>
                    <Ionicons name="link-outline" size={16} color={C.primary} />
                    <Text style={s.lessonNotesBlockTitle}>Resources</Text>
                  </View>
                  {activeResources.map((resource, index) => (
                    <TouchableOpacity
                      key={`${resource.title}-${index}`}
                      style={s.lessonResourceRow}
                      onPress={() => resource.url ? Linking.openURL(resource.url).catch(() => Alert.alert("Error", "Could not open this resource.")) : null}
                      accessibilityRole="button"
                      accessibilityLabel={`Open resource ${resource.title}`}
                    >
                      <Text style={s.lessonResourceTitle} numberOfLines={2}>{resource.title}</Text>
                      <Ionicons name="open-outline" size={16} color={C.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCourseAi} transparent animationType="slide" onRequestClose={() => setShowCourseAi(false)}>
        <View style={s.courseAiOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCourseAi(false)} />
          <View style={s.courseAiSheet}>
            <View style={s.courseAiHandle} />
            <View style={s.courseAiHeader}>
              <View>
                <Text style={s.courseAiTitle}>Course AI</Text>
                <Text style={s.courseAiSubtitle} numberOfLines={1}>{activeTitle || "Ask about this video"}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCourseAi(false)} style={s.courseAiClose} accessibilityRole="button" accessibilityLabel="Close Course AI">
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.courseAiMessages} contentContainerStyle={s.courseAiContent}>
              {courseAiMessages.map((msg, i) => (
                <View key={i} style={[s.courseAiMessage, msg.role === "user" && s.courseAiMessageUser]}>
                  {msg.role !== "user" && <View style={s.courseAiAvatar}><Ionicons name="sparkles" size={15} color="#fff" /></View>}
                  <View style={[s.courseAiBubble, msg.role === "user" && s.courseAiBubbleUser]}>
                    <Text style={s.courseAiBubbleText}>{msg.content}</Text>
                  </View>
                </View>
              ))}
              {courseAiLoading && (
                <View style={s.courseAiMessage}>
                  <View style={s.courseAiAvatar}><Ionicons name="sparkles" size={15} color="#fff" /></View>
                  <View style={s.courseAiBubble}><ActivityIndicator color="#fff" size="small" /></View>
                </View>
              )}
              {!courseAiLoading && ["Summarize this video", "Explain this topic simply", "Give me practice questions"].map(p => (
                <TouchableOpacity key={p} style={s.courseAiPrompt} onPress={() => sendCourseAiMessage(p)}>
                  <Text style={s.courseAiPromptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.courseAiComposer}>
              <TextInput
                style={s.courseAiInput}
                placeholder="Ask about this video..."
                placeholderTextColor={C.textMuted}
                value={courseAiInput}
                onChangeText={setCourseAiInput}
                onSubmitEditing={() => sendCourseAiMessage()}
                editable={!courseAiLoading}
              />
              <TouchableOpacity style={s.courseAiSend} onPress={() => sendCourseAiMessage()} disabled={courseAiLoading} accessibilityRole="button" accessibilityLabel="Send Course AI message">
                <Ionicons name="send" size={17} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── VideoListScreen ───────────────────────────────────────────────────────────
function VideoListScreen({ course, onSelectVideo, onBack, onOpenCourseAi, downloads, onDownload, onDeleteDownload, hasAccess }) {
  const [showCourseNotes, setShowCourseNotes] = useState(false);
  const videos = useMemo(
    () => (course.videos || []).slice().sort((a, b) => a.order - b.order),
    [course.videos]
  );
  const courseDescription = [course.description, course.desc, course.summary, course.about]
    .find(value => typeof value === "string" && value.trim())
    ?.trim();
  const courseNotesText = [course.notes, course.courseNotes, course.learningNotes, courseDescription]
    .find(value => typeof value === "string" && value.trim())
    ?.trim();
  const coursePrompts = useMemo(
    () => [...new Set(videos.flatMap(video => getVideoPrompts(video)))].slice(0, 8),
    [videos]
  );
  const courseResources = useMemo(() => {
    const resources = [];
    if (course.notesUrl) resources.push({ title: "Course notes PDF", url: course.notesUrl });
    videos.slice(0, 8).forEach(video => {
      getVideoResources(video).forEach(resource => resources.push(resource));
    });
    return resources.slice(0, 6);
  }, [course.notesUrl, videos]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <SafeAreaView style={{ backgroundColor: C.white }}>
        <View style={s.pageHeader}>
          <TouchableOpacity onPress={onBack} style={s.iconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back to courses"
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.pageTitle} numberOfLines={1}>{course.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TouchableOpacity
              style={s.iconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => setShowCourseNotes(true)}
              accessibilityRole="button"
              accessibilityLabel="Open course notes"
            >
              <Ionicons name="document-text-outline" size={22} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => onOpenCourseAi?.(course)}
            >
              <Ionicons name="sparkles" size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontSize: 12, fontWeight: "700", marginLeft: 3 }}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {videos.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {!!courseDescription && (
            <View style={s.courseDescriptionCard}>
              <Text style={s.courseDescriptionTitle}>About this course</Text>
              <Text style={s.courseDescriptionText}>{courseDescription}</Text>
            </View>
          )}
          <View style={[s.centered, { minHeight: 260 }]}>
            <Text style={{ color: C.textSub }}>No videos in this course yet.</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item, i) => item._id || String(i)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          ListHeaderComponent={courseDescription ? (
            <View style={s.courseDescriptionCard}>
              <Text style={s.courseDescriptionTitle}>About this course</Text>
              <Text style={s.courseDescriptionText}>{courseDescription}</Text>
            </View>
          ) : null}
          renderItem={({ item, index }) => {
            const durationLabel = getVideoDurationLabel(item);
            const bunnyGuid = getBunnyGuid(item);
            const bunnyLibraryId = getBunnyLibraryId(item);
            const thumbnailUrl = bunnyGuid
              ? `${API_BASE}/api/bunny/thumbnail/${bunnyGuid}?libraryId=${encodeURIComponent(bunnyLibraryId)}`
              : item.youtubeId
                ? `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg`
                : "";
            const dl = bunnyGuid ? downloads?.[bunnyGuid] : null;
            return (
              <TouchableOpacity style={s.videoRow} onPress={() => onSelectVideo(index)}>
                <View style={s.videoThumbSmall}>
                  {thumbnailUrl ? (
                    <RemoteThumbnailImage
                      imageUrl={thumbnailUrl}
                      screen="Course lesson row"
                      courseId={course?._id}
                      borderRadius={8}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.primaryLight, borderRadius: 8, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: C.primary, fontWeight: "700", fontSize: 13 }}>{index + 1}</Text>
                    </View>
                  )}
                  <View style={s.videoThumbPlay}>
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                  {!!durationLabel && (
                    <View style={s.videoDurationBadge}>
                      <Text style={s.videoDurationText}>{durationLabel}</Text>
                    </View>
                  )}
                  {dl?.status === "done" && (
                    <View style={s.downloadedBadge}>
                      <Ionicons name="arrow-down-circle" size={14} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.videoRowTitle} numberOfLines={2}>{item.title || `Video ${index + 1}`}</Text>
                  {dl?.status === "downloading" && (
                    <View style={s.dlProgressBar}>
                      <View style={[s.dlProgressFill, { width: `${Math.round((dl.progress || 0) * 100)}%` }]} />
                    </View>
                  )}
                </View>
                {bunnyGuid ? (
                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => {
                      if (!hasAccess) { Alert.alert("Subscription Required", "Upgrade your plan to download videos for offline viewing."); return; }
                      if (dl?.status === "done") {
                        Alert.alert("Downloaded", "This video is saved offline.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => onDeleteDownload?.(bunnyGuid) },
                        ]);
                      } else if (dl?.status !== "downloading") {
                        onDownload?.(item, course._id, course.title);
                      }
                    }}
                  >
                    {!hasAccess ? (
                      <Ionicons name="lock-closed" size={20} color={C.textMuted} />
                    ) : dl?.status === "done" ? (
                      <Ionicons name="checkmark-circle" size={22} color={C.primary} />
                    ) : dl?.status === "downloading" ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <Ionicons name="download-outline" size={22} color={C.textMuted} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={showCourseNotes} transparent animationType="slide" onRequestClose={() => setShowCourseNotes(false)}>
        <Pressable style={s.courseNotesOverlay} onPress={() => setShowCourseNotes(false)}>
          <Pressable style={s.courseNotesSheet}>
            <View style={s.courseNotesHandle} />
            <View style={s.courseNotesHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.courseNotesTitle} numberOfLines={2}>{course.title || "Course notes"}</Text>
                <Text style={s.courseNotesSubtitle}>Notes, prompts and resources</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCourseNotes(false)}
                style={s.courseNotesClose}
                accessibilityRole="button"
                accessibilityLabel="Close course notes"
              >
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.courseNotesScroll} contentContainerStyle={s.courseNotesContent}>
              <View style={s.courseNotesBlock}>
                <View style={s.courseNotesBlockHeader}>
                  <Ionicons name="reader-outline" size={17} color={C.primary} />
                  <Text style={s.courseNotesBlockTitle}>Course Notes</Text>
                </View>
                <Text style={s.courseNotesBody}>{courseNotesText || "Notes are not available for this course yet."}</Text>
              </View>

              <View style={s.courseNotesBlock}>
                <View style={s.courseNotesBlockHeader}>
                  <Ionicons name="sparkles-outline" size={17} color={C.primary} />
                  <Text style={s.courseNotesBlockTitle}>Useful Prompts</Text>
                </View>
                {coursePrompts.length ? coursePrompts.map((prompt, index) => (
                  <View key={`${prompt}-${index}`} style={s.coursePromptRow}>
                    <Text style={s.coursePromptIndex}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text selectable style={s.coursePromptText}>{prompt}</Text>
                  </View>
                )) : (
                  <Text style={s.courseNotesBody}>No prompts shared for this course yet.</Text>
                )}
              </View>

              {courseResources.length > 0 && (
                <View style={s.courseNotesBlock}>
                  <View style={s.courseNotesBlockHeader}>
                    <Ionicons name="link-outline" size={17} color={C.primary} />
                    <Text style={s.courseNotesBlockTitle}>Resources</Text>
                  </View>
                  {courseResources.map((resource, index) => (
                    <TouchableOpacity
                      key={`${resource.title}-${index}`}
                      style={s.courseResourceRow}
                      onPress={() => resource.url ? Linking.openURL(resource.url).catch(() => Alert.alert("Error", "Could not open this resource.")) : null}
                      accessibilityRole="button"
                      accessibilityLabel={`Open resource ${resource.title}`}
                    >
                      <Text style={s.courseResourceTitle} numberOfLines={2}>{resource.title}</Text>
                      <Ionicons name="open-outline" size={17} color={C.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function HomeAutoplayPreview({ item, fallbackCourse }) {
  const video = item?.video;
  const course = item?.course || fallbackCourse;
  const thumbnailSource = course ? getCourseThumbnailSource(course) : null;
  const html = useMemo(() => video ? buildPreviewPlayerHtml(video) : "", [video?.youtubeId, video?.videoId, video?.bunnyGuid, video?.videoUrl]);

  if (!video || !html) {
    return (
      <View style={StyleSheet.absoluteFill}>
        {thumbnailSource ? (
          <CourseThumbnailImage course={course} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="play-circle" size={78} color="rgba(197,139,42,0.38)" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {thumbnailSource ? (
        <CourseThumbnailImage course={course} />
      ) : null}
      <WebView
        source={{ html, baseUrl: PLAYER_ORIGIN }}
        style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}
        containerStyle={{ backgroundColor: "transparent" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        mixedContentMode="always"
      />
    </View>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ user, onGoToCourses, onGoToAI, onGoToDownloads, onGoToProfile, onGoToSubscription, onSelectCourse, onResumeCourse, onOpenHeroPreview, courseProgress = {}, aiRobotId }) {
  const hasAccess = hasCourseAccess(user);
  const [topCourses, setTopCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [mostWatchedVideo, setMostWatchedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadHomeData() {
      try {
        const [top, all, mostWatched] = await Promise.all([
          fetchApiJson("/api/courses/top", []),
          fetchApiJson("/api/courses", []),
          fetchApiJson(`/api/videos/most-watched?userId=${encodeURIComponent(user._id)}&sessionId=${encodeURIComponent(user.sessionId || "")}`, null),
        ]);
        if (cancelled) return;
        const loadedAll = Array.isArray(all) ? all : [];
        const nextAll = DEV_UI_QA_ENABLED && loadedAll.length === 0 ? UI_QA_COURSES : loadedAll;
        const nextTop = Array.isArray(top) && top.length ? top : nextAll.slice(0, 6);
        setTopCourses(nextTop);
        setAllCourses(nextAll);
        if (mostWatched && !mostWatched.error) {
          setMostWatchedVideo(mostWatched);
        } else if (hasCourseAccess(user) && nextTop[0]?._id) {
          const videoData = await fetchApiJson(
            `/api/courses/${nextTop[0]._id}/videos?userId=${encodeURIComponent(user._id)}&sessionId=${encodeURIComponent(user.sessionId || "")}`,
            null
          );
          if (!cancelled && Array.isArray(videoData?.videos) && videoData.videos.length > 0) {
            setMostWatchedVideo({
              watchCount: 0,
              videoIndex: 0,
              video: videoData.videos[0],
              course: { ...nextTop[0], videos: videoData.videos },
            });
          }
        }
      } catch {
        if (!cancelled && DEV_UI_QA_ENABLED) {
          setTopCourses(UI_QA_COURSES);
          setAllCourses(UI_QA_COURSES);
          setMostWatchedVideo({
            watchCount: 0,
            videoIndex: 0,
            video: UI_QA_COURSES[0]?.videos?.[0],
            course: UI_QA_COURSES[0],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadHomeData();
    return () => { cancelled = true; };
  }, [user._id, user.sessionId]);

  const continueCourses = useMemo(
    () => allCourses
      .map(course => ({ course, progressPct: getCourseProgressPercent(course, courseProgress) }))
      .filter(item => item.progressPct > 0 && item.progressPct < 100)
      .sort((a, b) => {
        const aTime = new Date(courseProgress?.[a.course._id]?.updatedAt || 0).getTime();
        const bTime = new Date(courseProgress?.[b.course._id]?.updatedAt || 0).getTime();
        return bTime - aTime;
      }),
    [allCourses, courseProgress]
  );

  const discoveryCourses = allCourses.length ? allCourses : HOME_FALLBACK_COURSES;
  const rankedCourses = (topCourses.length ? topCourses : discoveryCourses).slice(0, 10);
  const continueItems = continueCourses.length
    ? continueCourses
    : discoveryCourses.slice(0, 4).map((course, index) => ({ course, progressPct: [60, 42, 28, 75][index % 4], lessonTitle: ["05. Layers & Blending Explained", "03. Prompt Frameworks That Work", "07. Make Your First Automation", "02. Build a Client Offer"][index % 4] }));
  const previewCourse = mostWatchedVideo?.course || rankedCourses[0] || discoveryCourses[0];
  const previewTitle = mostWatchedVideo?.video?.title || previewCourse?.title || "Most Watched Lesson";
  const previewSubtitle = mostWatchedVideo?.course?.title || "Practical short courses. Real projects. Career growth.";
  const openCourse = course => {
    if (!course || course.isMock) { onGoToCourses(); return; }
    if (!hasAccess) { setShowUpgrade(true); return; }
    onSelectCourse(course);
  };
  const openContinue = course => {
    if (!course || course.isMock) { onGoToCourses(); return; }
    if (!hasAccess) { setShowUpgrade(true); return; }
    const resume = getResumeInfo(course, courseProgress);
    onResumeCourse?.(course, resume.index, resume.seconds);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />

      <View style={s.streamingHeader}>
        <SafeAreaView>
          <View style={s.streamingHeaderInner}>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SkillomateLogo size="sm" />
              </View>
              <Text style={s.streamingTagline}>Learn with AI. Earn with AI.</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity
                style={s.streamingIconBtn}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Open notifications"
                onPress={() => setShowNotifications(true)}
              >
                <Ionicons name="notifications-outline" size={20} color={C.text} />
                <View style={s.notificationDot} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onGoToProfile}
                style={s.avatarBtn}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                <AvatarImage avatarId={user.avatar || "a1"} size={38} style={{ borderRadius: 0 }} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.homeScrollContent}
        scrollEventThrottle={16}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
      >
        <View style={s.streamingHero}>
          <View style={s.streamingHeroImage}>
            <PosterImage course={previewCourse} index={0} vertical={false} />
            <View style={s.streamingHeroPhotoWash} />
          </View>
          <View style={s.trialBadge}>
            <Text style={s.trialBadgeText}>₹1 Trial</Text>
          </View>
          <View style={s.streamingHeroContent}>
            <Text style={s.heroKicker}>FEATURED</Text>
            <Text style={s.streamingHeroTitle}>Master AI Skills.{"\n"}Build Your Future.</Text>
            <Text style={s.streamingHeroSub} numberOfLines={2}>{previewSubtitle}</Text>
            <View style={s.streamingHeroActions}>
              <TouchableOpacity
                style={s.startLearningBtn}
                activeOpacity={0.86}
                onPress={() => {
                  if (!previewCourse || previewCourse.isMock) { onGoToCourses(); return; }
                  if (!hasAccess) { setShowUpgrade(true); return; }
                  onOpenHeroPreview?.(previewCourse, mostWatchedVideo?.video, mostWatchedVideo?.videoIndex || 0);
                }}
              >
                <Ionicons name="play" size={16} color={C.text} />
                <Text style={s.startLearningText}>Start Learning</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.myListHeroBtn} activeOpacity={0.86} onPress={onGoToCourses}>
                <Ionicons name="bookmark-outline" size={16} color={C.text} />
                <Text style={s.myListHeroText}>My List</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={s.heroDots}>
          {[0, 1, 2].map(dot => <View key={dot} style={[s.heroDot, dot === 0 && s.heroDotActive]} />)}
        </View>

        <View style={[s.streamingSection, s.firstStreamingSection]}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Continue Learning</Text>
            <TouchableOpacity onPress={onGoToCourses}>
              <Text style={s.streamingSeeAll}>See All &gt;</Text>
            </TouchableOpacity>
          </View>
          <HorizontalRail
            data={continueItems}
            keyExtractor={({ course }) => `${course._id}-continue`}
            contentContainerStyle={s.railContent}
            renderItem={({ item, index }) => {
              const { course, progressPct, lessonTitle } = item;
              return (
              <TouchableOpacity style={s.learningCard} activeOpacity={0.9} onPress={() => openContinue(course)}>
                <View style={s.learningThumb}>
                  <PosterImage course={course} index={index} vertical={false} />
                  <View style={s.learningPlay}>
                    <Ionicons name="play" size={15} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={s.learningTitle} numberOfLines={1}>{course.title}</Text>
                <Text style={s.learningLesson} numberOfLines={1}>{lessonTitle || course.videos?.[0]?.title || "Continue your next lesson"}</Text>
                <View style={s.learningProgressTrack}>
                  <View style={[s.learningProgressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={s.learningPct}>{progressPct}% Completed</Text>
              </TouchableOpacity>
            );}}
          />
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Top 10 in India Today</Text>
          </View>
          <HorizontalRail
            data={rankedCourses.slice(0, 5)}
            keyExtractor={course => `${course._id}-rank`}
            contentContainerStyle={s.rankRailContent}
            renderItem={({ item: course, index }) => (
              <TouchableOpacity style={s.rankItem} activeOpacity={0.9} onPress={() => openCourse(course)}>
                <Text style={s.rankNumber}>{index + 1}</Text>
                <View style={s.rankPoster}>
                  <PosterImage course={course} index={index} />
                </View>
              </TouchableOpacity>
            )}
          />
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Because You Watched AI Tools for Creators</Text>
          </View>
          <PosterRail courses={discoveryCourses.slice(5, 10)} onPressCourse={openCourse} />
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Trending Now</Text>
            <TouchableOpacity onPress={onGoToCourses}>
              <Text style={s.streamingSeeAll}>See All &gt;</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color={C.primary} style={{ padding: 20 }} />
          ) : (
            <HorizontalRail
              data={rankedCourses.slice(0, 5)}
              keyExtractor={course => `${course._id}-trend`}
              contentContainerStyle={s.railContent}
              renderItem={({ item: course, index }) => (
                <TouchableOpacity style={s.trendingLandscapeCard} activeOpacity={0.9} onPress={() => openCourse(course)}>
                  <View style={s.trendingLandscapeThumb}>
                    <PosterImage course={course} index={index} vertical={false} />
                    <View style={s.goldLabel}>
                      <Text style={s.goldLabelText}>{index % 2 ? "POPULAR" : "TRENDING"}</Text>
                    </View>
                  </View>
                  <Text style={s.posterTitle} numberOfLines={2}>{course.title}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>New Releases</Text>
          </View>
          <PosterRail courses={discoveryCourses.slice(8, 13)} onPressCourse={openCourse} tag="NEW" />
        </View>

        <View style={s.learnEarnBand}>
          <View style={{ flex: 1 }}>
            <Text style={s.learnEarnKicker}>LEARN TO EARN</Text>
            <Text style={s.learnEarnTitle}>Turn AI skills into income.</Text>
            <Text style={s.learnEarnText}>Freelancing, content, automation and client-ready projects.</Text>
          </View>
          <TouchableOpacity onPress={onGoToCourses} style={s.learnEarnBtn}>
            <Ionicons name="arrow-forward" size={18} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Learn to Earn</Text>
          </View>
          <PosterRail courses={discoveryCourses.slice(13, 18)} onPressCourse={openCourse} />
        </View>

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>My List</Text>
            <TouchableOpacity onPress={onGoToCourses}>
              <Text style={s.streamingSeeAll}>See All &gt;</Text>
            </TouchableOpacity>
          </View>
          <HorizontalRail
            data={discoveryCourses.slice(2, 7)}
            keyExtractor={course => `${course._id}-list`}
            contentContainerStyle={s.railContent}
            renderItem={({ item: course, index }) => (
              <TouchableOpacity style={s.myListPoster} activeOpacity={0.9} onPress={() => openCourse(course)}>
                <PosterImage course={course} index={index + 2} />
                <View style={s.bookmarkMark}>
                  <Ionicons name="bookmark" size={13} color={C.primary} />
                </View>
                <View style={s.posterScrim} />
                <Text style={s.myListTitle} numberOfLines={2}>{course.title}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        <TouchableOpacity style={s.nexPromptBand} onPress={onGoToAI} activeOpacity={0.9}>
          <View style={s.nexPromptIcon}>
            <Ionicons name="sparkles" size={20} color={C.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nexPromptTitle}>Ask Nex AI what to learn next</Text>
            <Text style={s.nexPromptText}>Get a simple roadmap for your first AI income skill.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      <BottomNav active="home" onHome={() => {}} onCourses={onGoToCourses} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={onGoToProfile} aiRobotId={aiRobotId} />
      <UpgradeModal visible={showUpgrade} onClose={() => setShowUpgrade(false)} />
      <NotificationPreviewModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        onOpenCourses={onGoToCourses}
        onOpenAI={onGoToAI}
        onOpenSubscription={onGoToSubscription}
      />
    </View>
  );

  function PosterRail({ courses, onPressCourse, tag }) {
    return (
      <HorizontalRail
        data={courses}
        keyExtractor={course => `${course._id}-${tag || "poster"}`}
        contentContainerStyle={s.railContent}
        renderItem={({ item: course, index }) => (
          <TouchableOpacity style={s.posterCard} activeOpacity={0.9} onPress={() => onPressCourse(course)}>
            <View style={s.posterThumb}>
              <PosterImage course={course} index={index} />
              {tag ? (
                <View style={s.newTag}>
                  <Text style={s.newTagText}>{tag}</Text>
                </View>
              ) : null}
              <View style={s.posterScrim} />
            </View>
            <Text style={s.posterTitle} numberOfLines={2}>{course.title}</Text>
          </TouchableOpacity>
        )}
      />
    );
  }
}

// ── CourseListScreen ──────────────────────────────────────────────────────────
function CourseListScreen({ onSelect, user, onGoToHome, onGoToAI, onGoToDownloads, onGoToProfile, wishlist = [], onToggleWishlist, courseProgress = {}, onRefreshProgress, aiRobotId }) {
  const hasAccess = hasCourseAccess(user);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const loadCourses = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/courses`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setCourses(DEV_UI_QA_ENABLED && (!Array.isArray(d) || d.length === 0) ? UI_QA_COURSES : d);
      })
      .catch(e => {
        if (DEV_UI_QA_ENABLED) {
          setCourses(UI_QA_COURSES);
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    onRefreshProgress?.();
  }, [onRefreshProgress]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (searchFocused) {
        Keyboard.dismiss();
        return true;
      }
      if (query.length > 0) {
        setQuery("");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [query, searchFocused]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return courses;
    return courses.filter(c => c.title?.toLowerCase().includes(normalizedQuery));
  }, [courses, query]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={s.centered}><ActivityIndicator size="large" color={C.primary} /></View>
    </View>
  );

  if (error) return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.centered, { paddingHorizontal: 24 }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <Ionicons name="cloud-offline-outline" size={30} color={C.primary} />
        </View>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 6 }}>Courses unavailable</Text>
        <Text style={{ color: C.textSub, fontSize: 14, lineHeight: 20, textAlign: "center" }}>Failed to load: {error}</Text>
        <TouchableOpacity style={[s.btn, s.btnFill, { marginTop: 18, minWidth: 140 }]} onPress={loadCourses}>
          <Text style={s.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
      <BottomNav active="courses" onHome={onGoToHome} onCourses={() => {}} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={onGoToProfile} aiRobotId={aiRobotId} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <SafeAreaView style={{ backgroundColor: C.white }}>
        <View style={s.pageHeader}>
          <SkillomateLogo size="sm" />
          <Text style={[s.pageTitle, { marginLeft: 0, textAlign: "center" }]} numberOfLines={1}>Explore</Text>
          <View style={{ width: 86 }} />
        </View>
      </SafeAreaView>

      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={18} color={C.textMuted} />
        <TextInput
          placeholder="Search courses here"
          placeholderTextColor={C.textMuted}
          style={s.searchInput}
          value={query} onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
          accessibilityLabel="Search courses"
        />
        {query.length > 0 && (
          <TouchableOpacity
            style={s.searchClearButton}
            onPress={() => setQuery("")}
            accessibilityRole="button"
            accessibilityLabel="Clear course search"
            accessibilityHint="Shows all courses"
          >
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

<FlatList
        data={filtered}
        keyExtractor={item => item._id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 16, paddingBottom: 100 }}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const declaredCount = Number(item.lessonCount ?? item.videoCount);
          const lessonCount = Number.isFinite(declaredCount)
            ? declaredCount
            : Array.isArray(item.videos) ? item.videos.length : 0;
          const rating = COURSE_LIST_RATINGS[index % COURSE_LIST_RATINGS.length];
          const isWishlisted = wishlist.includes(item._id);
          const progressPct = getCourseProgressPercent(item, courseProgress);
          return (
            <TouchableOpacity
              style={s.clCard}
              activeOpacity={0.93}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}. ${progressPct}% complete`}
              onPress={() => {
                if (!hasAccess) { setShowUpgrade(true); return; }
                onSelect(item);
              }}
            >
              {/* Thumbnail */}
              <View style={s.clThumb}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: C.primary, fontWeight: "900", fontSize: 64 }}>{item.title?.[0]?.toUpperCase()}</Text>
                </View>
                <CourseThumbnailImage course={item} />

                {/* PREMIUM badge */}
                <View style={s.clPremiumBadge}>
                  <Text style={s.clPremiumText}>PREMIUM</Text>
                </View>

                {/* Wishlist */}
                <TouchableOpacity
                  style={s.clWishlistBtn}
                  onPress={event => {
                    event.stopPropagation?.();
                    onToggleWishlist?.(item._id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isWishlisted ? `Remove ${item.title} from wishlist` : `Add ${item.title} to wishlist`}
                  accessibilityState={{ selected: isWishlisted }}
                >
                  <Ionicons name={isWishlisted ? "heart" : "heart-outline"} size={15} color={isWishlisted ? C.primary : "#fff"} />
                </TouchableOpacity>

                {/* Lock */}
                {!hasAccess && (
                  <View style={s.clLock}>
                    <Ionicons name="lock-closed" size={12} color="#fff" />
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={s.clInfo}>
                <Text style={s.clTitle} numberOfLines={2}>{item.title}</Text>

                {/* Rating row */}
                <View style={s.clRatingRow}>
                  <Ionicons name="star" size={13} color={C.accent} />
                  <Text style={s.clRating}>{rating}</Text>
                  <Text style={s.clDot}>·</Text>
                  <Text style={s.clLectures}>{lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}</Text>
                </View>

                {/* Progress */}
                <View style={s.clProgressRow}>
                  <Text style={s.clProgressLabel}>Progress</Text>
                  <Text style={s.clProgressPct}>{progressPct}%</Text>
                </View>
                <View style={s.clProgressTrack}>
                  <View style={[s.clProgressFill, { width: `${progressPct}%` }]} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Ionicons name="search-outline" size={40} color={C.textMuted} />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: "800", marginTop: 12 }}>
              {query.trim() ? "No matching courses" : "No courses available yet"}
            </Text>
            <Text style={{ color: C.textSub, marginTop: 6, textAlign: "center" }}>
              {query.trim() ? `Nothing matched “${query.trim()}”. Try another topic.` : "Check again soon for new learning content."}
            </Text>
            <TouchableOpacity
              style={[s.btn, s.btnFill, { marginTop: 18, minWidth: 140 }]}
              onPress={query.trim() ? () => setQuery("") : loadCourses}
              accessibilityRole="button"
              accessibilityLabel={query.trim() ? "Clear search" : "Reload courses"}
            >
              <Text style={s.btnText}>{query.trim() ? "Clear search" : "Reload"}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <BottomNav active="courses" onHome={onGoToHome} onCourses={() => {}} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={onGoToProfile} aiRobotId={aiRobotId} />
      <UpgradeModal visible={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </View>
  );
}

// ── WishlistScreen ────────────────────────────────────────────────────────────
function WishlistScreen({ wishlist, onToggleWishlist, onSelect, onBack, user }) {
  const hasAccess = hasCourseAccess(user);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wishlist.length === 0) { setLoading(false); return; }
    fetch(`${API_BASE}/api/courses`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        const next = d.filter(c => wishlist.includes(c._id));
        setCourses(next.length || !DEV_UI_QA_ENABLED ? next : UI_QA_COURSES.filter(c => wishlist.includes(c._id)));
      })
      .catch(() => {
        if (DEV_UI_QA_ENABLED) setCourses(UI_QA_COURSES.filter(c => wishlist.includes(c._id)));
      })
      .finally(() => setLoading(false));
  }, [wishlist.join("|")]);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <SafeAreaView style={{ backgroundColor: C.white }}>
        <View style={s.pageHeader}>
          <TouchableOpacity onPress={onBack} style={s.iconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.pageTitle}>My Wishlist</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : courses.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="heart-outline" size={52} color={C.textMuted} />
          <Text style={{ color: C.textSub, fontSize: 16, fontWeight: "600", marginTop: 14 }}>No saved courses</Text>
          <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 6 }}>Tap ♡ on any course to save it here</Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={item => item._id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.courseListCard, { flex: 1 }]}
              onPress={() => {
                if (!hasAccess) { setShowUpgrade(true); return; }
                onSelect(item);
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={[s.courseListThumb, { backgroundColor: C.primaryLight, flex: 1 }]}>
                  <Text style={[s.courseListThumbText, { color: C.primary }]}>{item.title?.[0]?.toUpperCase()}</Text>
                </View>
                <CourseThumbnailImage course={item} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)", padding: 10 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, lineHeight: 19 }} numberOfLines={2}>{item.title}</Text>
                  <Text style={{ color: "#F4E7CB", fontSize: 12, marginTop: 2 }}>{item.videos?.length ?? 0} video{item.videos?.length !== 1 ? "s" : ""}</Text>
                </View>
                <TouchableOpacity style={s.wishlistBtn} onPress={() => onToggleWishlist(item._id)}>
                  <Ionicons name="heart" size={14} color={C.primary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <UpgradeModal visible={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </View>
  );
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────
function buildCertificateHTML(cert) {
  const issuedDate = cert.issuedAt
    ? new Date(cert.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, serif; background: #f7f1e8; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 40px; }
  .cert { background: #fffdf8; border: 3px solid #b8913b; border-radius: 16px; padding: 56px 64px; max-width: 720px; width: 100%; text-align: center; box-shadow: 0 8px 32px rgba(23,23,23,0.10); position: relative; }
  .cert::before { content: ''; position: absolute; inset: 10px; border: 1px solid #e4d4bf; border-radius: 10px; pointer-events: none; }
  .badge { width: 80px; height: 80px; background: #f4e7cb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 40px; }
  .label { font-size: 12px; font-weight: 700; color: #8b6b4a; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }
  .certifies { font-size: 14px; color: #6f6258; margin: 16px 0 8px; font-style: italic; }
  .name { font-size: 38px; font-weight: 700; color: #241a14; margin: 8px 0 16px; }
  .completed { font-size: 14px; color: #6f6258; margin-bottom: 8px; }
  .course { font-size: 22px; font-weight: 700; color: #241a14; background: #f4e7cb; border-radius: 10px; padding: 16px 24px; margin: 8px 0 32px; display: inline-block; }
  .meta { display: flex; justify-content: space-between; border-top: 1px solid #e4d4bf; padding-top: 20px; margin-top: 8px; }
  .meta-item { font-size: 12px; color: #9a8b7e; }
  .brand { margin-top: 24px; }
  .brand-name { font-size: 18px; font-weight: 700; color: #241a14; }
  .brand-tag { font-size: 11px; color: #9a8b7e; letter-spacing: 2px; }
</style>
</head>
<body>
<div class="cert">
  <div class="badge">🎓</div>
  <div class="label">Certificate of Completion</div>
  <div class="certifies">This certifies that</div>
  <div class="name">${cert.userName}</div>
  <div class="completed">has successfully completed the course</div>
  <div class="course">${cert.courseTitle}</div>
  <div class="meta">
    <div class="meta-item">Issued: ${issuedDate}</div>
    <div class="meta-item">ID: ${cert.certificateId}</div>
  </div>
  <div class="brand">
    <div class="brand-name">Skillomate</div>
    <div class="brand-tag">LEARN · GROW · SUCCEED</div>
  </div>
</div>
</body>
</html>`;
}

async function downloadCertificate(cert, setDownloading) {
  try {
    setDownloading(true);
    const html = buildCertificateHTML(cert);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save Certificate" });
    } else {
      Alert.alert("Saved", "Certificate saved to: " + uri);
    }
  } catch (e) {
    Alert.alert("Error", "Could not generate certificate. " + e.message);
  } finally {
    setDownloading(false);
  }
}

function CertificateCard({ cert, style, showDownload }) {
  const [downloading, setDownloading] = useState(false);
  const issuedDate = cert.issuedAt
    ? new Date(cert.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  return (
    <View style={[{ backgroundColor: "#fff", borderRadius: 16, padding: 24, borderWidth: 2, borderColor: C.primary, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }, style]}>
      <View style={{ alignItems: "center", marginBottom: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
          <Ionicons name="ribbon" size={32} color={C.primary} />
        </View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: C.primary, letterSpacing: 2, textTransform: "uppercase" }}>Certificate of Completion</Text>
        <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>This certifies that</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 4 }}>{cert.userName}</Text>
      <Text style={{ fontSize: 12, color: C.textSub, textAlign: "center", marginBottom: 12 }}>has successfully completed the course</Text>
      <View style={{ backgroundColor: C.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: C.primary, textAlign: "center" }}>{cert.courseTitle}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: C.textMuted }}>Issued: {issuedDate}</Text>
        <Text style={{ fontSize: 11, color: C.textMuted }}>ID: {cert.certificateId}</Text>
      </View>
      <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, alignItems: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: C.primary }}>Skillomate</Text>
        <Text style={{ fontSize: 10, color: C.textMuted }}>Learn · Grow · Succeed</Text>
      </View>
      {showDownload && (
        <TouchableOpacity
          onPress={() => downloadCertificate(cert, setDownloading)}
          disabled={downloading}
          style={{ marginTop: 16, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {downloading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="download-outline" size={18} color="#fff" />}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            {downloading ? "Generating..." : "Download Certificate"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CertificateModal({ cert, onClose }) {
  if (!cert) return null;
  return (
    <Modal visible={!!cert} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <View style={{ backgroundColor: C.white, borderRadius: 20, width: "100%", maxWidth: 400, maxHeight: "90%", overflow: "hidden" }}>
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 28 }}>🎉</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, marginTop: 8 }}>Course Completed!</Text>
              <Text style={{ fontSize: 13, color: C.textSub, marginTop: 4, textAlign: "center" }}>Congratulations! You've earned a certificate.</Text>
            </View>
            <CertificateCard cert={cert} showDownload />
            <TouchableOpacity
              style={{ marginTop: 12, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Continue learning"
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Continue Learning</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CertificatesScreen({ certificates, onBack }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.homeTopBar, { paddingBottom: 12, backgroundColor: C.white }]}>
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={s.homeTopBarInner}>
            <TouchableOpacity onPress={onBack} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back to profile">
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>My Certificates</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </View>
      {certificates.length === 0 ? (
        <View style={s.centered}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="ribbon-outline" size={34} color={C.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 8 }}>No Certificates Yet</Text>
          <Text style={{ fontSize: 14, color: C.textSub, textAlign: "center", paddingHorizontal: 40 }}>
            Complete a course to earn your first certificate.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>{certificates.length} certificate{certificates.length !== 1 ? "s" : ""} earned</Text>
          {certificates.map((cert, i) => (
            <CertificateCard key={cert.certificateId || i} cert={cert} style={{ marginBottom: 20 }} showDownload />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SubscriptionDetailsScreen({ user, onBack }) {
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [error, setError] = useState(null);

  const loadSubscription = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/user/${user._id}/subscription?sessionId=${encodeURIComponent(user.sessionId || "")}`)
      .then(r => r.json())
      .then(data => { setSubData(data); setLoading(false); })
      .catch(() => { setError("Failed to load subscription details."); setLoading(false); });
  }, [user._id, user.sessionId]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const isActive = subData?.subscriptionStatus && subData.subscriptionStatus !== "none";

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function planLabel(status) {
    if (!status || status === "none") return "Free";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.homeTopBar, { paddingBottom: 12, backgroundColor: C.white }]}>
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={s.homeTopBarInner}>
            <TouchableOpacity onPress={onBack} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back to profile">
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>Subscription Details</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={[s.centered, { paddingHorizontal: 24 }]}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Ionicons name="receipt-outline" size={30} color={C.primary} />
          </View>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 6 }}>Subscription details unavailable</Text>
          <Text style={{ color: C.textSub, fontSize: 14, lineHeight: 20, textAlign: "center" }}>{error}</Text>
          <TouchableOpacity style={[s.btn, s.btnFill, { marginTop: 18, minWidth: 140 }]} onPress={loadSubscription}>
            <Text style={s.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Current plan card */}
          <View style={[s.profileInfoCard, { marginBottom: 16 }]}>
            <Text style={s.profileInfoCardTitle}>Current Plan</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isActive ? C.primaryLight : C.lightGray, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={isActive ? "shield-checkmark" : "shield-outline"} size={24} color={isActive ? C.primary : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.text }}>{planLabel(subData?.subscriptionStatus)}</Text>
                <View style={[s.subBadge, { alignSelf: "flex-start", marginTop: 4, backgroundColor: isActive ? C.primaryLight : C.lightGray }]}>
                  <Text style={{ color: isActive ? C.primary : C.textMuted, fontWeight: "600", fontSize: 11 }}>
                    {isActive ? "ACTIVE" : "INACTIVE"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 14 }} />

            <View style={[s.profileInfoRow]}>
              <View style={s.profileInfoIcon}>
                <Ionicons name="calendar-outline" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.profileInfoLabel}>Valid Until</Text>
                <Text style={s.profileInfoValue}>
                  {subData?.subscriptionExpiry ? formatDate(subData.subscriptionExpiry) : (isActive ? "Lifetime / Manual" : "—")}
                </Text>
              </View>
            </View>

            {isActive && subData?.subscriptionExpiry && (() => {
              const daysLeft = Math.ceil((new Date(subData.subscriptionExpiry) - new Date()) / (1000 * 60 * 60 * 24));
              return daysLeft > 0 ? (
                <View style={[s.profileInfoRow, { marginTop: 4 }]}>
                  <View style={s.profileInfoIcon}>
                    <Ionicons name="time-outline" size={16} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.profileInfoLabel}>Days Remaining</Text>
                    <Text style={[s.profileInfoValue, { color: daysLeft <= 7 ? C.danger : C.text }]}>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</Text>
                  </View>
                </View>
              ) : null;
            })()}

            {!isActive && (
              <TouchableOpacity
                onPress={() => Linking.openURL(SUBSCRIPTION_URL)}
                style={[s.btn, s.btnFill, { marginTop: 14 }]}
              >
                <Text style={s.btnText}>Upgrade Now</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Subscription history */}
          <View style={s.profileInfoCard}>
            <Text style={s.profileInfoCardTitle}>Subscription History</Text>
            {(!subData?.subscriptionHistory || subData.subscriptionHistory.length === 0) ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <Ionicons name="receipt-outline" size={32} color={C.border} />
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 8 }}>No subscription history yet</Text>
              </View>
            ) : (
              subData.subscriptionHistory.slice().reverse().map((item, i) => (
                <View key={i} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontWeight: "700", fontSize: 14, color: C.text }}>{planLabel(item.plan || item.status)}</Text>
                    <View style={{ backgroundColor: item.status === "active" ? C.primaryLight : C.lightGray, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: item.status === "active" ? C.primary : C.textMuted }}>
                        {(item.status || "expired").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: C.textMuted }}>Started</Text>
                      <Text style={{ fontSize: 12, color: C.textSub, fontWeight: "600" }}>{formatDate(item.startedAt)}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 11, color: C.textMuted }}>Expired</Text>
                      <Text style={{ fontSize: 12, color: C.textSub, fontWeight: "600" }}>{formatDate(item.expiresAt)}</Text>
                    </View>
                  </View>
                  {item.subscriptionId && (
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>ID: {item.subscriptionId}</Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function ProfileScreen({ user, onLogout, onGoToHome, onGoToCourses, onGoToAI, onGoToDownloads, wishlistCount, onGoToWishlist, onGoToCertificates, certificatesCount, themeMode, onThemeChange, onAvatarChange, aiRobotId, onGoToSubscription }) {
  const isActive = user?.subscriptionStatus && user.subscriptionStatus !== "none";
  const memberSince = user?._id
    ? new Date(parseInt(user._id.substring(0, 8), 16) * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [tempAvatar, setTempAvatar] = useState(user.avatar || "a1");
  const [savingAvatar, setSavingAvatar] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.homeTopBar, { paddingBottom: 20, backgroundColor: C.white }]}>
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={s.homeTopBarInner}>
            <SkillomateLogo size="sm" />
            <Text style={{ flex: 1, color: C.text, fontWeight: "700", fontSize: 16, textAlign: "center" }} numberOfLines={1}>Profile</Text>
            <View style={{ width: 86 }} />
          </View>
        </SafeAreaView>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => { setTempAvatar(user.avatar || "a1"); setShowAvatarPicker(true); }}
            style={{ position: "relative" }}
            accessibilityRole="button"
            accessibilityLabel="Change profile avatar"
          >
            <View style={s.profileAvatarLg}>
              <AvatarImage avatarId={user.avatar || "a1"} size={90} style={{ borderRadius: 0 }} />
            </View>
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, borderWidth: 2, borderColor: C.white, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="pencil" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Avatar picker modal */}
          <Modal visible={showAvatarPicker} transparent animationType="slide" onRequestClose={() => setShowAvatarPicker(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAvatarPicker(false)}>
              <Pressable style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 20 }} />
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 20 }}>Choose Avatar</Text>
                {/* Preview selected */}
                <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <View style={{ width: 90, height: 90, borderRadius: 45, overflow: "hidden", borderWidth: 3, borderColor: C.primary }}>
                    <AvatarImage avatarId={tempAvatar} size={90} style={{ borderRadius: 0 }} />
                  </View>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginBottom: 24 }}>
                  {DEMO_AVATARS.map(av => (
                    <TouchableOpacity
                      key={av.id}
                      onPress={() => setTempAvatar(av.id)}
                      style={[s.avatarPickerItem, tempAvatar === av.id && s.avatarPickerItemActive, { width: 64, height: 64, borderRadius: 32 }]}
                      accessibilityRole="radio"
                      accessibilityLabel={av.label}
                      accessibilityState={{ selected: tempAvatar === av.id }}
                    >
                      <AvatarImage avatarId={av.id} size={60} style={{ borderRadius: 30 }} />
                      {tempAvatar === av.id && (
                        <View style={s.avatarPickerCheck}><Ionicons name="checkmark" size={10} color="#fff" /></View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    setSavingAvatar(true);
                    try {
                      const res = await fetch(`${API_BASE}/api/user/${user._id}/avatar`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ avatar: tempAvatar, sessionId: user.sessionId }),
                      });
                      if (res.ok) { onAvatarChange?.(tempAvatar); setShowAvatarPicker(false); }
                    } catch {}
                    setSavingAvatar(false);
                  }}
                  style={[s.btn, s.btnFill, { marginTop: 0 }]}
                  disabled={savingAvatar}
                  accessibilityRole="button"
                  accessibilityLabel="Save profile avatar"
                  accessibilityState={{ disabled: savingAvatar, busy: savingAvatar }}
                >
                  {savingAvatar
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnText}>Save Avatar</Text>
                  }
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
          <Text style={{ color: C.text, fontWeight: "700", fontSize: 18, marginTop: 10 }}>{user.fullName}</Text>
          {!!user.email && <Text style={{ color: C.textSub, fontSize: 13, marginTop: 2 }}>{user.email}</Text>}
          <View style={[s.subBadge, { backgroundColor: isActive ? C.primaryLight : C.lightGray }]}>
            <Text style={{ color: isActive ? C.primary : C.textMuted, fontWeight: "600", fontSize: 12 }}>
              {user.subscriptionStatus}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
        {/* Stats row */}
        <View style={{
          flexDirection: "row", backgroundColor: C.cardBg, borderRadius: 16,
          borderWidth: 1, borderColor: C.border, marginBottom: 16, overflow: "hidden",
        }}>
          {[
            { label: "Days Learning", value: "—" },
            { label: "Certificates", value: String(certificatesCount || 0) },
            { label: "Courses Done", value: "—" },
          ].map((stat, i, arr) => (
            <View key={i} style={{
              flex: 1, alignItems: "center", paddingVertical: 16,
              borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: C.border,
            }}>
              <Text style={{ color: C.primary, fontWeight: "900", fontSize: 22 }}>{stat.value}</Text>
              <Text style={{ color: C.textMuted, fontSize: 10, fontWeight: "600", marginTop: 3, textAlign: "center" }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Account Info */}
        <View style={s.profileInfoCard}>
          <Text style={s.profileInfoCardTitle}>Account Info</Text>
          {[
            { icon: "person-outline", label: "Full Name", value: user.fullName },
            user.email && { icon: "mail-outline", label: "Email", value: user.email },
            user.mobileNumber && { icon: "call-outline", label: "Phone", value: user.mobileNumber },
            memberSince && { icon: "calendar-outline", label: "Member Since", value: memberSince },
            { icon: "shield-checkmark-outline", label: "Plan", value: user.subscriptionStatus === "none" ? "Free" : user.subscriptionStatus },
          ].filter(Boolean).map((row, i, arr) => (
            <View key={i} style={[s.profileInfoRow, i < arr.length - 1 && s.profileInfoRowBorder]}>
              <View style={s.profileInfoIcon}>
                <Ionicons name={row.icon} size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.profileInfoLabel}>{row.label}</Text>
                <Text style={s.profileInfoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.themeCard}>
          <View style={s.themeCardHeader}>
            <View style={s.profileInfoIcon}>
              <Ionicons name="color-palette-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileInfoValue}>Theme</Text>
              <Text style={s.profileInfoLabel}>Choose your app appearance</Text>
            </View>
          </View>
          <View style={s.themeToggle}>
            {[
              { key: "auto", label: "Auto", icon: "phone-portrait-outline" },
              { key: "light", label: "Light", icon: "sunny-outline" },
              { key: "dark", label: "Dark", icon: "moon-outline" },
            ].map(option => {
              const selected = themeMode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[s.themeOption, selected && s.themeOptionActive]}
                  onPress={() => onThemeChange(option.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} theme`}
                  accessibilityState={{ selected }}
                >
                  <Ionicons name={option.icon} size={16} color={selected ? "#fff" : C.textSub} />
                  <Text style={[s.themeOptionText, selected && s.themeOptionTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Menu items */}
        {[
          { icon: "card-outline", label: "Subscription Details", onPress: onGoToSubscription },
          { icon: "ribbon-outline", label: "My Certificates", badge: certificatesCount || 0, onPress: onGoToCertificates },
          { icon: "heart-outline", label: "My Wishlist", badge: wishlistCount || 0, onPress: onGoToWishlist },
          { icon: "help-circle-outline", label: "Help & Support", onPress: () => Linking.openURL("mailto:support@skillomate.ai") },
          { icon: "document-text-outline", label: "Terms & Conditions", onPress: () => openAppLink(TERMS_URL, "Terms & Conditions") },
          { icon: "shield-outline", label: "Privacy Policy", onPress: () => openAppLink(PRIVACY_URL, "Privacy Policy") },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={s.menuItem} onPress={item.onPress}>
            <View style={s.menuIconBox}>
              <Ionicons name={item.icon} size={20} color={C.primary} />
            </View>
            <Text style={s.menuLabel}>{item.label}</Text>
            {item.badge > 0 && (
              <View style={{ backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 }}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{item.badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => Alert.alert("Log out?", "Log out of Skillomate on this device? You’ll need to sign in again to access your courses and downloads.", [
            { text: "Cancel", style: "cancel" },
            { text: "Log out", style: "destructive", onPress: onLogout },
          ])}
          accessibilityRole="button"
          accessibilityLabel="Log out of Skillomate"
        >
          <Ionicons name="log-out-outline" size={18} color={C.danger} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={{ textAlign: "center", color: C.textMuted, fontSize: 12, marginTop: 16 }}>Version 1.0</Text>
      </ScrollView>

      <BottomNav active="profile" onHome={onGoToHome} onCourses={onGoToCourses} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={() => {}} aiRobotId={aiRobotId} />
    </View>
  );
}

const AI_SUGGESTIONS = [
  "What is generative AI?",
  "Explain RAG simply",
  "Give me a quick quiz",
];

function formatAiCourseName(course) {
  return (course?.name || course?.id || "AI Full Course")
    .replace(/\.txt$/i, "")
    .replaceAll("-", " ");
}

function normalizeAiCourseKey(value) {
  return String(value || "")
    .replace(/\.txt$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getAiCourseCandidates(course) {
  return [
    course?.aiCourseId,
    course?.ragCourseId,
    course?.assistantCourseId,
    course?.courseId,
    course?.slug,
    course?.title,
    course?.name,
    course?._id,
  ].filter(Boolean);
}

function findIndexedAiCourse(appCourse, indexedCourses) {
  if (!appCourse || !Array.isArray(indexedCourses)) return null;
  const candidates = getAiCourseCandidates(appCourse).map(normalizeAiCourseKey);
  return indexedCourses.find(course => {
    const values = [
      course.id,
      course.name,
      ...(Array.isArray(course.modules) ? course.modules : []),
    ].map(normalizeAiCourseKey);
    return candidates.some(candidate =>
      candidate && values.some(value => value === candidate || value.includes(candidate) || candidate.includes(value))
    );
  }) || null;
}

function RobotAvatar({ robotId, size = 30 }) {
  const src = robotId ? AI_ROBOT_IMAGES[robotId] : null;
  if (!src) return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="sparkles" size={size * 0.5} color="#fff" />
    </View>
  );
  return (
    <Image accessible={false} source={src} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
  );
}

function AiAssistantScreen({
  mode = "master",
  fixedCourse = null,
  user,
  onBack,
  onGoToHome,
  onGoToCourses,
  onGoToDownloads,
  onGoToProfile,
  onRobotChange,
}) {
  const isCourseMode = mode === "course";
  const [courseId, setCourseId] = useState(null);
  const [courseName, setCourseName] = useState(isCourseMode ? fixedCourse?.title || "Course AI" : "Master AI");
  const [courseScopeReady, setCourseScopeReady] = useState(!isCourseMode);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: isCourseMode
        ? `Ask doubts from ${fixedCourse?.title || "this course"}. I will answer only from this course's indexed lessons.`
        : "Ask anything from your indexed courses. I can search across all course lessons.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("checking");
  const [robotId, setRobotId] = useState(null);
  const [showRobotPicker, setShowRobotPicker] = useState(false);
  const listRef = useRef(null);

  // First-time open — ask to pick robot avatar
  useEffect(() => {
    AsyncStorage.getItem(AI_AVATAR_STORAGE_KEY).then(saved => {
      if (saved) { setRobotId(saved); }
      else { setShowRobotPicker(true); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!AI_FEATURE_ENABLED) {
      setStatus("offline");
      setCourseScopeReady(false);
      setMessages([
        {
          role: "assistant",
          content: "AI is paused for now.",
        },
      ]);
      return;
    }

    if (!user?._id || !user?.sessionId) {
      setStatus("offline");
      setCourseScopeReady(false);
      setMessages([{
        role: "assistant",
        content: "Please log in again before using Nex AI.",
      }]);
      return;
    }

    const authQuery = `userId=${encodeURIComponent(user._id)}&sessionId=${encodeURIComponent(user.sessionId)}`;

    Promise.all([
      fetch(`${AI_BASE}/api/ai/health?${authQuery}`).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not check Nex AI");
        return data;
      }),
      fetch(`${AI_BASE}/api/ai/courses?${authQuery}`).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load Nex AI courses");
        return data;
      }),
    ])
      .then(([health, data]) => {
        setStatus(health.ok ? "online" : "offline");
        const nextCourses = Array.isArray(data) ? data : [];
        if (isCourseMode) {
          const matchedCourse = findIndexedAiCourse(fixedCourse, nextCourses);
          if (matchedCourse) {
            setCourseId(matchedCourse.id);
            setCourseName(formatAiCourseName(matchedCourse));
            setMessages([
              {
                role: "assistant",
                content: `Ask doubts from ${fixedCourse?.title || formatAiCourseName(matchedCourse)}. I will answer only from this course.`,
              },
            ]);
          } else {
            setCourseId(null);
            setCourseName(fixedCourse?.title || "Course AI");
            setMessages([
              {
                role: "assistant",
                content: "This course is not indexed for AI yet. Add its transcript to the AI knowledge base to enable course-specific answers.",
              },
            ]);
          }
          setCourseScopeReady(Boolean(matchedCourse));
        }
      })
      .catch(() => {
        setStatus("offline");
        if (isCourseMode) {
          setCourseScopeReady(false);
          setMessages([
            {
              role: "assistant",
              content: "I could not load the AI course index. Check that the AI service is running.",
            },
          ]);
        }
      });
  }, [fixedCourse, isCourseMode, user?._id, user?.sessionId]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 80);
  }, [messages, loading]);

  async function sendAiMessage(value = input) {
    const question = value.trim();
    if (!question || loading) return;
    if (!AI_FEATURE_ENABLED) {
      setInput("");
      setMessages(prev => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: "AI is paused for now." },
      ]);
      return;
    }
    if (isCourseMode && !courseId) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I cannot answer for this course yet because it is not indexed in the AI knowledge base.",
      }]);
      return;
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch(`${AI_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          userId: user?._id,
          sessionId: user?.sessionId,
          ...(courseId ? { courseId } : {}),
        }),
      });
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      const serverError = data.error || data.message || (data.status ? `${data.status}: ${raw}` : "");
      const answer = res.ok
        ? data.answer || data.reply
        : serverError || "I could not reach the AI service.";
      setMessages(prev => [...prev, { role: "assistant", content: answer || "Try asking again." }]);
    } catch {
      const devTarget = __DEV__ ? ` at ${AI_BASE}` : "";
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `I could not reach Nex AI${devTarget}. Check that the backend is reachable.`,
        },
      ]);
      setStatus("offline");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <SafeAreaView style={{ backgroundColor: C.white }}>
        <View style={s.pageHeader}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={s.iconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back to course"
            >
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={[s.pageTitle, { marginLeft: onBack ? 0 : 0, textAlign: "center" }]} numberOfLines={1}>
            {isCourseMode ? "Course AI" : "AI Assistant"}
          </Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
        style={{ flex: 1 }}
      >
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          marginHorizontal: 16, marginTop: 12, marginBottom: 10,
          padding: 14, borderRadius: 16,
          backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border,
        }}>
          <TouchableOpacity
            onPress={() => setShowRobotPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={robotId ? "Change AI companion" : "Choose AI companion"}
          >
            <View style={{ position: "relative" }}>
              <RobotAvatar robotId={robotId} size={50} />
              <View style={{
                position: "absolute", bottom: 0, right: 0,
                width: 14, height: 14, borderRadius: 7,
                backgroundColor: status === "online" ? "#22C55E" : C.warning,
                borderWidth: 2, borderColor: C.cardBg,
              }} />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.aiHeroTitle} numberOfLines={1}>{courseName}</Text>
            <View style={s.aiStatusRow}>
              <View style={[s.aiStatusDot, status === "online" ? s.aiStatusOnline : s.aiStatusOffline]} />
              <Text style={s.aiHeroSub}>
                {status !== "online"
                  ? "Nex AI is unavailable"
                  : isCourseMode
                    ? courseScopeReady ? "Scoped to this course" : "Course not indexed"
                    : "Master search across all courses"}
              </Text>
            </View>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={s.aiMessages}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={9}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View style={[s.aiMessageRow, isUser && s.aiMessageRowUser]}>
                {!isUser && <RobotAvatar robotId={robotId} size={30} />}
                <View style={[s.aiBubble, isUser && s.aiBubbleUser]}>
                  <Text style={[s.aiBubbleText, isUser && s.aiBubbleTextUser]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={loading ? (
            <View style={s.aiMessageRow}>
              <RobotAvatar robotId={robotId} size={30} />
              <View style={s.aiBubble}>
                <ActivityIndicator color={C.primary} size="small" />
              </View>
            </View>
          ) : null}
        />

        {!loading && (
          <View style={s.aiSuggestions}>
            {AI_SUGGESTIONS.map(prompt => (
              <TouchableOpacity
                key={prompt}
                style={s.aiSuggestion}
                onPress={() => sendAiMessage(prompt)}
                accessibilityRole="button"
                accessibilityLabel={`Ask Nex AI: ${prompt}`}
              >
                <Text style={s.aiSuggestionText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.aiComposer}>
          <TextInput
            style={s.aiInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a course question..."
            placeholderTextColor={C.textMuted}
            editable={!loading}
            multiline
            accessibilityLabel="Message Nex AI"
          />
          <TouchableOpacity
            style={[s.aiSend, (!input.trim() || loading) && s.aiSendDisabled]}
            onPress={() => sendAiMessage()}
            disabled={!input.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !input.trim() || loading }}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {!isCourseMode && (
        <BottomNav active="ai"
          onHome={onGoToHome}
          onCourses={onGoToCourses}
          onAI={() => {}}
          onDownloads={onGoToDownloads}
          onProfile={onGoToProfile}
          aiRobotId={robotId}
        />
      )}

      {/* Robot avatar picker modal */}
      <Modal visible={showRobotPicker} transparent animationType="fade" onRequestClose={() => setShowRobotPicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 20, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 6 }}>Choose Your AI</Text>
            <Text style={{ color: C.textSub, textAlign: "center", fontSize: 13, marginBottom: 24 }}>Pick a companion for your learning journey</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 4, marginBottom: 28 }}
              nestedScrollEnabled
            >
              {AI_ROBOT_AVATARS.map(bot => (
                <TouchableOpacity
                  key={bot.id}
                  onPress={() => setRobotId(bot.id)}
                  style={{ alignItems: "center", gap: 6 }}
                  accessibilityRole="radio"
                  accessibilityLabel={bot.label}
                  accessibilityState={{ selected: robotId === bot.id }}
                >
                  <Image
                    accessible={false}
                    source={AI_ROBOT_IMAGES[bot.id]}
                    style={{ width: 72, height: 72, borderRadius: 36, borderWidth: robotId === bot.id ? 3 : 1.5, borderColor: robotId === bot.id ? C.primary : C.border }}
                    resizeMode="cover"
                  />
                  {robotId === bot.id && <Ionicons name="checkmark-circle" size={16} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => {
                if (!robotId) return;
                AsyncStorage.setItem(AI_AVATAR_STORAGE_KEY, robotId).catch(() => {});
                onRobotChange?.(robotId);
                setShowRobotPicker(false);
              }}
              disabled={!robotId}
              style={[s.btn, s.btnFill, !robotId && { opacity: 0.45 }]}
              accessibilityRole="button"
              accessibilityLabel="Confirm AI companion"
              accessibilityState={{ disabled: !robotId }}
            >
              <Text style={s.btnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const systemScheme = useColorScheme();
  const [, forceUpdate] = useState(0);
  const [isRestoring, setIsRestoring] = useState(true);
  const [user, setUser] = useState(null);
  const [mainScreen, setMainScreen] = useState("home");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [startIndex, setStartIndex] = useState(null);
  const [initialTime, setInitialTime] = useState(0);
  const [preloadedVideos, setPreloadedVideos] = useState(null);
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);
  const [downloads, setDownloads] = useState({});
  const downloadsRef = useRef({});
  const [aiRobotId, setAiRobotId] = useState(null);
  const [showAppUpgrade, setShowAppUpgrade] = useState(false);
  const [courseAiTarget, setCourseAiTarget] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [courseProgress, setCourseProgress] = useState({});
  const [themeMode, setThemeMode] = useState("light");
  const [certificates, setCertificates] = useState([]);
  const [certModal, setCertModal] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetStep, setResetStep] = useState("request");
  const [resetMobile, setResetMobile] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [screen, setScreen] = useState("login");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [signupToken, setSignupToken] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [signupFullName, setSignupFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupGender, setSignupGender] = useState("");
  const [signupAge, setSignupAge] = useState("18");
  const [signupAvatar, setSignupAvatar] = useState("a1");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");

  const refreshUser = useCallback(async (userId, fallback = null, sessionId = null) => {
    try {
      const url = sessionId
        ? `${API_BASE}/api/auth/validate/${userId}?sessionId=${encodeURIComponent(sessionId)}`
        : `${API_BASE}/api/auth/validate/${userId}`;
      const res = await fetch(url);
      if (res.status === 401) {
        await AsyncStorage.removeItem("user");
        setUser(null); setSelectedCourse(null); setStartIndex(null); setMainScreen("home");
        return;
      }
      if (!res.ok) {
        // API failed — show fallback (may not have avatar, but better than nothing)
        if (fallback) setUser(fallback);
        return;
      }
      const { user: fresh, wishlist: freshWishlist } = await res.json();
      const merged = { ...fresh, sessionId: fallback?.sessionId || sessionId };
      await AsyncStorage.setItem("user", JSON.stringify(merged));
      setUser(merged); // always set fresh data first — includes avatar
      if (Array.isArray(freshWishlist)) setWishlist(freshWishlist);
    } catch {
      if (fallback) setUser(fallback);
    }
  }, []);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(savedTheme => {
      const mode = ["light", "dark", "auto"].includes(savedTheme) ? savedTheme : "light";
      setThemeMode(mode);
      applyThemeColors(mode === "auto" ? (systemScheme === "dark" ? "dark" : "light") : mode);
      forceUpdate(n => n + 1);
    }).catch(() => {
      setThemeMode("light");
      applyThemeColors("light");
    });
    AsyncStorage.getItem("user").then(async v => {
      try {
        if (v) {
          const stored = JSON.parse(v);
          if (stored.sessionId) {
            await refreshUser(stored._id, stored, stored.sessionId);
          } else {
            AsyncStorage.removeItem("user");
          }
        }
      } catch {}
      setIsRestoring(false);
    }).catch(() => setIsRestoring(false));
    AsyncStorage.getItem(AI_AVATAR_STORAGE_KEY).then(v => { if (v) setAiRobotId(v); }).catch(() => {});
    // wishlist is now DB-backed — loaded via refreshUser/validate response
    return () => { ScreenCapture.allowScreenCaptureAsync(); };
  }, [systemScheme, refreshUser]);

  const changeTheme = useCallback((mode) => {
    if (mode !== "dark" && mode !== "light" && mode !== "auto") return;
    setThemeMode(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
    if (mode !== "auto") {
      applyThemeColors(mode);
      forceUpdate(n => n + 1);
    }
  }, []);

  useEffect(() => {
    if (themeMode === "auto") {
      applyThemeColors(systemScheme === "dark" ? "dark" : "light");
      forceUpdate(n => n + 1);
    }
  }, [themeMode, systemScheme]);

  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => { downloadsRef.current = downloads; }, [downloads]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!userRef.current) {
        if (resetVisible) { closePasswordReset(); return true; }
        if (screen === "signup2") { setScreen("signup1"); setSignupError(""); return true; }
        if (screen === "signup1") {
          if (otpSent) { setOtpSent(false); setOtp(""); setSignupToken(""); setSignupError(""); return true; }
          resetSignup();
          return true;
        }
        return true;
      }

      if (courseAiTarget) { setCourseAiTarget(null); return true; }
      if (certModal) { setCertModal(null); return true; }
      if (showAppUpgrade) { setShowAppUpgrade(false); return true; }
      if (mainScreen === "courses" && startIndex !== null) {
        if (isPreviewOnly) {
          setSelectedCourse(null);
          setStartIndex(null);
          setInitialTime(0);
          setPreloadedVideos(null);
          setIsPreviewOnly(false);
          setMainScreen("home");
          return true;
        }
        loadCourseProgress();
        setStartIndex(null);
        setInitialTime(0);
        setPreloadedVideos(null);
        setIsPreviewOnly(false);
        return true;
      }
      if (mainScreen === "courses" && selectedCourse) {
        loadCourseProgress();
        setSelectedCourse(null);
        return true;
      }
      if (mainScreen === "wishlist" || mainScreen === "certificates") {
        setMainScreen("profile");
        return true;
      }
      if (mainScreen !== "home") {
        setSelectedCourse(null);
        setStartIndex(null);
        setInitialTime(0);
        setPreloadedVideos(null);
        setIsPreviewOnly(false);
        loadCourseProgress();
        setMainScreen("home");
        return true;
      }
      return true;
    });
    return () => sub.remove();
  }, [screen, otpSent, resetVisible, courseAiTarget, certModal, showAppUpgrade, mainScreen, startIndex, selectedCourse, isPreviewOnly, loadCourseProgress]);

  // Load saved downloads on startup and verify files still exist
  useEffect(() => {
    AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY).then(async stored => {
      if (!stored) return;
      const saved = JSON.parse(stored);
      const verified = {};
      await Promise.all(Object.entries(saved).map(async ([guid, info]) => {
        if (info?.path) {
          const stat = await FileSystem.getInfoAsync(info.path).catch(() => ({ exists: false }));
          if (stat.exists) verified[guid] = info;
        }
      }));
      setDownloads(DEV_UI_QA_ENABLED ? { ...UI_QA_DOWNLOADS, ...verified } : verified);
      AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(verified)).catch(() => {});
    }).catch(() => {
      if (DEV_UI_QA_ENABLED) setDownloads(UI_QA_DOWNLOADS);
    });
  }, []);

  const startDownload = useCallback(async (video, courseId, courseTitle) => {
    const u = userRef.current;
    const guid = getBunnyGuid(video);
    const libraryId = getBunnyLibraryId(video);
    if (!guid || !u?._id || !u?.sessionId) return;
    const current = downloadsRef.current[guid];
    if (current?.status === "downloading" || current?.status === "done") return;

    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true }).catch(() => {});
    const filePath = DOWNLOADS_DIR + guid + ".mp4";
    const url = `${API_BASE}/api/videos/${guid}/download?userId=${encodeURIComponent(u._id)}&sessionId=${encodeURIComponent(u.sessionId)}&libraryId=${encodeURIComponent(libraryId)}&courseId=${encodeURIComponent(courseId || "")}&courseTitle=${encodeURIComponent(courseTitle || "")}&videoTitle=${encodeURIComponent(video.title || "")}`;
    const meta = { title: video.title || "Video", courseId: courseId || "", courseTitle: courseTitle || "", bunnyGuid: guid, bunnyLibraryId: libraryId, videoId: String(video._id || guid) };

    setDownloads(prev => ({ ...prev, [guid]: { status: "downloading", progress: 0, path: filePath, ...meta } }));
    try {
      const dl = FileSystem.createDownloadResumable(url, filePath, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const pct = totalBytesExpectedToWrite > 0 ? totalBytesWritten / totalBytesExpectedToWrite : 0;
        setDownloads(prev => ({ ...prev, [guid]: { ...prev[guid], progress: pct } }));
      });
      const result = await dl.downloadAsync();
      if (result?.status === 200) {
        const stat = await FileSystem.getInfoAsync(result.uri).catch(() => ({}));
        const info = { status: "done", path: result.uri, progress: 1, size: stat.size || 0, downloadedAt: new Date().toISOString(), ...meta };
        // Save from state — avoids race condition when multiple downloads finish simultaneously
        setDownloads(prev => {
          const next = { ...prev, [guid]: info };
          const toSave = Object.fromEntries(Object.entries(next).filter(([, v]) => v.status === "done"));
          AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
          return next;
        });
        Alert.alert("Downloaded", "Video saved for offline viewing.");
      } else {
        setDownloads(prev => ({ ...prev, [guid]: { status: "error", progress: 0, ...meta } }));
        Alert.alert("Download failed", `Server returned ${result?.status || "an error"}.`);
      }
    } catch (e) {
      setDownloads(prev => ({ ...prev, [guid]: { status: "error", progress: 0, ...meta } }));
      Alert.alert("Download failed", e?.message || "Could not download this video.");
    }
  }, []);

  const deleteDownload = useCallback(async (guid) => {
    await FileSystem.deleteAsync(DOWNLOADS_DIR + guid + ".mp4", { idempotent: true }).catch(() => {});
    setDownloads(prev => {
      const next = { ...prev };
      delete next[guid];
      const toSave = Object.fromEntries(Object.entries(next).filter(([, v]) => v.status === "done"));
      AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
      return next;
    });
  }, []);

  const loadCourseProgress = useCallback(async (u = userRef.current) => {
    if (!u?._id || !u?.sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/user/${u._id}/progress?sessionId=${encodeURIComponent(u.sessionId)}`);
      if (!res.ok) {
        console.log("Progress load failed", res.status);
        if (DEV_UI_QA_ENABLED) setCourseProgress(UI_QA_PROGRESS);
        return;
      }
      const data = await res.json();
      const nextProgress = data.courseProgress || {};
      setCourseProgress(DEV_UI_QA_ENABLED && Object.keys(nextProgress).length === 0 ? UI_QA_PROGRESS : nextProgress);
    } catch {
      if (DEV_UI_QA_ENABLED) setCourseProgress(UI_QA_PROGRESS);
    }
  }, []);

  useEffect(() => {
    if (user?._id && user?.sessionId) loadCourseProgress(user);
    else setCourseProgress(DEV_UI_QA_ENABLED && user?._id ? UI_QA_PROGRESS : {});
  }, [user?._id, user?.sessionId, loadCourseProgress]);

  useEffect(() => {
    if (!DEV_UI_QA_ENABLED || !user?._id) return;
    setWishlist(prev => [...new Set([...(prev || []), ...UI_QA_WISHLIST])]);
    setCourseProgress(prev => ({ ...(prev || {}), ...UI_QA_PROGRESS }));
    setCertificates(prev => prev?.length ? prev : getQaCertificatesForUser(user));
    setDownloads(prev => ({ ...UI_QA_DOWNLOADS, ...(prev || {}) }));
  }, [user?._id, user?.fullName, user?.email, user?.mobileNumber]);

  const loadCertificates = useCallback(async (u = userRef.current) => {
    if (!u?._id || !u?.sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/user/${u._id}/certificates?sessionId=${encodeURIComponent(u.sessionId)}`);
      if (!res.ok) {
        if (DEV_UI_QA_ENABLED) setCertificates(getQaCertificatesForUser(u));
        return;
      }
      const data = await res.json();
      const nextCertificates = data.certificates || [];
      setCertificates(DEV_UI_QA_ENABLED && nextCertificates.length === 0 ? getQaCertificatesForUser(u) : nextCertificates);
    } catch {
      if (DEV_UI_QA_ENABLED) setCertificates(getQaCertificatesForUser(u));
    }
  }, []);

  useEffect(() => {
    if (user?._id && user?.sessionId) loadCertificates(user);
    else setCertificates(DEV_UI_QA_ENABLED && user?._id ? getQaCertificatesForUser(user) : []);
  }, [user?._id, user?.sessionId, loadCertificates]);

  const openCourse = useCallback(async (course, options = {}) => {
    const u = userRef.current;
    if (!hasCourseAccess(u)) { setShowAppUpgrade(true); return; }
    const fixtureCourse = DEV_UI_QA_ENABLED
      ? UI_QA_COURSES.find(item => item._id === course?._id)
      : null;
    if (fixtureCourse || (DEV_UI_QA_ENABLED && Array.isArray(course?.videos) && course.videos.length > 0)) {
      const nextCourse = fixtureCourse || course;
      setSelectedCourse(nextCourse);
      setPreloadedVideos(null);
      setIsPreviewOnly(false);
      setInitialTime(options.initialTime || 0);
      setStartIndex(Number.isInteger(options.startIndex) ? options.startIndex : null);
      setMainScreen("courses");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/courses/${course._id}/videos?userId=${encodeURIComponent(u._id)}&sessionId=${encodeURIComponent(u.sessionId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open course.");
      setSelectedCourse({ ...course, videos: data.videos || [] });
      setPreloadedVideos(null);
      setIsPreviewOnly(false);
      setInitialTime(options.initialTime || 0);
      setStartIndex(Number.isInteger(options.startIndex) ? options.startIndex : null);
      setMainScreen("courses");
    } catch (e) {
      Alert.alert("Course access", e?.message || "Could not open course.");
    }
  }, []);

  const openHeroPreview = useCallback(async (course, video, videoIndex = 0) => {
    const previewVideo = video || course?.videos?.[videoIndex] || course?.videos?.[0];
    if (!isPlayableVideo(previewVideo)) {
      setMainScreen("courses");
      return;
    }
    const previewCourse = course || { _id: "hero-preview", title: "Preview" };
    setSelectedCourse({ ...previewCourse, videos: [previewVideo] });
    setPreloadedVideos([previewVideo]);
    setInitialTime(0);
    setStartIndex(0);
    setIsPreviewOnly(true);
    setMainScreen("courses");
  }, []);

  const markVideoComplete = useCallback(async (courseId, videoId) => {
    const u = userRef.current;
    if (!u?._id || !u?.sessionId || !courseId || !videoId) return;
    const id = String(videoId);
    const existing = courseProgress?.[courseId]?.completedVideoIds || [];
    if (existing.map(String).includes(id)) return;
    const revertCompletion = () => {
      setCourseProgress(prev => ({
        ...prev,
        [courseId]: {
          ...(prev[courseId] || {}),
          completedVideoIds: (prev[courseId]?.completedVideoIds || []).filter(v => String(v) !== id),
        },
      }));
    };
    setCourseProgress(prev => {
      const current = prev[courseId]?.completedVideoIds || [];
      return {
        ...prev,
        [courseId]: {
          ...(prev[courseId] || {}),
          completedVideoIds: [...current, id],
          updatedAt: new Date().toISOString(),
        },
      };
    });
    try {
      const res = await fetch(`${API_BASE}/api/user/progress/complete-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u._id, sessionId: u.sessionId, courseId, videoId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.progress) {
          setCourseProgress(prev => ({ ...prev, [courseId]: data.progress }));
        } else {
          setCourseProgress(prev => ({
            ...prev,
            [courseId]: {
              ...(prev[courseId] || {}),
              completedVideoIds: data.completedVideoIds || prev[courseId]?.completedVideoIds || [],
            },
          }));
        }
        if (data.certificate) {
          setCertificates(prev => {
            const exists = prev.some(c => c.courseId === courseId);
            if (!exists) {
              setCertModal(data.certificate);
              return [data.certificate, ...prev];
            }
            return prev;
          });
        }
      } else {
        console.log("Progress save failed", res.status);
        revertCompletion();
      }
    } catch (e) {
      console.log("Progress save error", e?.message);
      revertCompletion();
    }
  }, [courseProgress]);

  const saveVideoProgress = useCallback(async (courseId, videoId, currentTime, duration) => {
    const u = userRef.current;
    if (!u?._id || !u?.sessionId || !courseId || !videoId || !duration) return;
    try {
      const res = await fetch(`${API_BASE}/api/user/progress/update-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: u._id,
          sessionId: u.sessionId,
          courseId,
          videoId: String(videoId),
          currentTime,
          duration,
        }),
      });
      if (!res.ok) {
        console.log("Progress update failed", res.status);
        return;
      }
      const data = await res.json();
      if (data.progress) setCourseProgress(prev => ({ ...prev, [courseId]: data.progress }));
      if (data.certificate) {
        setCertificates(prev => {
          const exists = prev.some(c => c.courseId === courseId);
          if (!exists) setCertModal(data.certificate);
          return exists ? prev : [data.certificate, ...prev];
        });
      }
    } catch (e) {
      console.log("Progress update error", e?.message);
    }
  }, []);

  const toggleWishlist = useCallback(async (courseId) => {
    const u = userRef.current;
    if (!u) return;
    // Optimistic update
    setWishlist(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
    try {
      const res = await fetch(`${API_BASE}/api/user/wishlist/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u._id, courseId, sessionId: u.sessionId }),
      });
      if (res.ok) {
        const { wishlist: updated } = await res.json();
        setWishlist(updated);
      } else {
        // Revert optimistic update on failure
        setWishlist(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
      }
    } catch {
      // Network error — revert
      setWishlist(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const id = user._id;
    const sid = user.sessionId || null;
    const wsUrl = API_BASE.replace(/^http/, "ws");
    let ws;
    let reconnectTimeout;
    let intentionallyClosed = false;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => { ws.send(JSON.stringify({ userId: id, sessionId: sid })); };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "USER_UPDATE") {
            setUser(prev => {
              const merged = { ...prev, ...data.user, sessionId: sid };
              AsyncStorage.setItem("user", JSON.stringify(merged));
              return merged;
            });
          } else if (data.type === "USER_DELETED" || data.type === "SESSION_REPLACED") {
            intentionallyClosed = true;
            AsyncStorage.removeItem("user");
            setUser(null); setSelectedCourse(null); setStartIndex(null); setMainScreen("home");
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!intentionallyClosed) reconnectTimeout = setTimeout(connect, 5000);
      };

      ws.onerror = () => {};
    }

    connect();

    const sub = AppState.addEventListener("change", state => {
      if (state === "active" && (!ws || ws.readyState === WebSocket.CLOSED)) {
        clearTimeout(reconnectTimeout);
        connect();
      }
    });

    return () => {
      intentionallyClosed = true;
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      sub.remove();
    };
  }, [user?._id]);

  async function login() {
    if (!email.trim() || !password.trim()) { setLoginError("Please enter your email/phone and password."); return; }
    setLoginLoading(true); setLoginError("");
    try {
      const identifier = email.trim();
      const { res, data } = await postApiJson("/api/auth/login", {
        identifier,
        email: identifier,
        mobileNumber: identifier,
        emailOrMobile: identifier,
        password,
      });
      if (!res.ok) setLoginError(data.error || "Login failed.");
      else {
        const authUser = normalizeAuthUser(data);
        if (!authUser) {
          setLoginError("Login succeeded, but the server response was incomplete.");
          return;
        }
        await AsyncStorage.setItem("user", JSON.stringify(authUser));
        setUser(authUser);
        setWishlist(authUser.wishlist || []);
        clearLoginForm();
      }
    } catch { setLoginError("Cannot connect to server. Try again."); }
    finally { setLoginLoading(false); }
  }

  function closePasswordReset() {
    setResetVisible(false);
    setResetStep("request");
    setResetOtp("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetError("");
    setResetLoading(false);
  }

  function openPasswordReset() {
    const loginDigits = email.replace(/\D/g, "");
    const localMobile = loginDigits.startsWith("91") && loginDigits.length === 12
      ? loginDigits.slice(2)
      : loginDigits;
    setResetMobile(localMobile.length === 10 ? localMobile : "");
    setResetStep("request");
    setResetError("");
    setResetVisible(true);
  }

  async function requestPasswordReset() {
    const mobileNumber = resetMobile.replace(/\D/g, "");
    if (mobileNumber.length !== 10) {
      setResetError("Enter the 10-digit mobile number registered to your account.");
      return;
    }
    setResetLoading(true);
    setResetError("");
    try {
      const { res, data } = await postApiJson("/api/auth/password-reset/request", { mobileNumber });
      if (!res?.ok) {
        setResetError(data.error || "Could not send a reset code.");
        return;
      }
      setResetStep("confirm");
      if (data.developmentAutofill && data.devOtp) setResetOtp(String(data.devOtp));
    } catch {
      setResetError("Cannot connect to the server. Try again.");
    } finally {
      setResetLoading(false);
    }
  }

  async function confirmPasswordReset() {
    if (!/^\d{6}$/.test(resetOtp.trim())) {
      setResetError("Enter the 6-digit reset code.");
      return;
    }
    if (resetNewPassword.length < 8) {
      setResetError("New password must be at least 8 characters.");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("The new passwords do not match.");
      return;
    }
    setResetLoading(true);
    setResetError("");
    try {
      const { res, data } = await postApiJson("/api/auth/password-reset/confirm", {
        mobileNumber: resetMobile.replace(/\D/g, ""),
        otp: resetOtp.trim(),
        newPassword: resetNewPassword,
      });
      if (!res?.ok) {
        setResetError(data.error || "Could not reset your password.");
        return;
      }
      setPassword("");
      closePasswordReset();
      Alert.alert("Password updated", "Sign in with your new password.");
    } catch {
      setResetError("Cannot connect to the server. Try again.");
    } finally {
      setResetLoading(false);
    }
  }

  async function sendOtp() {
    if (!mobile.trim() || mobile.trim().length !== 10) { setSignupError("Enter a valid 10-digit mobile number."); return; }
    setOtpLoading(true); setSignupError("");
    if (DEV_UI_QA_ENABLED) {
      setTimeout(() => {
        setOtpSent(true);
        setSignupToken("");
        setOtpLoading(false);
      }, 180);
      return;
    }
    try {
      const mobileNumber = mobile.trim();
      const { res, data } = await postApiJson(
        ["/api/auth/send-otp", "/api/auth/sendOtp", "/api/auth/request-otp", "/api/auth/requestOtp"],
        { mobileNumber, mobile: mobileNumber, phone: mobileNumber }
      );
      if (!res) {
        setSignupError("OTP endpoint is not available on this server.");
        return;
      }
      if (!res.ok) setSignupError(data.error || "Failed to send OTP.");
      else { setOtpSent(true); setSignupToken(""); }
    } catch { setSignupError("Cannot connect to server. Try again."); }
    finally { setOtpLoading(false); }
  }

  async function verifyOtp() {
    if (!otp.trim() || otp.trim().length !== 6) { setSignupError("Enter the 6-digit OTP."); return; }
    setOtpLoading(true); setSignupError("");
    if (DEV_UI_QA_ENABLED) {
      setTimeout(() => {
        if (otp.trim() === "000000") {
          setSignupToken("ui-qa-signup-token");
          setScreen("signup2");
          setSignupError("");
        } else {
          setSignupError("Invalid OTP for UI QA. Use 000000 to continue in development mode.");
        }
        setOtpLoading(false);
      }, 180);
      return;
    }
    try {
      const mobileNumber = mobile.trim();
      const code = otp.trim();
      const { res, data } = await postApiJson(
        ["/api/auth/verify-otp", "/api/auth/verifyOtp", "/api/auth/verify-mobile", "/api/auth/verifyMobile"],
        { mobileNumber, mobile: mobileNumber, phone: mobileNumber, otp: code, code }
      );
      if (!res) {
        setSignupError("OTP verification endpoint is not available on this server.");
        return;
      }
      if (!res.ok) setSignupError(data.error || "OTP verification failed.");
      else {
        if (!data.signupToken) {
          setSignupError("Phone verified, but the signup token was missing. Request a new code.");
          return;
        }
        setSignupToken(data.signupToken);
        setScreen("signup2");
        setSignupError("");
      }
    } catch { setSignupError("Cannot connect to server. Try again."); }
    finally { setOtpLoading(false); }
  }

  async function register() {
    if (!signupFullName.trim()) { setSignupError("Full name is required."); return; }
    if (mobile.trim().length !== 10) { setSignupError("Enter a valid 10-digit mobile number."); return; }
    if (!signupPassword.trim() || signupPassword.length < 8) { setSignupError("Password must be at least 8 characters."); return; }
    if (!signupToken && !DEV_UI_QA_ENABLED) { setSignupError("Please verify your mobile number again."); setScreen("signup1"); return; }
    setSignupLoading(true); setSignupError("");
    try {
      const mobileNumber = mobile.trim();
      const fullName = signupFullName.trim();
      const emailAddress = signupEmail.trim() || null;
      const { res, data } = await postApiJson(["/api/auth/register", "/api/auth/signup"], {
        fullName,
        name: fullName,
        email: emailAddress,
        password: signupPassword,
        mobileNumber,
        mobile: mobileNumber,
        phone: mobileNumber,
        gender: signupGender ? signupGender.toLowerCase() : null,
        age: signupAge ? Number(signupAge) : null,
        avatar: signupAvatar,
        signupToken,
      });
      if (!res) {
        setSignupError("Registration endpoint is not available on this server.");
        return;
      }
      if (!res.ok) setSignupError(data.error || "Registration failed.");
      else {
        const authUser = normalizeAuthUser(data);
        if (!authUser) {
          setSignupError("Account created, but the server response was incomplete.");
          return;
        }
        await AsyncStorage.setItem("user", JSON.stringify(authUser));
        AsyncStorage.removeItem(AI_AVATAR_STORAGE_KEY);
        setAiRobotId(null);
        setUser(authUser);
        setWishlist(authUser.wishlist || []);
        clearLoginForm();
        resetSignup();
      }
    } catch { setSignupError("Cannot connect to server. Try again."); }
    finally { setSignupLoading(false); }
  }

  function clearLoginForm() {
    setEmail("");
    setPassword("");
    setLoginError("");
  }

  function resetSignup() {
    setScreen("login"); setMobile(""); setOtp(""); setOtpSent(false); setSignupToken("");
    setSignupFullName(""); setSignupEmail(""); setSignupPassword(""); setSignupGender(""); setSignupAge("18"); setSignupAvatar("a1"); setSignupError("");
  }

  function handleLogout() {
    AsyncStorage.removeItem("user");
    AsyncStorage.removeItem(AI_AVATAR_STORAGE_KEY);
    setAiRobotId(null);
    setWishlist([]);
    setCourseProgress({});
    clearLoginForm();
    resetSignup();
    setUser(null); setSelectedCourse(null); setStartIndex(null); setCourseAiTarget(null); setMainScreen("home");
  }

  // ── Splash loader — shown while restoring session from storage ──────────────
  if (isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  // ── Auth screens ────────────────────────────────────────────────────────────
  if (!user) {
    if (screen === "signup1") {
      return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
    <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
    <SafeAreaView>
      <TouchableOpacity onPress={resetSignup} style={{ padding: 16 }} accessibilityRole="button" accessibilityLabel="Back to login">
        <Ionicons name="arrow-back" size={22} color={C.text} />
      </TouchableOpacity>
    </SafeAreaView>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Hero */}
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <SkillomateLogo size="lg" />
          <Text style={{ color: C.text, fontSize: 26, fontWeight: "900", marginTop: 20, textAlign: "center" }}>Join the AI Revolution</Text>
          <Text style={{ color: C.textSub, fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 20 }}>Learn the skills that turn AI into income.</Text>
        </View>

        <StepBar current={1} />
        <Text style={[s.authTitle, { color: C.text }]}>Verify Your Mobile</Text>
        <Text style={[s.authSub, { color: C.textSub }]}>Step 1 of 2 — We'll send you an OTP</Text>

        <FieldInput
          label="Phone Number"
          placeholder="Enter 10-digit number"
          value={mobile} onChangeText={t => setMobile(t.replace(/[^0-9]/g, ""))}
          keyboardType="phone-pad" editable={!otpSent} maxLength={10}
        />

        {otpSent && (
          <>
            <Text style={s.fieldLabel}>Mobile OTP</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Enter 6-digit code"
                placeholderTextColor={C.textMuted}
                value={otp} onChangeText={setOtp}
                keyboardType="number-pad" maxLength={6}
              />
              <TouchableOpacity style={s.otpResendBtn}
                onPress={() => { setOtpSent(false); setOtp(""); setSignupError(""); }}>
                <Text style={s.otpResendText}>Resend</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!!signupError && <Text style={s.errorText}>{signupError}</Text>}
        {!otpSent
          ? <PrimaryBtn title="Send OTP" onPress={sendOtp} loading={otpLoading} />
          : <PrimaryBtn title="Verify Phone" onPress={verifyOtp} loading={otpLoading} />
        }

        <Text style={[s.termsText, { marginTop: 20 }]}>By joining, you agree to Skillomate policies.</Text>
        <View style={s.legalLinksRow}>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openAppLink(TERMS_URL, "Terms of Service")}
            accessibilityRole="link"
            accessibilityLabel="Read Terms of Service"
          >
            <Text style={s.legalLinkText}>Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openAppLink(PRIVACY_URL, "Privacy Policy")}
            accessibilityRole="link"
            accessibilityLabel="Read Privacy Policy"
          >
            <Text style={s.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={resetSignup} style={s.authLink}>
          <Text style={{ color: C.textSub, fontSize: 14 }}>
            Already have an account?{"  "}
            <Text style={{ color: C.primary, fontWeight: "700" }}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
      );
    }

    if (screen === "signup2") {
      return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
    <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
    <SafeAreaView>
      <TouchableOpacity
        onPress={() => { setScreen("signup1"); setSignupError(""); }}
        style={{ padding: 16 }}
        accessibilityRole="button"
        accessibilityLabel="Back to phone verification"
      >
        <Ionicons name="arrow-back" size={22} color={C.text} />
      </TouchableOpacity>
    </SafeAreaView>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <SkillomateLogo size="lg" />
          <Text style={{ color: C.primary, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>Step 2 of 2 — Profile Setup</Text>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: "900", marginTop: 12, textAlign: "center" }}>Tell us about yourself</Text>
          <Text style={{ color: C.textSub, fontSize: 13, marginTop: 6, textAlign: "center" }}>Customize your learning experience with AI-driven personalization.</Text>
        </View>

        <StepBar current={2} />

        {/* Avatar picker */}
        <Text style={[s.fieldLabel, { textAlign: "center", fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: C.textMuted, marginBottom: 12 }]}>SELECT AVATAR</Text>
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50, overflow: "hidden",
            borderWidth: 3, borderColor: C.primary,
            shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
          }}>
            <AvatarImage avatarId={signupAvatar} size={100} style={{ borderRadius: 50 }} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingBottom: 4, marginBottom: 24 }}
          nestedScrollEnabled
        >
          {DEMO_AVATARS.map(av => (
            <TouchableOpacity
              key={av.id}
              onPress={() => setSignupAvatar(av.id)}
              style={[s.avatarPickerItem, signupAvatar === av.id && s.avatarPickerItemActive]}
              accessibilityRole="radio"
              accessibilityLabel={av.label}
              accessibilityState={{ selected: signupAvatar === av.id }}
            >
              <AvatarImage avatarId={av.id} size={56} style={{ borderRadius: 28 }} />
              {signupAvatar === av.id && (
                <View style={s.avatarPickerCheck}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FieldInput label="FIRST NAME" placeholder="e.g. Alex"
          value={signupFullName} onChangeText={setSignupFullName} />
        <FieldInput label="EMAIL (OPTIONAL)" placeholder="e.g. alex@email.com"
          value={signupEmail} onChangeText={setSignupEmail}
          autoCapitalize="none" keyboardType="email-address" />
        <FieldInput label="PASSWORD" placeholder="At least 8 characters"
          value={signupPassword} onChangeText={setSignupPassword} secureTextEntry />

        <Text style={[s.fieldLabel, { letterSpacing: 1, textTransform: "uppercase", fontSize: 12, color: C.textMuted }]}>GENDER IDENTITY</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          {["Male", "Female", "Other"].map(g => (
            <TouchableOpacity
              key={g}
              onPress={() => setSignupGender(g)}
              style={[s.genderOption, signupGender === g && s.genderOptionActive]}
              accessibilityRole="radio"
              accessibilityLabel={`${g} gender identity`}
              accessibilityState={{ selected: signupGender === g }}
            >
              <Text style={[s.genderOptionText, signupGender === g && s.genderOptionTextActive]}>{g.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.fieldLabel, { letterSpacing: 1, textTransform: "uppercase", fontSize: 12, color: C.textMuted }]}>YOUR AGE</Text>
        <AgePicker value={signupAge} onChange={setSignupAge} />

        {!!signupError && <Text style={s.errorText}>{signupError}</Text>}

        <TouchableOpacity
          onPress={register} disabled={signupLoading}
          style={{
            backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16,
            alignItems: "center", marginTop: 4, marginBottom: 16,
            shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 }, elevation: 6,
            opacity: signupLoading ? 0.6 : 1,
          }}
        >
          {signupLoading
            ? <ActivityIndicator color={C.bg} />
            : <Text style={{ color: C.bg, fontWeight: "900", fontSize: 16 }}>Complete My Profile</Text>
          }
        </TouchableOpacity>

        <Text style={s.termsText}>By continuing, you agree to Skillomate policies.</Text>
        <View style={s.legalLinksRow}>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openAppLink(TERMS_URL, "Terms of Service")}
            accessibilityRole="link"
            accessibilityLabel="Read Terms of Service"
          >
            <Text style={s.legalLinkText}>Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openAppLink(PRIVACY_URL, "Privacy Policy")}
            accessibilityRole="link"
            accessibilityLabel="Read Privacy Policy"
          >
            <Text style={s.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={resetSignup} style={s.authLink}>
          <Text style={{ color: C.textSub, fontSize: 14 }}>
            Already have an account?{"  "}
            <Text style={{ color: C.primary, fontWeight: "700" }}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
      );
    }

    // Login
    return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
    <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Hero Section */}
        <View style={{
          backgroundColor: C.white, paddingTop: 60, paddingBottom: 36, paddingHorizontal: 24,
          alignItems: "center",
          borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
        }}>
          <SkillomateLogo size="lg" />
          <Text style={{ color: C.primary, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>LEARN · GROW · EARN</Text>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: "900", marginTop: 20, textAlign: "center", lineHeight: 36 }}>Welcome Back</Text>
          <Text style={{ color: C.textSub, fontSize: 14, marginTop: 6, textAlign: "center" }}>Your path to AI mastery continues.</Text>
        </View>

        {/* Form */}
        <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 }}>
          <FieldInput
            label="Email or Phone"
            placeholder="Enter your email or phone"
            value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address"
          />
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>PASSWORD</Text>
              <TouchableOpacity
                onPress={openPasswordReset}
                accessibilityRole="button"
                accessibilityLabel="Reset forgotten password"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: "700" }}>FORGOT?</Text>
              </TouchableOpacity>
            </View>
          </View>
          <FieldInput
            placeholder="••••••••"
            value={password} onChangeText={setPassword}
            secureTextEntry
          />

          {!!loginError && <Text style={s.errorText}>{loginError}</Text>}

          <TouchableOpacity
            onPress={login} disabled={loginLoading}
            style={{
              backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16,
              alignItems: "center", marginTop: 8, marginBottom: 20,
              shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 }, elevation: 6,
              opacity: loginLoading ? 0.6 : 1,
            }}
          >
            {loginLoading
              ? <ActivityIndicator color={C.bg} />
              : <Text style={{ color: C.bg, fontWeight: "900", fontSize: 16, letterSpacing: 0.5 }}>Log In</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600", marginHorizontal: 12 }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          </View>

          <TouchableOpacity onPress={() => { setScreen("signup1"); setSignupError(""); }} style={s.authLink}>
            <Text style={{ color: C.textSub, fontSize: 14 }}>
              New to Skillomate?{"  "}
              <Text style={{ color: C.primary, fontWeight: "800" }}>Create an Account</Text>
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 28 }}>
            <Ionicons name="shield-checkmark" size={12} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.8 }}>SKILLOMATE SECURE</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <PasswordResetModal
      visible={resetVisible}
      step={resetStep}
      mobile={resetMobile}
      onMobileChange={setResetMobile}
      otp={resetOtp}
      onOtpChange={setResetOtp}
      newPassword={resetNewPassword}
      onNewPasswordChange={setResetNewPassword}
      confirmPassword={resetConfirmPassword}
      onConfirmPasswordChange={setResetConfirmPassword}
      error={resetError}
      loading={resetLoading}
      onRequest={requestPasswordReset}
      onConfirm={confirmPasswordReset}
      onChangeMobile={() => { setResetStep("request"); setResetOtp(""); setResetError(""); }}
      onClose={closePasswordReset}
    />
  </View>
    );
  }

  // ── Logged-in ───────────────────────────────────────────────────────────────
  if (courseAiTarget) {
    return (
      <AiAssistantScreen
        mode="course"
        fixedCourse={courseAiTarget}
        user={user}
        onBack={() => setCourseAiTarget(null)}
      />
    );
  }

  if (mainScreen === "courses" && selectedCourse && startIndex !== null) {
    return (
      <View style={{ flex: 1 }}>
        <ReelsScreen
          courseId={selectedCourse._id}
          initialIndex={startIndex}
          initialTime={initialTime}
          downloads={downloads}
          preloadedVideos={preloadedVideos || (DEV_UI_QA_ENABLED ? selectedCourse.videos : null)}
          user={user}
          onVideoComplete={isPreviewOnly ? undefined : markVideoComplete}
          onVideoProgress={isPreviewOnly ? undefined : saveVideoProgress}
          onBack={() => {
            if (isPreviewOnly) {
              setSelectedCourse(null);
              setStartIndex(null);
              setInitialTime(0);
              setPreloadedVideos(null);
              setIsPreviewOnly(false);
              setMainScreen("home");
              return;
            }
            loadCourseProgress();
            setStartIndex(null);
            setInitialTime(0);
            setPreloadedVideos(null);
          }}
        />
        <CertificateModal cert={certModal} onClose={() => setCertModal(null)} />
      </View>
    );
  }

  if (mainScreen === "courses" && selectedCourse) {
    return (
      <VideoListScreen
        course={selectedCourse}
        onSelectVideo={idx => setStartIndex(idx)}
        onBack={() => { loadCourseProgress(); setSelectedCourse(null); }}
        onOpenCourseAi={course => setCourseAiTarget(course)}
        downloads={downloads}
        onDownload={(video, courseId, courseTitle) => startDownload(video, courseId, courseTitle)}
        onDeleteDownload={deleteDownload}
        hasAccess={hasCourseAccess(user)}
      />
    );
  }

  if (mainScreen === "courses") {
    return (
      <>
        <CourseListScreen
          onSelect={c => openCourse(c)}
          user={user}
          courseProgress={courseProgress}
          onRefreshProgress={loadCourseProgress}
          wishlist={wishlist}
          onToggleWishlist={toggleWishlist}
          onGoToHome={() => { setSelectedCourse(null); loadCourseProgress(); setMainScreen("home"); }}
          onGoToAI={() => setMainScreen("ai")}
          onGoToDownloads={() => { const ok = hasCourseAccess(user); if (!ok) { setShowAppUpgrade(true); } else { setMainScreen("downloads"); } }}
          onGoToProfile={() => setMainScreen("profile")}
          aiRobotId={aiRobotId}
        />
        <UpgradeModal visible={showAppUpgrade} onClose={() => setShowAppUpgrade(false)} />
      </>
    );
  }

  if (mainScreen === "certificates") {
    return (
      <CertificatesScreen
        certificates={certificates}
        onBack={() => setMainScreen("profile")}
      />
    );
  }

  if (mainScreen === "subscription") {
    return (
      <SubscriptionDetailsScreen
        user={user}
        onBack={() => setMainScreen("profile")}
      />
    );
  }

  if (mainScreen === "wishlist") {
    return (
      <WishlistScreen
        wishlist={wishlist}
        onToggleWishlist={toggleWishlist}
        onSelect={c => openCourse(c)}
        onBack={() => setMainScreen("profile")}
        user={user}
      />
    );
  }

  if (mainScreen === "profile") {
    return (
      <>
        <ProfileScreen
          user={user}
          onLogout={handleLogout}
          wishlistCount={wishlist.length}
          certificatesCount={certificates.length}
          onGoToWishlist={() => setMainScreen("wishlist")}
          onGoToCertificates={() => setMainScreen("certificates")}
          onGoToSubscription={() => setMainScreen("subscription")}
          onGoToHome={() => setMainScreen("home")}
          onGoToCourses={() => setMainScreen("courses")}
          onGoToAI={() => setMainScreen("ai")}
          onGoToDownloads={() => { const ok = hasCourseAccess(user); if (!ok) { setShowAppUpgrade(true); } else { setMainScreen("downloads"); } }}
          themeMode={themeMode}
          onThemeChange={changeTheme}
          onAvatarChange={avatarId => {
            setUser(prev => {
              if (!prev) return prev;
              const updated = { ...prev, avatar: avatarId };
              AsyncStorage.setItem("user", JSON.stringify(updated)).catch(() => {});
              return updated;
            });
          }}
          aiRobotId={aiRobotId}
        />
        <UpgradeModal visible={showAppUpgrade} onClose={() => setShowAppUpgrade(false)} />
      </>
    );
  }

  if (mainScreen === "downloads") {
    const downloadItems = Object.values(downloads).filter(d => d.bunnyGuid);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={s.pageHeader}>
            <Text style={[s.pageTitle, { marginLeft: 0, textAlign: "center" }]}>Downloads</Text>
          </View>
        </SafeAreaView>

        {downloadItems.length === 0 ? (
          <View style={s.centered}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Ionicons name="download" size={34} color={C.primary} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 8 }}>No Downloads Yet</Text>
            <Text style={{ fontSize: 14, color: C.textSub, textAlign: "center", paddingHorizontal: 40 }}>
              Tap the download icon on any video to save it for offline viewing.
            </Text>
          </View>
        ) : (
          <FlatList
            data={downloadItems}
            keyExtractor={(item, i) => item.bunnyGuid || String(i)}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
            ListHeaderComponent={
              <Text style={{ color: C.textSub, fontSize: 13, marginBottom: 4 }}>
                {downloadItems.length} video{downloadItems.length !== 1 ? "s" : ""} in downloads
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.dlVideoRow}
                activeOpacity={0.85}
                onPress={() => {
                  if (item.status !== "done") return;
                  // Build a fake video object from download metadata — no internet needed
                  const fakeVideo = {
                    _id: item.videoId || item.bunnyGuid,
                    bunnyGuid: item.bunnyGuid,
                    bunnyLibraryId: item.bunnyLibraryId || "",
                    title: item.title,
                    order: 0,
                  };
                  const fakeCourseId = item.courseId && /^[a-f0-9]{24}$/i.test(item.courseId)
                    ? item.courseId : "000000000000000000000000";
                  setSelectedCourse({ _id: fakeCourseId, title: item.courseTitle || "Downloaded Video", videos: [fakeVideo] });
                  setPreloadedVideos([fakeVideo]);
                  setStartIndex(0);
                  setInitialTime(0);
                  setMainScreen("courses");
                }}
              >
                <View style={s.dlVideoThumb}>
                  <RemoteThumbnailImage
                    imageUrl={`${API_BASE}/api/bunny/thumbnail/${item.bunnyGuid}?libraryId=${encodeURIComponent(item.bunnyLibraryId || "")}`}
                    screen="Downloads thumbnail"
                    courseId={item.courseId}
                    borderRadius={10}
                  />
                  <View style={[StyleSheet.absoluteFill, { borderRadius: 10, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "700", fontSize: 14, marginBottom: 3 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={{ color: C.textSub, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>
                    {item.courseTitle}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons
                        name={item.status === "error" ? "alert-circle-outline" : item.status === "downloading" ? "time-outline" : "checkmark-circle"}
                        size={13}
                        color={C.primary}
                      />
                      <Text style={{ color: C.primary, fontSize: 11, fontWeight: "600" }}>
                        {item.status === "error" ? "Failed" : item.status === "downloading" ? `${Math.round((item.progress || 0) * 100)}%` : "Downloaded"}
                      </Text>
                    </View>
                    {item.status === "downloading" && (
                      <View style={[s.dlProgressBar, { flex: 1, minWidth: 60, marginTop: 0 }]}>
                        <View style={[s.dlProgressFill, { width: `${Math.round((item.progress || 0) * 100)}%` }]} />
                      </View>
                    )}
                    {item.size > 0 && (
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>
                        {item.size > 1024 * 1024 * 1024
                          ? `${(item.size / (1024 * 1024 * 1024)).toFixed(1)} GB`
                          : `${Math.round(item.size / (1024 * 1024))} MB`}
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                  onPress={event => {
                    event.stopPropagation?.();
                    Alert.alert("Delete Download", `Remove "${item.title}" from downloads?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteDownload(item.bunnyGuid) },
                    ]);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete downloaded video ${item.title}`}
                >
                  <Ionicons name="trash-outline" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}

        <BottomNav active="downloads"
          onHome={() => setMainScreen("home")}
          onCourses={() => setMainScreen("courses")}
          onAI={() => setMainScreen("ai")}
          onDownloads={() => {}}
          onProfile={() => setMainScreen("profile")}
          aiRobotId={aiRobotId}
        />
      </View>
    );
  }

  if (mainScreen === "ai") {
    return (
      <>
        <AiAssistantScreen
          user={user}
          onGoToHome={() => setMainScreen("home")}
          onGoToCourses={() => setMainScreen("courses")}
          onGoToDownloads={() => { const ok = hasCourseAccess(user); if (!ok) { setShowAppUpgrade(true); } else { setMainScreen("downloads"); } }}
          onGoToProfile={() => setMainScreen("profile")}
          onRobotChange={id => setAiRobotId(id)}
        />
        <UpgradeModal visible={showAppUpgrade} onClose={() => setShowAppUpgrade(false)} />
      </>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <HomeScreen
        user={user}
        onGoToCourses={() => setMainScreen("courses")}
        onGoToAI={() => setMainScreen("ai")}
        onGoToDownloads={() => { const ok = hasCourseAccess(user); if (!ok) { setShowAppUpgrade(true); } else { setMainScreen("downloads"); } }}
        onGoToProfile={() => setMainScreen("profile")}
        onGoToSubscription={() => setMainScreen("subscription")}
        onSelectCourse={course => openCourse(course)}
        onResumeCourse={(course, idx, secs) => {
          openCourse(course, { startIndex: idx, initialTime: secs });
        }}
        onOpenHeroPreview={openHeroPreview}
        courseProgress={courseProgress}
        aiRobotId={aiRobotId}
      />
      <CertificateModal cert={certModal} onClose={() => setCertModal(null)} />
      <UpgradeModal visible={showAppUpgrade} onClose={() => setShowAppUpgrade(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C) {
return StyleSheet.create({
  // Logo
  logoBox: {
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.accentSoft,
  },
  logoText: { ...TYPE.title, color: C.text },

  // Step
  stepDot: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },

  // Auth
  authTagline: { ...TYPE.label, color: C.textSub, marginTop: 6, textTransform: "uppercase" },
  authTitle: { ...TYPE.h1, color: C.text, marginBottom: 6 },
  authSub: { ...TYPE.body, color: C.textSub, marginBottom: SPACE.xl },
  fieldLabel: { ...TYPE.label, color: C.text, marginBottom: 6, textTransform: "uppercase" },
  input: {
    ...TYPE.bodyMedium,
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 13,
    minHeight: 48, borderWidth: 1.2, borderColor: C.border, color: C.text,
  },
  btn: {
    minHeight: 48,
    borderRadius: RADIUS.sm, paddingVertical: 14, paddingHorizontal: 16,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  btnFill: { backgroundColor: C.primary },
  btnOutline: { borderWidth: 1.2, borderColor: C.borderStrong, backgroundColor: C.surface },
  btnText: { ...TYPE.button, color: C.isDark ? "#151515" : "#FFFFFF" },
  errorText: { color: C.danger, fontSize: 13, marginBottom: 10 },
  avatarPickerItem: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "transparent",
    overflow: "hidden",
  },
  avatarPickerItemActive: { borderColor: C.primary, transform: [{ scale: 1.1 }] },
  avatarPickerCheck: {
    position: "absolute", bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  genderOption: {
    flex: 1, minHeight: 44, paddingVertical: 11, borderRadius: RADIUS.sm,
    borderWidth: 1.2, borderColor: C.border,
    alignItems: "center", backgroundColor: C.surface,
  },
  genderOptionActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  genderOptionText: { fontSize: 14, fontWeight: "600", color: C.textSub },
  genderOptionTextActive: { color: C.primary },
  otpResendBtn: {
    backgroundColor: C.primaryLight, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.primary, paddingHorizontal: 14, minHeight: 48, justifyContent: "center",
  },
  otpResendText: { color: C.primary, fontWeight: "700", fontSize: 13 },
  termsText: { color: C.textMuted, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 },
  legalLinksRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 2 },
  legalLinkButton: { minHeight: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  legalLinkText: { color: C.primary, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  authLink: { alignItems: "center", marginTop: 20 },
  authLinkText: { color: C.textSub, fontSize: 14 },
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: 20, gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  orText: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: RADIUS.sm, borderWidth: 1.2, borderColor: C.border,
    minHeight: 48, paddingVertical: 13, backgroundColor: C.surface,
  },
  socialBtnText: { color: C.text, fontWeight: "600", fontSize: 14 },
  resetSheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === "ios" ? 38 : 24,
    borderWidth: 1, borderColor: C.border,
  },
  resetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 22 },
  resetTitle: { ...TYPE.h2, color: C.text, marginBottom: 5 },
  resetSubtitle: { ...TYPE.body, color: C.textSub, lineHeight: 20 },
  resetCloseButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },

  // Navigation
  pageHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
  },
  pageTitle: { flex: 1, ...TYPE.title, color: C.text, marginLeft: 8 },
  iconBtn: {
    minWidth: 44, minHeight: 44, padding: 8, borderRadius: RADIUS.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.isDark ? "rgba(255,255,255,0.06)" : C.accentSoft,
  },
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    zIndex: 50,
    elevation: 20,
    flexDirection: "row", backgroundColor: C.isDark ? "rgba(17,17,17,0.96)" : "rgba(255,253,248,0.96)",
    borderTopWidth: 1, borderTopColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    paddingBottom: Platform.OS === "ios" ? 20 : 8, paddingTop: 8,
  },
  bottomTab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 2 },
  bottomTabIcon: { padding: 4, borderRadius: 8 },
  bottomTabIconActive: { backgroundColor: "transparent" },
  bottomTabLabel: { ...TYPE.caption, width: "100%", textAlign: "center", fontSize: 10.5, lineHeight: 14, color: C.slateGray },
  bottomTabAI: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    marginTop: -16,
    shadowColor: C.primary, shadowOpacity: C.isDark ? 0.35 : 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  bottomTabAIActive: { backgroundColor: C.primary },

  // Home
  streamingHeader: {
    backgroundColor: C.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  streamingHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xs,
  },
  streamingBrand: {
    ...TYPE.title,
    color: C.text,
    fontSize: 18,
  },
  streamingTagline: {
    ...TYPE.caption,
    color: C.textSub,
    marginTop: 2,
  },
  streamingIconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    position: "relative",
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.primary,
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  discoveryTabs: {
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.sm,
    gap: SPACE.xs,
  },
  discoveryTab: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  discoveryTabActive: {
    backgroundColor: C.panel,
  },
  discoveryTabText: {
    ...TYPE.caption,
    color: C.textSub,
    fontWeight: "800",
  },
  discoveryTabTextActive: {
    color: C.text,
  },
  streamingHero: {
    minHeight: 318,
    marginHorizontal: SPACE.md,
    marginTop: SPACE.xs,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surface,
    borderWidth: 0,
    ...ELEVATION.soft,
  },
  streamingHeroImage: {
    height: 136,
    backgroundColor: C.surfaceWarm,
    overflow: "hidden",
  },
  artworkFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    padding: SPACE.sm,
    backgroundColor: C.surfaceWarm,
  },
  artworkFallbackText: {
    ...TYPE.caption,
    color: C.text,
    fontWeight: "700",
    marginTop: SPACE.xs,
  },
  streamingHeroPhotoWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,253,248,0.08)",
  },
  streamingHeroContent: {
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    paddingTop: SPACE.sm,
    backgroundColor: C.surface,
  },
  heroKicker: {
    ...TYPE.label,
    color: C.primary,
    marginBottom: SPACE.xs,
  },
  streamingHeroTitle: {
    ...TYPE.display,
    color: C.text,
    fontSize: 24,
    lineHeight: 29,
    marginBottom: SPACE.xs,
  },
  streamingHeroSub: {
    ...TYPE.bodyMedium,
    color: C.textSub,
    marginBottom: SPACE.sm,
  },
  streamingHeroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  startLearningBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    backgroundColor: C.primary,
    flexGrow: 1,
    flexShrink: 1,
  },
  startLearningText: {
    ...TYPE.button,
    color: C.text,
  },
  myListHeroBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
    flexShrink: 0,
  },
  myListHeroText: {
    ...TYPE.button,
    color: C.text,
  },
  trialBadge: {
    position: "absolute",
    top: SPACE.md,
    right: SPACE.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.xs,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.primary,
  },
  trialBadgeText: {
    ...TYPE.label,
    color: C.primary,
    fontSize: 10,
  },
  heroDots: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 6,
    marginTop: SPACE.xs,
    marginBottom: SPACE.xs,
  },
  homeScrollContent: {
    paddingBottom: 116,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.borderStrong,
  },
  heroDotActive: {
    width: 18,
    backgroundColor: C.primary,
  },
  streamingSection: {
    marginTop: SPACE.lg,
  },
  firstStreamingSection: {
    marginTop: SPACE.md,
  },
  streamingSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    gap: SPACE.md,
  },
  streamingSectionTitle: {
    flex: 1,
    ...TYPE.h3,
    color: C.text,
  },
  streamingSeeAll: {
    ...TYPE.caption,
    color: C.primary,
    fontWeight: "800",
  },
  railContent: {
    paddingHorizontal: SPACE.md,
    paddingRight: SPACE.xl,
    gap: SPACE.sm,
  },
  learningCard: {
    width: 214,
    backgroundColor: "transparent",
    borderRadius: RADIUS.lg,
  },
  learningThumb: {
    height: 116,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surfaceWarm,
    marginBottom: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  learningPlay: {
    position: "absolute",
    left: SPACE.sm,
    bottom: SPACE.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,23,23,0.82)",
  },
  learningTitle: {
    ...TYPE.bodyMedium,
    color: C.text,
    fontWeight: "700",
  },
  learningLesson: {
    ...TYPE.caption,
    color: C.textSub,
    marginTop: 2,
  },
  learningProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: C.border,
    marginHorizontal: 2,
    marginTop: SPACE.sm,
  },
  learningProgressFill: {
    height: "100%",
    backgroundColor: C.primary,
  },
  learningPct: {
    ...TYPE.caption,
    color: C.textMuted,
    marginTop: 6,
    paddingBottom: 2,
  },
  rankRailContent: {
    paddingHorizontal: SPACE.md,
    paddingRight: SPACE.xl,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.xs,
    gap: SPACE.sm,
  },
  rankItem: {
    width: 158,
    height: 194,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rankNumber: {
    position: "absolute",
    left: 0,
    bottom: -10,
    fontFamily: FONT.heading,
    fontSize: 124,
    lineHeight: 124,
    fontWeight: "900",
    color: "rgba(197,139,42,0.88)",
    textShadowColor: "rgba(255,253,248,0.96)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  rankPoster: {
    position: "absolute",
    right: 2,
    bottom: 0,
    width: 106,
    height: 158,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  posterCard: {
    width: 126,
  },
  posterThumb: {
    width: 126,
    height: 180,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  posterScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  posterTitle: {
    ...TYPE.caption,
    color: C.text,
    fontWeight: "800",
    marginTop: SPACE.xs,
  },
  trendingLandscapeCard: {
    width: 224,
  },
  trendingLandscapeThumb: {
    height: 126,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  goldLabel: {
    position: "absolute",
    left: SPACE.xs,
    top: SPACE.xs,
    borderRadius: RADIUS.xs,
    backgroundColor: C.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  goldLabelText: {
    ...TYPE.label,
    color: C.text,
    fontSize: 9,
  },
  newTag: {
    position: "absolute",
    left: SPACE.xs,
    top: SPACE.xs,
    borderRadius: RADIUS.xs,
    backgroundColor: C.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex: 2,
  },
  newTagText: {
    ...TYPE.label,
    color: C.text,
    fontSize: 9,
  },
  learnEarnBand: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACE.md,
    marginTop: SPACE.xl,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    gap: SPACE.md,
  },
  learnEarnKicker: {
    ...TYPE.label,
    color: C.primary,
    marginBottom: 4,
  },
  learnEarnTitle: {
    ...TYPE.h2,
    color: C.text,
  },
  learnEarnText: {
    ...TYPE.caption,
    color: C.textSub,
    marginTop: 4,
  },
  learnEarnBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
  },
  myListPoster: {
    width: 126,
    height: 180,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: C.surfaceWarm,
    borderWidth: 1,
    borderColor: C.border,
  },
  bookmarkMark: {
    position: "absolute",
    top: SPACE.xs,
    right: SPACE.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,23,23,0.72)",
  },
  myListTitle: {
    position: "absolute",
    left: SPACE.xs,
    right: SPACE.xs,
    bottom: SPACE.xs,
    ...TYPE.caption,
    color: "#FFFFFF",
    fontWeight: "900",
  },
  nexPromptBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    marginHorizontal: SPACE.md,
    marginTop: SPACE.xl,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  nexPromptIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
  },
  nexPromptTitle: {
    ...TYPE.bodyMedium,
    color: C.text,
    fontWeight: "900",
  },
  nexPromptText: {
    ...TYPE.caption,
    color: C.textSub,
    marginTop: 2,
  },
  homeTopBar: {
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.isDark ? "rgba(255,255,255,0.06)" : C.border,
  },
  homeTopBarInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.primary,
    overflow: "hidden",
  },
  avatarBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  hero: {
    minHeight: 252, marginHorizontal: 16, marginTop: 18,
    borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: C.cardBg,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.24)",
    borderRadius: RADIUS.lg,
  },
  heroContent: {
    flex: 1, justifyContent: "flex-end", padding: 16, paddingTop: 64,
    backgroundColor: "rgba(0,0,0,0.20)",
  },
  heroChip: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: C.primary, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8,
  },
  heroChipText: { color: C.bg, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  heroEyebrow: {
    color: C.primary, fontSize: 12, fontWeight: "700",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 10,
  },
  heroTitle: { ...TYPE.h1, color: "#fff", marginBottom: 6 },
  heroSub: { ...TYPE.body, color: "rgba(255,255,255,0.82)", marginBottom: 16 },
  heroActionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  heroBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.primary, borderRadius: RADIUS.sm,
    minHeight: 44, paddingVertical: 11, paddingHorizontal: 17, alignSelf: "flex-start",
  },
  heroBtnText: { ...TYPE.button, color: C.isDark ? "#151515" : "#FFFFFF" },
  heroGhostBtn: {
    width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
  },
  heroProgressTrack: { height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  heroProgressFill: { height: "100%", borderRadius: 3, backgroundColor: C.primary },
  statsRow: { flexDirection: "row", marginTop: 24, gap: 0 },
  statItem: { flex: 1, borderRightWidth: 1, borderRightColor: C.border, paddingRight: 0, alignItems: "center" },
  statNum: { color: C.isDark ? C.text : C.deepBlue, fontWeight: "800", fontSize: 18 },
  statLabel: { color: C.slateGray, fontSize: 10, marginTop: 2, textAlign: "center" },

  // Cards
  card: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg,
    padding: 16, flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.hairline,
  },
  welcomeTitle: { ...TYPE.title, color: C.text },
  welcomeSub: { ...TYPE.caption, color: C.textSub, marginTop: 3 },
  welcomeIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center",
  },

  // Sections
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 12,
  },
  sectionTitle: { ...TYPE.h3, color: C.text },
  seeAll: { ...TYPE.caption, color: C.primary, fontWeight: "800" },
  skillCard: {
    width: 188, borderRadius: RADIUS.lg, padding: 14,
    backgroundColor: C.isDark ? "rgba(26,33,35,0.82)" : C.cardBg,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
  },
  skillIcon: {
    width: 46, height: 46, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: C.primaryLight,
    marginBottom: 12,
  },
  skillTitle: { ...TYPE.title, color: C.text, marginBottom: 5 },
  skillIncome: { ...TYPE.h2, color: C.softBlue, marginBottom: 6 },
  skillMeta: { ...TYPE.caption, color: C.textSub, fontWeight: "800", textTransform: "uppercase" },

  // Trending Now cards
  trendingCard: {
    width: 160, height: 270, borderRadius: 18, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  trendingGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 150,
    flexDirection: "column",
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    overflow: "hidden",
  },
  trendingBadge: {
    position: "absolute", top: 12, left: 12,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  trendingBadgeText: {
    color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
  },
  trendingLock: {
    position: "absolute", top: 12, right: 12,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10, padding: 5,
  },
  trendingInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 12,
  },
  trendingTitle: {
    color: "#fff", fontSize: 15, fontWeight: "800", lineHeight: 20, marginBottom: 6,
  },
  trendingMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  trendingMetaChip: {
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    color: "#fff", fontSize: 10, fontWeight: "700",
  },
  trendingMetaText: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "500" },

  // Continue watching
  continueCard: {
    width: 270, backgroundColor: C.cardBg, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border, overflow: "hidden",
    ...ELEVATION.soft,
  },
  continueThumb: { height: 120, backgroundColor: C.lightGray, overflow: "hidden" },
  continueThumbText: { color: "rgba(255,255,255,0.42)", fontWeight: "900", fontSize: 56 },
  continuePlay: {
    position: "absolute", left: 12, bottom: 12,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.62)", alignItems: "center", justifyContent: "center",
  },
  continueInfo: { padding: 12 },
  continueTitle: { ...TYPE.bodyMedium, color: C.text, fontWeight: "800", marginBottom: 10 },
  continueProgressRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6,
  },
  continueProgressText: { color: C.textSub, fontSize: 11, fontWeight: "700" },
  continueProgressTrack: { height: 5, backgroundColor: C.isDark ? "rgba(255,255,255,0.12)" : C.border, borderRadius: 3, overflow: "hidden" },
  continueProgressFill: { height: "100%", backgroundColor: C.primary, borderRadius: 3 },

  wishlistBtn: {
    position: "absolute", top: 8, right: 8,
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 22,
  },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontSize: 10, fontWeight: "700" },

  // CTA
  ctaBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.deepBlue, margin: 16, borderRadius: RADIUS.xl, padding: 20,
  },
  ctaTitle: { ...TYPE.h2, color: C.isDark ? "#151515" : "#FFFFFF" },
  ctaIllustration: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
  },
  mentorBanner: {
    marginHorizontal: 16, marginTop: 22, borderRadius: RADIUS.lg, padding: 18,
    backgroundColor: C.isDark ? "#242B2E" : C.cardBg,
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.soft,
  },
  mentorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  mentorTitle: { color: C.text, fontSize: 17, fontWeight: "900" },
  mentorPrompt: {
    color: C.text, fontSize: 15, lineHeight: 22, padding: 14, borderRadius: 10,
    backgroundColor: C.isDark ? "rgba(8,15,18,0.5)" : C.lightGray,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.06)" : C.border,
    marginBottom: 12,
  },
  mentorCta: { color: C.primary, fontSize: 14, fontWeight: "900", textAlign: "center" },

  // Course list
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.surface, borderRadius: RADIUS.lg, marginHorizontal: 16, marginVertical: 12,
    minHeight: 52, paddingLeft: 14, paddingRight: 4, paddingVertical: 4,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
  },
  searchInput: { flex: 1, minHeight: 44, ...TYPE.body, color: C.text },
  searchClearButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
courseListCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, overflow: "hidden",
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.hairline,
    height: 160,
  },
  courseListThumb: {
    flex: 1, alignItems: "center", justifyContent: "center",
  },
  courseListThumbText: { color: "#fff", fontWeight: "900", fontSize: 22 },

  // CourseList vertical cards
  clCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, overflow: "hidden",
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    ...ELEVATION.soft,
  },
  clThumb: {
    width: "100%", height: 205, backgroundColor: C.lightGray,
  },
  clPremiumBadge: {
    position: "absolute", top: 12, left: 12,
    backgroundColor: C.accent, borderRadius: RADIUS.xs,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  clPremiumText: { ...TYPE.caption, color: C.isDark ? "#151515" : "#FFFFFF", fontSize: 10, fontWeight: "800" },
  clWishlistBtn: {
    position: "absolute", bottom: 12, right: 12,
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 22,
  },
  clLock: {
    position: "absolute", bottom: 12, left: 12,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10, padding: 5,
  },
  clInfo: { padding: 14, paddingTop: 12 },
  clTitle: { ...TYPE.title, color: C.text, marginBottom: 8 },
  clRatingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  clRating: { fontSize: 13, fontWeight: "700", color: C.text },
  clDot: { fontSize: 13, color: C.textMuted },
  clLectures: { fontSize: 13, color: C.textMuted },
  clProgressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  clProgressLabel: { fontSize: 12, color: C.textMuted, fontWeight: "500" },
  clProgressPct: { fontSize: 12, color: C.primary, fontWeight: "700" },
  clProgressTrack: {
    height: 5, backgroundColor: C.border, borderRadius: 3, overflow: "hidden",
  },
  clProgressFill: {
    height: "100%", backgroundColor: C.primary, borderRadius: 3,
  },

  // Video list
  videoRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, padding: 12,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    ...ELEVATION.hairline,
  },
  courseDescriptionCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    ...ELEVATION.hairline,
  },
  courseDescriptionTitle: { ...TYPE.title, color: C.text, marginBottom: 7 },
  courseDescriptionText: { ...TYPE.body, color: C.textSub },
  courseNotesOverlay: {
    flex: 1,
    backgroundColor: "rgba(43,33,26,0.24)",
    justifyContent: "flex-end",
  },
  courseNotesSheet: {
    maxHeight: "78%",
    backgroundColor: C.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingTop: 10,
  },
  courseNotesHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  courseNotesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  courseNotesTitle: { flex: 1, ...TYPE.title, color: C.textStrong, fontWeight: "900" },
  courseNotesSubtitle: { ...TYPE.caption, color: C.textMuted, marginTop: 2 },
  courseNotesClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceWarm,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  courseNotesScroll: { flexGrow: 0 },
  courseNotesContent: { padding: 18, paddingBottom: 32, gap: 14 },
  courseNotesBlock: {
    backgroundColor: C.surfaceWarm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.xl,
    padding: 14,
  },
  courseNotesBlockHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  courseNotesBlockTitle: { ...TYPE.bodyMedium, color: C.text, fontWeight: "900" },
  courseNotesBody: { ...TYPE.body, color: C.textSub },
  coursePromptRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  coursePromptIndex: { width: 26, ...TYPE.caption, color: C.primary, fontWeight: "900" },
  coursePromptText: { flex: 1, ...TYPE.body, color: C.text },
  courseResourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  courseResourceTitle: { flex: 1, ...TYPE.bodyMedium, color: C.text },
  videoRowTitle: { flex: 1, ...TYPE.bodyMedium, color: C.text },
  videoThumbSmall: {
    width: 90, height: 56, borderRadius: 8, overflow: "hidden",
    backgroundColor: C.lightGray,
  },
  videoThumbPlay: {
    position: "absolute", bottom: 5, right: 5,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10,
    width: 20, height: 20, alignItems: "center", justifyContent: "center",
  },
  videoDurationBadge: {
    position: "absolute", left: 5, top: 5,
    backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  videoDurationText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  downloadedBadge: {
    position: "absolute", right: 5, top: 5,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 8, padding: 2,
  },
  offlineBadge: {
    position: "absolute", top: 12, left: 12,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  offlineBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dlVideoRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.cardBg, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: C.border,
  },
  dlVideoThumb: {
    width: 90, height: 64, borderRadius: 10,
    backgroundColor: C.lightGray, overflow: "hidden",
  },
  dlProgressBar: {
    height: 3, borderRadius: 2, backgroundColor: C.border, marginTop: 5, overflow: "hidden",
  },
  dlProgressFill: { height: 3, borderRadius: 2, backgroundColor: C.primary },

  // Profile
  profileInfoCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border,
    marginBottom: 16, overflow: "hidden",
    ...ELEVATION.hairline,
  },
  profileInfoCardTitle: {
    ...TYPE.label, color: C.textMuted,
    textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  profileInfoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  profileInfoRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  profileInfoIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center",
  },
  profileInfoLabel: { fontSize: 11, color: C.textMuted, fontWeight: "600", marginBottom: 1 },
  profileInfoValue: { fontSize: 14, color: C.text, fontWeight: "600" },
  themeCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 16,
    ...ELEVATION.hairline,
  },
  themeCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  themeToggle: {
    flexDirection: "row", backgroundColor: C.lightGray, borderRadius: 10,
    padding: 4, borderWidth: 1, borderColor: C.border,
  },
  themeOption: {
    flex: 1, minHeight: 44, borderRadius: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  themeOptionActive: {
    backgroundColor: C.primary,
    shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  themeOptionText: { color: C.textSub, fontSize: 13, fontWeight: "700" },
  themeOptionTextActive: { color: "#fff" },
  profileAvatarLg: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  profileAvatarLgText: { color: "#fff", fontSize: 32, fontWeight: "900" },
  subBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 8 },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: C.border,
  },
  menuIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center",
  },
  menuLabel: { flex: 1, color: C.text, fontWeight: "600", fontSize: 14 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 12, padding: 15,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.3)",
  },
  logoutText: { color: C.danger, fontWeight: "700", fontSize: 15 },

  // AI Assistant
  aiHero: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 14, marginBottom: 10,
    padding: 14, borderRadius: RADIUS.lg,
    backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border,
    ...ELEVATION.hairline,
  },
  aiHeroIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  aiHeroTitle: { ...TYPE.title, color: C.text, marginBottom: 4 },
  aiHeroSub: { ...TYPE.caption, color: C.textSub, fontWeight: "600" },
  aiStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiStatusDot: { width: 8, height: 8, borderRadius: 4 },
  aiStatusOnline: { backgroundColor: C.success },
  aiStatusOffline: { backgroundColor: C.warning },
  aiMessages: {
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
  },
  aiMessageRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    marginBottom: 12,
  },
  aiMessageRowUser: { justifyContent: "flex-end" },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  aiBubble: {
    maxWidth: "82%", borderRadius: RADIUS.lg, borderBottomLeftRadius: 5,
    paddingHorizontal: 13, paddingVertical: 10,
    backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border,
  },
  aiBubbleUser: {
    backgroundColor: C.primary, borderColor: C.primary,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 5,
  },
  aiBubbleText: { ...TYPE.body, color: C.text },
  aiBubbleTextUser: { color: "#fff", fontWeight: "600" },
  aiSuggestions: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  aiSuggestion: {
    minHeight: 44, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.border,
  },
  aiSuggestionText: { color: C.primaryDark, fontSize: 12, fontWeight: "700" },
  aiComposer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 92 : 84,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
  },
  aiInput: {
    flex: 1, minHeight: 44, maxHeight: 104,
    color: C.text, backgroundColor: C.cardBg,
    borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg,
    paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10,
    ...TYPE.body,
  },
  aiSend: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  aiSendDisabled: { opacity: 0.45 },

  // Video Player
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  player: { width: "100%", flex: 1, backgroundColor: "#000" },
  reelsBackBtn: {
    position: "absolute", top: 52, left: 14,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8, zIndex: 20,
  },
  reelsTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  reelsTopBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
  },
  reelsAiBtn: {
    position: "absolute", right: 10, top: 110,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 19,
    backgroundColor: C.isDark ? "rgba(240,216,168,0.88)" : "rgba(23,23,23,0.86)",
    zIndex: 20,
  },
  reelsNotesBtn: {
    position: "absolute", right: 10, top: 164,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 19,
    backgroundColor: "rgba(23,23,23,0.78)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    zIndex: 20,
  },
  tapLeft:   { position: "absolute", left: 0,   top: 0, bottom: 50, width: "25%", zIndex: 5 },
  tapCenter: { position: "absolute", left: "25%", top: 0, bottom: 50, width: "50%", zIndex: 5 },
  tapRight:  { position: "absolute", right: 0,  top: 0, bottom: 50, width: "25%", zIndex: 5 },
  seekFlash: {
    position: "absolute", top: 0, bottom: 0, width: "42%", zIndex: 6,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
  },
  seekFlashLeft:  { left: 0, borderTopRightRadius: 80, borderBottomRightRadius: 80 },
  seekFlashRight: { right: 0, borderTopLeftRadius: 80, borderBottomLeftRadius: 80 },
  seekFlashText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  restartOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 4, alignItems: "center", justifyContent: "center" },
  playerAiButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  descriptionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" },
  descriptionSheet: {
    backgroundColor: "rgba(14,14,14,0.97)", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: "64%", paddingTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  descriptionHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", alignSelf: "center", marginBottom: 12 },
  descriptionHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  descriptionTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 21 },
  descriptionClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  descriptionScroll: { flexGrow: 0 },
  descriptionContent: { paddingHorizontal: 18, paddingBottom: 28, gap: 14 },
  descriptionBody: { color: "rgba(255,255,255,0.86)", fontSize: 14, lineHeight: 21 },
  lessonNotesSheet: {
    backgroundColor: "rgba(14,14,14,0.97)", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    height: "64%", paddingTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  lessonNotesSub: { color: "rgba(255,255,255,0.58)", fontSize: 12, marginTop: 3 },
  lessonNotesContent: { paddingHorizontal: 18, paddingBottom: 30, gap: 14 },
  lessonNotesBlock: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, padding: 14,
  },
  lessonNotesBlockHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  lessonNotesBlockTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  lessonNotesBody: { color: "rgba(255,255,255,0.84)", fontSize: 13, lineHeight: 20 },
  lessonPromptCard: {
    flexDirection: "row", gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  lessonPromptIndex: { width: 26, color: C.primary, fontSize: 12, fontWeight: "900" },
  lessonPromptText: { flex: 1, color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 20 },
  lessonResourceRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  lessonResourceTitle: { flex: 1, color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  courseAiOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.46)", justifyContent: "flex-end" },
  courseAiSheet: {
    height: "58%", backgroundColor: C.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  courseAiHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: "center", marginTop: 10, marginBottom: 10 },
  courseAiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  courseAiTitle: { color: C.text, fontSize: 16, fontWeight: "900" },
  courseAiSubtitle: { color: C.textSub, fontSize: 12, marginTop: 2, maxWidth: 260 },
  courseAiClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceWarm, alignItems: "center", justifyContent: "center" },
  courseAiMessages: { flex: 1 },
  courseAiContent: { padding: 16, paddingBottom: 20 },
  courseAiMessage: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  courseAiMessageUser: { justifyContent: "flex-end" },
  courseAiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  courseAiBubble: { flex: 1, backgroundColor: C.cardBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  courseAiBubbleUser: { flex: 0, maxWidth: "82%", backgroundColor: C.primary },
  courseAiBubbleText: { color: C.text, fontSize: 13, lineHeight: 19 },
  courseAiPrompt: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.border, backgroundColor: C.accentSoft, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  courseAiPromptText: { color: C.primaryDark, fontSize: 13, fontWeight: "700" },
  courseAiComposer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  courseAiInput: { flex: 1, minHeight: 40, maxHeight: 80, borderRadius: 20, backgroundColor: C.cardBg, color: C.text, paddingHorizontal: 14, fontSize: 14, borderWidth: 1, borderColor: C.border },
  courseAiSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  muteButton: {
    position: "absolute", bottom: 38, right: 10,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, zIndex: 10,
  },
  playPauseButton: {
    position: "absolute", bottom: 35, left: "50%", marginLeft: -21,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center", justifyContent: "center", zIndex: 12,
  },
  speedButton: {
    position: "absolute", bottom: 38, left: 10,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, zIndex: 10,
  },
  speedButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  speedPicker: {
    position: "absolute", bottom: 72, left: 10,
    backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 8, overflow: "hidden", zIndex: 20,
  },
  qualityPicker: {
    position: "absolute", bottom: 72, left: 70,
    backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 8, overflow: "hidden", zIndex: 20,
  },
  qualityButton: {
    position: "absolute", bottom: 38, left: 70,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, zIndex: 10,
  },
  speedOption: { paddingHorizontal: 20, paddingVertical: 10 },
  speedOptionActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  speedOptionText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  timeDisplay: { position: "absolute", bottom: 82, left: 0, right: 0, alignItems: "center", zIndex: 10 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  timeline: { position: "absolute", bottom: 10, left: 12, right: 12, height: 24, justifyContent: "center", zIndex: 10 },
  timelineTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 2, overflow: "hidden" },
  timelineFill:  { height: "100%", backgroundColor: C.primary, borderRadius: 2 },
  timelineThumb: { position: "absolute", top: "50%", width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff", marginTop: -7, marginLeft: -7 },
  playerControls: {
    ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 32, backgroundColor: "rgba(0,0,0,0.3)",
  },
  playerCtrlBtn: { padding: 10 },
  playerCtrlBtnMain: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  playerSeekBar: {
    position: "absolute", bottom: 20, left: 16, right: 16,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  playerTime: { color: "#fff", fontSize: 12, fontWeight: "600", minWidth: 36 },
  playerTrack: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2 },
  playerFill: { height: "100%", backgroundColor: C.primary, borderRadius: 2 },

  // Upgrade Modal
  upgradeOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end",
  },
  upgradeSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: "90%", overflow: "hidden",
  },
  upgradeClose: {
    position: "absolute", top: 14, right: 14, zIndex: 10,
    backgroundColor: C.surface, borderRadius: 16, padding: 6,
    borderWidth: 1, borderColor: C.border,
  },
  upgradeBanner: {
    height: 130, backgroundColor: C.accentSoft, flexDirection: "column", overflow: "hidden",
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  upgradeBannerBadge: {
    position: "absolute", top: 16, left: 16, zIndex: 2,
    backgroundColor: C.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  upgradeBannerBadgeText: {
    color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1,
  },
  upgradeBannerIcon: {
    position: "absolute", bottom: 16, right: 20, zIndex: 2,
  },
  upgradeTitle: {
    ...TYPE.h2, color: C.text, marginBottom: 6,
  },
  upgradeSub: {
    ...TYPE.body, color: C.textSub, marginBottom: 18,
  },
  upgradePricingCard: {
    backgroundColor: C.surfaceWarm, borderRadius: RADIUS.lg, padding: 16, marginBottom: 18,
    borderWidth: 1.5, borderColor: C.border,
  },
  upgradeBestValue: {
    alignSelf: "flex-end", backgroundColor: C.primary, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  upgradeBestValueText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  upgradeCurrency: { fontSize: 22, fontWeight: "800", color: C.text, marginBottom: 4 },
  upgradePrice: { fontSize: 52, fontWeight: "900", color: C.text, lineHeight: 58 },
  upgradePricePeriod: { fontSize: 15, fontWeight: "600", color: C.textSub, marginBottom: 4, paddingBottom: 6 },
  upgradePriceNote: { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  upgradeFeatureRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12,
  },
  upgradeFeatureText: { fontSize: 14, color: C.text, fontWeight: "500", flex: 1 },
  upgradeBtn: {
    backgroundColor: C.primary, borderRadius: RADIUS.sm, paddingVertical: 16,
    alignItems: "center", marginTop: 8, marginBottom: 14,
    ...ELEVATION.soft,
  },
  upgradeBtnText: { ...TYPE.button, color: C.isDark ? "#151515" : "#FFFFFF", fontSize: 17 },
  notificationOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    backgroundColor: "rgba(43,33,26,0.18)",
    paddingHorizontal: SPACE.md,
    paddingTop: Platform.OS === "android" ? 86 : 96,
  },
  notificationSheet: {
    alignSelf: "stretch",
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    ...ELEVATION.soft,
  },
  notificationHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginTop: SPACE.sm,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  notificationTitle: {
    ...TYPE.h3,
    color: C.text,
  },
  notificationSubtitle: {
    ...TYPE.caption,
    color: C.textMuted,
    marginTop: 2,
  },
  notificationClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceWarm,
    borderWidth: 1,
    borderColor: C.border,
  },
  notificationItem: {
    flexDirection: "row",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accentSoft,
  },
  notificationItemTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
  },
  notificationItemTitle: {
    flex: 1,
    ...TYPE.bodyMedium,
    color: C.text,
    fontWeight: "800",
  },
  notificationTime: {
    ...TYPE.caption,
    color: C.textMuted,
    fontSize: 11,
  },
  notificationBody: {
    ...TYPE.caption,
    color: C.textSub,
    marginTop: 3,
  },
  upgradeFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, marginBottom: 8,
  },
  upgradeFooterText: { color: C.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.8 },
});
}

let s = createStyles(C);
