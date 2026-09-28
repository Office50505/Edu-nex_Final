import { plainCourseDescription } from "./services/courseDescription";
import { chatKey, readChat, updateChat } from "./courseAiCache";
import { requestTutor } from "./services/aiClient";
import { createNativeSession } from "./services/nativeSession";
import { createSecureSessionStorage } from "./services/secureSessionStorage";
import { APPLE_SUBSCRIPTION_MANAGEMENT_URL, canOpenExternalUrl } from "./services/externalLinks";
import { hasActivePremiumEntitlement } from "./services/subscriptions";
import { useAppleSubscriptions } from "./services/useAppleSubscriptions";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Alert,
  AppState,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useEventListener } from "expo";
import * as ScreenCapture from "expo-screen-capture";
import Constants from "expo-constants";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { DOWNLOADS_STORAGE_KEY, downloadPath, prepareTemporaryDownloads } from "./downloadStorage";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  HOME_AI_FOUNDATIONS_CONTENT,
  HOME_INFLUENCER_CONTENT,
  buildLessonTopics,
  resolveLessonNumbers,
  sortLessons,
} from "./homeContentConfig";

const PLAYER_ORIGIN = "https://protected-video.local";

// Production binaries never package development fixture content. Keep these
// empty constants only to preserve the existing guarded QA call sites without
// allowing a build-time environment value to enable mock accounts or courses.
const DEV_UI_QA_ENABLED = false;
const UI_QA_AI_MESSAGES = [];
const UI_QA_CERTIFICATES = [];
const UI_QA_COURSES = [];
const UI_QA_DOWNLOADS = {};
const UI_QA_PROGRESS = {};
const UI_QA_WISHLIST = [];

const AI_ROBOT_IMAGES = {
  nex: require("./assets/ai-avatars/nex.png"),
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
const AI_ROBOT_THINKING_IMAGE = require("./assets/ai-avatars/nex-thinking.png");
const BRAND_LOGOS = {
  light: require("./assets/skillomate-logo.png"),
  dark: require("./assets/skillomate-logo-dark.png"),
};
const AI_ROBOT_AVATARS = Object.keys(AI_ROBOT_IMAGES).map((id, index) => ({
  id,
  label: id === "nex" ? "NEX signature companion" : `Nex companion ${index}`,
}));
const AI_AVATAR_STORAGE_KEY = "skillomate_ai_avatar";
const AI_NAME_STORAGE_PREFIX = "skillomate_ai_name";
const AI_NAME_SETUP_STORAGE_PREFIX = "skillomate_ai_name_setup";
const AI_CHAT_STORAGE_PREFIX = "skillomate_ai_chats";
const DEFAULT_AI_ROBOT_ID = "nex";
const DEFAULT_AI_NAME = "AI";
const MAX_AI_CHAT_SESSIONS = 24;
const MAX_AI_CHAT_MESSAGES = 80;

function normalizeAiName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
}

function aiNameStorageKeys(user) {
  const owner = String(user?._id || user?.id || "guest");
  return {
    name: `${AI_NAME_STORAGE_PREFIX}:${owner}`,
    setup: `${AI_NAME_SETUP_STORAGE_PREFIX}:${owner}`,
  };
}

function aiChatOwner(user) {
  return String(user?._id || user?.id || "guest");
}

function aiChatScope(mode, fixedCourse) {
  if (mode !== "course") return "master";
  const courseKey = fixedCourse?._id || fixedCourse?.id || fixedCourse?.slug || fixedCourse?.title || "course";
  return `course:${String(courseKey).replace(/[^a-z0-9._:-]+/gi, "_")}`;
}

function aiChatStorageKey(user, mode, fixedCourse) {
  return `${AI_CHAT_STORAGE_PREFIX}:${aiChatOwner(user)}:${aiChatScope(mode, fixedCourse)}`;
}

function newAiChatId() {
  return `nai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createAiConversationSession(messages = []) {
  return { id: newAiChatId(), title: "New chat", updatedAt: Date.now(), messages };
}

function aiChatTitle(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  return text.length > 42 ? `${text.slice(0, 42).trim()}...` : text;
}

function aiChatDateLabel(value) {
  const delta = Date.now() - Number(value || Date.now());
  if (delta < 60 * 1000) return "Just now";
  if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 60000))} min ago`;
  if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 3600000))} hr ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sanitizeAiChatMessage(message) {
  if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return null;
  return {
    role: message.role,
    id: typeof message.id === "string" ? message.id.slice(0, 120) : null,
    content: message.content.slice(0, 4000),
    failed: Boolean(message.failed),
    createdAt: Number(message.createdAt || Date.now()),
  };
}

function readAiChatSessions(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(session => ({
        id: String(session?.id || ""),
        title: String(session?.title || "New chat").slice(0, 80),
        updatedAt: Number(session?.updatedAt || Date.now()),
        messages: Array.isArray(session?.messages)
          ? session.messages.map(sanitizeAiChatMessage).filter(Boolean).slice(-MAX_AI_CHAT_MESSAGES)
          : [],
      }))
      .filter(session => session.id && session.messages.some(message => message.role === "user"))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_AI_CHAT_SESSIONS);
  } catch (_) {
    return [];
  }
}

function writeAiChatSessions(storageKey, sessions) {
  const stored = sessions
    .filter(session => Array.isArray(session.messages) && session.messages.some(message => message.role === "user"))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, MAX_AI_CHAT_SESSIONS);
  return AsyncStorage.setItem(storageKey, JSON.stringify(stored)).catch(() => {});
}

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
const HOME_FALLBACK_COURSES = [];
const ANDROID_CLIPPED_SUBVIEWS = Platform.OS === "android";
const ROOT_TAB_SWIPE_ENABLED = true;
const ROOT_TAB_CHROME_ENABLED = Platform.OS !== "android";
const ROOT_TAB_PAGE_GAP = Platform.OS === "android" ? 0 : 10;
const ROOT_TAB_SWITCH_DURATION_MS = Platform.OS === "android" ? 165 : 210;
const MIN_TOUCH_TARGET = Platform.OS === "ios" ? 44 : 48;
const ANDROID_STATUS_BAR_INSET = Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;

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

function getGoogleDriveFileId(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\/(?:www\.)?drive\.google\.com\//i.test(value)) return "";

  const pathMatch = value.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/i);
  const queryMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  return pathMatch?.[1] || queryMatch?.[1] || "";
}

function normalizeThumbnailUrl(url, width = 1600) {
  const value = String(url || "").trim();
  if (!value) return "";

  const driveFileId = getGoogleDriveFileId(value);
  if (!driveFileId) return value.startsWith("/") && !value.startsWith("//") ? `${API_BASE}${value}` : value;

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${width}`;
}

function getThumbnailUrlCandidates(url, width = 1600) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return [];

  const normalizedUrl = normalizeThumbnailUrl(rawUrl, width);
  const candidates = [normalizedUrl];
  const imageHost = getImageHost(normalizedUrl).toLowerCase();
  const apiHost = getImageHost(API_BASE).toLowerCase();

  if (/^https?:\/\//i.test(normalizedUrl) && API_BASE && imageHost && imageHost !== apiHost) {
    candidates.push(`${API_BASE}/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`);
  }
  if (rawUrl !== normalizedUrl) candidates.push(rawUrl);

  return [...new Set(candidates.filter(Boolean))];
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
  const localSource = (vertical ? course?.thumbnailVerticalAsset : course?.thumbnailAsset)
    || course?.thumbnailAsset
    || null;
  const imageCourse = course ? { ...course, thumbnailAsset: localSource } : course;

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <View style={s.artworkFallback}>
        <Ionicons name="play-circle-outline" size={28} color={C.primary} />
        <Text style={s.artworkFallbackText} numberOfLines={2}>{fallbackTitle}</Text>
      </View>
      {imageCourse ? <CourseThumbnailImage course={imageCourse} preferVertical={vertical} /> : null}
    </View>
  );
}

const RootTabSwipeContext = React.createContext(null);

function useHorizontalSwipeBoundaryProps() {
  const swipeBoundary = React.useContext(RootTabSwipeContext);

  return useMemo(() => ({
    onTouchStart: swipeBoundary?.begin,
    onTouchEnd: swipeBoundary?.end,
    onTouchCancel: swipeBoundary?.end,
  }), [swipeBoundary]);
}

function HorizontalRail({ data, renderItem, contentContainerStyle, keyExtractor }) {
  const swipeBoundaryProps = useHorizontalSwipeBoundaryProps();

  return (
    <FlatList
      {...swipeBoundaryProps}
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
  const avatarValue = String(avatarId || "");
  if (/^(file|content|https?):\/\//i.test(avatarValue) || avatarValue.startsWith("/")) {
    return (
      <Image
        accessible={false}
        source={{ uri: avatarValue.startsWith("/") ? `${API_BASE}${avatarValue}` : avatarValue }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        resizeMode="cover"
      />
    );
  }

  const src = AVATAR_IMAGES[avatarId];
  if (!src) return (
    <View accessible={false} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: EDUNEX_MOBILE_TOKENS.colors.dark.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: EDUNEX_MOBILE_TOKENS.colors.dark.border }, style]}>
      <Text style={{ color: EDUNEX_MOBILE_TOKENS.colors.dark.text, fontWeight: "800", fontSize: size * 0.4 }}>?</Text>
    </View>
  );
  return <Image accessible={false} source={src} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} resizeMode="cover" />;
}

async function pickProfileImage() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    selectionLimit: 1,
  });

  if (result.canceled) return null;
  const selected = result.assets?.[0];
  if (!selected?.uri) return null;
  if (selected.fileSize && selected.fileSize > 12 * 1024 * 1024) {
    Alert.alert("Photo too large", "Choose an image smaller than 12 MB.");
    return null;
  }
  if (!Number.isFinite(selected.width) || !Number.isFinite(selected.height) || selected.width < 64 || selected.height < 64) {
    Alert.alert("Photo too small", "Choose an image at least 64 by 64 pixels.");
    return null;
  }
  const mimeType = String(selected.mimeType || "image/jpeg").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    Alert.alert("Unsupported photo", "Choose a JPEG, PNG, or WebP image.");
    return null;
  }
  const manipulated = await ImageManipulator.manipulateAsync(
    selected.uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: manipulated.uri, mimeType: "image/jpeg" };
}

const DOWNLOADS_DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}skillomate_dl/` : null;
const hasCourseAccess = user => DEV_UI_QA_ENABLED || hasActivePremiumEntitlement(user);
const AI_FEATURE_ENABLED = true;

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const AUTO_QUALITY_LABEL = "Auto";
const FALLBACK_QUALITY_OPTIONS = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"];
const VIDEO_COMPLETE_THRESHOLD = 0.9;
const PROTECTED_VIDEO_CAPTURE_KEY = "skillomate-course-video";
const SHOW_DRAFT_HOME_RECOMMENDATIONS = false;

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
  : "https://api.skillomate.in";
const normalizeBaseUrl = url => String(url || "").replace(/\/+$/, "");
const API_BASE = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE || DEFAULT_API_BASE);
const WEB_APP_BASE = normalizeBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_BASE || "https://skillomate.in");
const API_REQUEST_TIMEOUT_MS = 12000;
const API_NETWORK_RETRY_DELAYS_MS = [0, 600, 1600];

function openMembershipAccess() {
  Alert.alert(
    "Membership access",
    Platform.OS === "ios"
      ? "Open Subscription Details to subscribe securely through the App Store or restore a previous purchase."
      : "Sign in with the Skillomate account connected to your membership, then open Subscription Details.",
    [{ text: "OK" }],
  );
}

async function openSafeExternalUrl(url, context = "resource") {
  const decision = canOpenExternalUrl(url, Platform.OS);
  if (!decision.allowed) {
    Alert.alert(
      context === "resource" ? "Link unavailable" : "Cannot open link",
      decision.category === "purchase"
        ? "Purchases on iPhone are available only through the App Store inside Skillomate."
        : "This link is not on Skillomate's trusted-link list."
    );
    return false;
  }
  try {
    await Linking.openURL(decision.url);
    return true;
  } catch (_) {
    Alert.alert("Link unavailable", "This link could not be opened.");
    return false;
  }
}

const LEGAL_APP_PAGES = {
  terms: {
    title: "Terms & Conditions",
    eyebrow: "Skillomate Legal",
    icon: "document-text-outline",
    intro: "These terms explain the rules for using Skillomate accounts, courses, subscriptions, downloads, certificates, and Nex AI.",
    sections: [
      { title: "Account access", body: "Use accurate account details and keep your password, OTP, device access, and session private. Do not share access in a way that bypasses payment or content protections." },
      { title: "Courses and subscriptions", body: "Protected lessons require sign-in and a qualifying trial or subscription. Course listings, lessons, videos, notes, and related material may be updated or removed." },
      { title: "Payments and billing", body: "Subscriptions purchased on iPhone are processed by Apple through the App Store. The monthly subscription renews automatically until cancelled in Apple ID settings. Other platforms may use their authorized payment provider. Access depends on server-verified entitlement and the current subscription period." },
      { title: "Downloads and certificates", body: "Offline downloads are for personal learning inside Skillomate and may not be redistributed. Certificates record Skillomate course completion and are not external professional credentials unless explicitly stated." },
      { title: "Nex AI", body: "AI responses may be incomplete or inaccurate. Verify important academic, career, financial, and technical decisions independently. Skillomate does not guarantee learning, employment, or income outcomes." },
      { title: "Acceptable use", body: "Do not attack, overload, disrupt, scrape, reverse engineer, record, resell, or republish the platform or protected course content without written permission." },
      { title: "Account deletion and availability", body: "Account deletion requires password confirmation. Access is revoked immediately; if a billing provider is temporarily unavailable, deletion continues and cancellation is queued for retry. Deleting a Skillomate account does not cancel a subscription billed by Apple; that subscription must be managed separately in Apple ID settings." },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    eyebrow: "Skillomate Legal",
    icon: "shield-checkmark-outline",
    intro: "This policy explains how Skillomate handles account, learning, AI, payment, device, storage, and support data.",
    sections: [
      { title: "Information we collect", body: "We may process your name, mobile number, age, gender, avatar or optional profile photo, login and IP security records, course progress, wishlist, certificates, payment status, device context, and support messages." },
      { title: "How information is used", body: "Information is used to create and secure accounts, provide learning features, track progress, process subscriptions, answer support requests, and prevent abuse." },
      { title: "Nex AI data", body: "When you use Nex AI, AI service providers may process your question, up to 12 recent messages, and relevant course material. Your profile name is not sent. You can delete history in AI Data Controls." },
      { title: "Payments and service providers", body: "Payment, verification, media, hosting, storage, and AI providers may process the information required to deliver their services. Sensitive payment credentials are entered through the payment provider." },
      { title: "Device storage and permissions", body: "The app may use internet, storage, vibration, and screen-capture controls for account, media, downloads, exports, and protected learning features. Permissions can be managed in device settings." },
      { title: "Security and retention", body: "We use technical and organizational safeguards, but no online service can guarantee absolute security. Information is kept only as long as needed for product, legal, payment, security, and support purposes." },
      { title: "Your controls", body: "You can update profile information, delete AI history, and permanently delete your account in Profile. Limited transaction records may be anonymized and retained for legal or accounting requirements." },
      { title: "Policy updates", body: "This policy may be updated as Skillomate changes. The latest policy information will be provided in the app." },
    ],
  },
  help: {
    title: "Help & Support",
    eyebrow: "Skillomate Help",
    icon: "help-circle-outline",
    intro: "Use these help paths for account access, videos, payments, courses, profile details, and Nex AI.",
    sections: [
      { title: "Login or profile", body: "If your login, OTP, avatar, or profile details do not sync, close and reopen the app, then sign in again." },
      { title: "Course videos", body: "Protected video access requires an active trial or subscription. Open Courses and select the lesson again after confirming your connection." },
      { title: "Membership access", body: "Existing memberships are linked to your Skillomate account. Open Subscription Details from Profile, refresh the status, or contact support if access is missing." },
      { title: "Wishlist and progress", body: "Wishlist and course progress sync to your signed-in account when the server is available." },
      { title: "Nex AI", body: "Use Nex AI for summaries, study plans, project ideas, and lesson explanations. Try again later if the AI service is temporarily unavailable." },
      { title: "Contact", body: "Email support@skillomate.in with your registered mobile number and a clear description of the issue. Never include your password or OTP." },
    ],
  },
};

const HELP_SUPPORT_CONTENT = {
  title: "Help & Support",
  eyebrow: "Help Center",
  icon: "help-circle-outline",
  intro: "Use these help paths for account access, videos, payments, courses, and profile issues.",
  sections: [
    {
      title: "Login Or Profile",
      icon: "key-outline",
      body: "If your login, OTP, avatar, or profile details do not sync, log out and sign in again. Then open Profile.",
    },
    {
      title: "Course Videos",
      icon: "play-circle-outline",
      body: "Video access requires an active trial or subscription. Open Courses, then choose View Course.",
    },
    {
      title: "Payments",
      icon: "receipt-outline",
      body: "Existing memberships are linked to your Skillomate account. Check Subscription Details from Profile, refresh the status, or contact support if access is missing.",
    },
    {
      title: "Wishlist",
      icon: "heart-outline",
      body: "Tap the heart on a course card to save it. Logged-in accounts sync wishlist data when the backend is available.",
    },
    {
      title: "Nex AI",
      icon: "sparkles-outline",
      body: "Use Nex AI inside the video player for summaries, study plans, project ideas, and lesson explanations.",
    },
    {
      title: "Contact",
      icon: "mail-outline",
      body: "Email support at support@skillomate.in with your mobile number and issue details.",
      actionLabel: "Email Support",
      actionIcon: "mail",
      onPress: () => openSafeExternalUrl("mailto:support@skillomate.in", "support"),
    },
  ],
};

const TERMS_CONTENT = {
  title: "Terms & Conditions",
  eyebrow: "Skillomate Legal",
  icon: "document-text-outline",
  intro: "These terms explain how learners use Skillomate accounts, courses, subscriptions, videos, notes, certificates, Nex AI, downloads, and support features.",
  sections: [
    {
      title: "Account Access",
      icon: "person-outline",
      body: "Create and use your account with accurate details. Keep your password, OTP, device access, and session private, and contact support if you believe your account has been used without permission.",
    },
    {
      title: "Course Access",
      icon: "play-circle-outline",
      body: "Public course catalogues and previews may be available, while protected lessons require sign-in and a qualifying trial or subscription.",
    },
    {
      title: "Trials And Subscriptions",
      icon: "receipt-outline",
      body: "Course access may require a trial or subscription. On iPhone, the monthly subscription renews automatically until cancelled in Apple ID settings. Access depends on active entitlement, provider invoice periods, payment reconciliation, and trial eligibility.",
    },
    {
      title: "Payments And Billing",
      icon: "card-outline",
      body: "Subscriptions purchased on iPhone are processed by Apple through the App Store. Other platforms may use their authorized payment provider. Skillomate grants access only after server verification.",
    },
    {
      title: "Downloads And Offline Use",
      icon: "download-outline",
      body: "Authorized mobile offline video downloads are for personal learning inside Skillomate. They do not permit redistribution, resale, recording, scraping, or uploading course content elsewhere.",
    },
    {
      title: "Certificates",
      icon: "ribbon-outline",
      body: "Skillomate certificates are course-completion records generated from stored progress. They are not government, university, professional-body, or employer-recognition credentials unless separately stated.",
    },
    {
      title: "Nex AI Assistance",
      icon: "sparkles-outline",
      body: "Nex AI can provide course explanations, examples, troubleshooting, practice questions, and platform guidance. AI responses may be inaccurate or incomplete.",
    },
    {
      title: "Acceptable Use",
      icon: "checkmark-circle-outline",
      body: "Do not bypass payments, account access, video protection, or subscription controls. Do not attack, overload, reverse engineer, or misuse the platform.",
    },
    {
      title: "Account Deletion",
      icon: "trash-outline",
      body: "Profile exposes Delete Account on web and mobile. Self-service deletion requires password verification and a typed DELETE confirmation. Access is revoked first, and deletion continues even if provider cancellation must be retried later. Deleting an account does not cancel a subscription billed by Apple; manage it separately in Apple ID settings.",
    },
    {
      title: "Support",
      icon: "mail-outline",
      body: "For account, course access, payment, deletion, or Terms questions, use Help & Support or email support@skillomate.in.",
    },
  ],
};

const PRIVACY_CONTENT = {
  title: "Privacy Policy",
  eyebrow: "Skillomate Privacy",
  icon: "shield-checkmark-outline",
  intro: "This policy explains how Skillomate handles account, learning, AI, payment, device, storage, and support data.",
  sections: [
    {
      title: "Information We Collect",
      icon: "person-outline",
      body: "Skillomate may process account information, an optional profile photo, authentication and IP security records, learning data, Nex AI conversations, payment records, device data, exports, and support communications.",
    },
    {
      title: "How We Use Information",
      icon: "checkmark-circle-outline",
      body: "Information is used to create and secure accounts, provide courses, track progress, process payments, answer AI questions, maintain analytics, and support service operations.",
    },
    {
      title: "Nex AI",
      icon: "sparkles-outline",
      body: "When you use Nex AI, AI service providers may process your question, up to 12 recent messages, and relevant course context. Your profile name is not sent. AI Data Controls let you delete history.",
    },
    {
      title: "Payments And Subscriptions",
      icon: "receipt-outline",
      body: "Apple processes iPhone subscription purchases through the App Store; other authorized providers may process payments on other platforms. Skillomate may keep transaction, subscription, refund, and billing status records needed for access and support.",
    },
    {
      title: "Device Permissions",
      icon: "phone-portrait-outline",
      body: "Network, storage, print/share, display, vibration, and screen-capture protection behavior may support course, download, certificate, and protected learning features.",
    },
    {
      title: "Storage And Retention",
      icon: "server-outline",
      body: "Account, session, learning, certificate, wishlist, support, analytics, order, subscription, and billing records may be stored as needed to operate Skillomate.",
    },
    {
      title: "Information Sharing",
      icon: "git-network-outline",
      body: "Skillomate shares data with service providers that help operate account, learning, payment, media, AI, verification, and support features.",
    },
    {
      title: "Security",
      icon: "lock-closed-outline",
      body: "Skillomate uses password protection, session checks, access controls, payment verification, request limits, and administrative access checks to protect learner information.",
    },
    {
      title: "Account And Data Deletion",
      icon: "trash-outline",
      body: "Learners can permanently delete their account from Profile. Personal data and any stored profile photo are removed; limited payment records may be anonymized and retained for legal, accounting, fraud, or dispute requirements.",
    },
    {
      title: "Contact Us",
      icon: "mail-outline",
      body: "For privacy questions, access requests, correction requests, deletion requests, or concerns about data handling, contact Skillomate support.",
    },
  ],
};

async function readJsonResponse(res) {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { error: raw }; }
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchWithNetworkRetry(url, options = {}) {
  let lastError;

  for (let attempt = 0; attempt < API_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    const retryDelay = API_NETWORK_RETRY_DELAYS_MS[attempt];
    if (retryDelay) await wait(retryDelay);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      console.warn(
        `[Skillomate API] request failed (${attempt + 1}/${API_NETWORK_RETRY_DELAYS_MS.length})`,
        String(error?.message || error || "Unknown network error"),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const requestError = new Error(
    lastError?.name === "AbortError"
      ? "The server took too long to respond."
      : "The device could not reach the Skillomate server.",
  );
  requestError.code = lastError?.name === "AbortError" ? "API_TIMEOUT" : "API_NETWORK_ERROR";
  throw requestError;
}

async function fetchApiJson(path, fallback = null, signal, headers = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data ?? fallback;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function postApiJson(paths, body) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let last = null;
  for (const path of candidates) {
    const res = await fetchWithNetworkRetry(`${API_BASE}${path}`, {
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

function authHeadersForUser(user, extra = {}) {
  const token = user?.accessToken || user?.token || "";
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeAuthUser(data = {}) {
  const source = data.user && typeof data.user === "object" ? data.user : data;
  const id = source._id || source.id || source.userId || data.userId;
  if (!id) return null;
  const accessToken = source.accessToken || data.accessToken || source.token || data.token || "";
  const refreshToken = source.refreshToken || data.refreshToken || "";
  return {
    ...source,
    _id: String(id),
    sessionId: source.sessionId || data.sessionId || source.token || data.token || "",
    token: accessToken,
    accessToken,
    refreshToken,
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

// Skillomate uses one premium dark-and-gold theme across iOS and Android.
const EDUNEX_MOBILE_TOKENS = {
  colors: {
    dark: {
      isDark: true,
      onPrimary: "#17130B",
      background: "#0D0D0B",
      navigation: "#0D0D0B",
      surface: "#171714",
      surfaceWarm: "#1C1C18",
      surfaceElevated: "#23231E",
      surfacePressed: "#302E28",
      panel: "#2A241C",
      panelSecondary: "#201D18",
      textStrong: "#F5F1E8",
      text: "#F5F1E8",
      textSecondary: "#B8B0A5",
      textMuted: "#8D867D",
      border: "#302E28",
      borderStrong: "#454137",
      primary: "#E7BC68",
      primaryPressed: "#C58B2A",
      accent: "#D8A94F",
      accentSoft: "#2A241C",
      success: "#6F7D52",
      warning: "#E7BC68",
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

const DARK_THEME = buildTheme("dark");
const C = { ...DARK_THEME };

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
const EMBED_PLAYER_POLL_MS = Platform.OS === "android" ? 1000 : 500;
const VIDEO_TIME_UPDATE_INTERVAL = Platform.OS === "android" ? 1.25 : 1;

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
      pollTimer = setInterval(emitState, ${EMBED_PLAYER_POLL_MS});
      emitState();
    }
    function postLegacyCommand(func, args) {
      try {
        var frame = player && player.getIframe ? player.getIframe() : document.querySelector('iframe');
        if (!frame || !frame.contentWindow) return;
        frame.contentWindow.postMessage(JSON.stringify({ event:'command', func:func, args:args || [] }), '*');
      } catch(e) {}
    }
    function ytQualityToken(value) {
      var raw = String(value || '').toLowerCase();
      if (!raw || raw === 'auto' || raw === 'default') return 'default';
      var pixels = Number((raw.match(/\\d+/) || [0])[0]);
      if (pixels >= 2160) return 'hd2160';
      if (pixels >= 1440) return 'hd1440';
      if (pixels >= 1080) return 'hd1080';
      if (pixels >= 720) return 'hd720';
      if (pixels >= 480) return 'large';
      if (pixels >= 360) return 'medium';
      if (pixels >= 240) return 'small';
      return 'tiny';
    }
    function emitQualities() {
      try {
        if (player && player.getAvailableQualityLevels) {
          var levels = player.getAvailableQualityLevels() || [];
          if (levels.length) post({ type:'qualities', qualities: levels });
        }
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
            emitQualities();
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
          else if (func === 'seekAndPlay') {
            player.seekTo(Number(args[0]) || 0, args[1] !== false);
            player.playVideo();
          }
          else if (func === 'mute') player.mute();
          else if (func === 'unMute') player.unMute();
          else if (func === 'setPlaybackRate') player.setPlaybackRate(Number(args[0]) || 1);
          else if (func === 'setQuality') {
            var quality = ytQualityToken(args[0]);
            if (player.setPlaybackQualityRange) player.setPlaybackQualityRange(quality, quality);
            if (player.setPlaybackQuality) player.setPlaybackQuality(quality);
            post({ type:'qualityChange', quality: quality === 'default' ? 'auto' : args[0] });
            setTimeout(emitQualities, 250);
          }
        } catch(e) {}
        postLegacyCommand(func, args);
        if (func === 'playVideo' || func === 'seekAndPlay') post({ type:'stateChange', playing: true, playerState: 1 });
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
      }, ${EMBED_PLAYER_POLL_MS});
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
        player.on('buffering', function() {
          post({ type:'stateChange', playing: false, playerState: 3 });
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
    window.bunnySeekAndPlay = function(t) {
      exec(function(){
        t = Number(t) || 0;
        try {
          player.setCurrentTime(t);
          player.play();
        } catch(e) {}
        playerMessage('setCurrentTime', t);
        playerMessage('play');
        post({ type:'stateChange', playing: true, playerState: 1 });
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
        var nextQuality = (!q || String(q).toLowerCase() === 'auto') ? 'auto' : q;
        try { player.setQuality(nextQuality); } catch(e) {}
        playerMessage('setQuality', nextQuality);
        post({ type:'qualityChange', quality: nextQuality });
      });
    };
  </script>
</body></html>`;
}

function normalizeVideoQualityOptions(values = []) {
  const seen = new Set();
  const options = [];
  values.forEach(value => {
    const rawValue = typeof value === "object" && value
      ? getVideoTrackQualityLabel(value) || value.label || value.name || value.id || ""
      : value;
    const raw = String(rawValue || "").trim();
    if (!raw || /^auto$/i.test(raw)) return;
    const match = raw.match(/(\d{3,4})\s*p?/i);
    const label = match ? `${match[1]}p` : raw;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push(label);
  });
  return options.sort((a, b) => {
    const aPixels = Number(String(a).match(/\d+/)?.[0] || 0);
    const bPixels = Number(String(b).match(/\d+/)?.[0] || 0);
    return aPixels - bPixels;
  });
}

function qualityPixels(label) {
  const value = Number(String(label || "").match(/\d+/)?.[0] || 0);
  return Number.isFinite(value) ? value : 0;
}

function getVideoTrackQualityLabel(track) {
  const width = Number(track?.size?.width || track?.width || 0);
  const height = Number(track?.size?.height || track?.height || 0);
  const pixels = width > 0 && height > 0 ? Math.min(width, height) : Math.max(width, height);
  if (Number.isFinite(pixels) && pixels > 0) return `${Math.round(pixels)}p`;
  return String(track?.label || track?.name || track?.id || "").trim();
}

function findVideoTrackForQuality(tracks = [], quality) {
  const target = qualityPixels(quality);
  if (!target) return null;
  const candidates = tracks
    .filter(track => track?.url)
    .map(track => ({ track, pixels: qualityPixels(getVideoTrackQualityLabel(track)) }))
    .filter(item => item.pixels > 0)
    .sort((a, b) => a.pixels - b.pixels);
  if (!candidates.length) return null;
  return (
    candidates.find(item => item.pixels === target) ||
    candidates.filter(item => item.pixels <= target).at(-1) ||
    candidates[0]
  ).track;
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
  return !!(video?.playbackRequired || video?.hlsUrl || video?.playlistUrl || video?.streamUrl || video?.embedUrl || video?.videoUrl || video?.bunnyGuid || video?.bunnyVideoId || video?.youtubeId || video?.videoId);
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

const PLAYBACK_ACCESS_TIMEOUT_MS = 30000;
const PLAYBACK_ACCESS_MIN_VALID_MS = 60000;
const PLAYBACK_ACCESS_CACHE = new Map();

function getPlaybackLeaseKey(courseId, videoId, sessionId) {
  return `${courseId || ""}:${videoId || ""}:${sessionId || ""}`;
}

function getCachedPlaybackLease(leaseKey, minValidMs = PLAYBACK_ACCESS_MIN_VALID_MS) {
  const lease = PLAYBACK_ACCESS_CACHE.get(leaseKey);
  if (!lease || Number(lease.expiresAt || 0) <= Date.now() + minValidMs) {
    if (lease) PLAYBACK_ACCESS_CACHE.delete(leaseKey);
    return null;
  }
  return lease;
}

function isFetchCancellation(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return name === "aborterror" || message.includes("abort") || message.includes("cancel");
}

async function fetchPlaybackLease({ courseId, video, user, signal, timeoutMs = PLAYBACK_ACCESS_TIMEOUT_MS }) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromParent, { once: true });
  }
  const requestTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${API_BASE}/api/courses/${courseId}/videos/${video._id}/playback-access`;
    const body = JSON.stringify({ userId: user?._id, sessionId: user?.sessionId });
    let response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: authHeadersForUser(user, { "Content-Type": "application/json" }),
      body,
    });
    if ((response.status === 401 || response.status === 403) && (user?.accessToken || user?.token)) {
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body,
      });
    }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || "Playback access unavailable.");
    if (!data.hlsUrl) throw new Error("Playback URL unavailable.");
    return {
      ...data,
      hlsUrl: /^https?:\/\//i.test(data.hlsUrl) ? data.hlsUrl : `${API_BASE}${data.hlsUrl}`,
    };
  } finally {
    clearTimeout(requestTimer);
    signal?.removeEventListener?.("abort", abortFromParent);
  }
}

function getLessonThumbnailUrl(lesson, course) {
  if (lesson?.thumbnailUrl || lesson?.thumbnailVerticalUrl) {
    return normalizeThumbnailUrl(lesson.thumbnailUrl || lesson.thumbnailVerticalUrl, 640);
  }
  const bunnyGuid = getBunnyGuid(lesson);
  if (bunnyGuid) {
    return `${API_BASE}/api/bunny/thumbnail/${bunnyGuid}?libraryId=${encodeURIComponent(getBunnyLibraryId(lesson))}`;
  }
  if (lesson?.youtubeId) {
    return `https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`;
  }
  return getCourseThumbnailUri(course, false) || "";
}

function getDownloadFailureMessage(error, status) {
  const statusCode = Number(status || 0);
  const message = String(error?.message || error || "").toLowerCase();

  if (statusCode === 401 || statusCode === 403) {
    return "Course access could not be verified. Sign in again, then retry.";
  }
  if (statusCode >= 500) {
    return "The download service is temporarily unavailable. Please retry shortly.";
  }
  if (message.includes("network") || message.includes("offline") || message.includes("internet") || message.includes("timed out")) {
    return "Check your internet connection, then retry the download.";
  }
  return "This lesson could not be saved. Check your connection and course access, then retry.";
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
      return { index: i, seconds: Math.floor(vp?.resumePosition ?? vp?.watchedSeconds ?? 0) };
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

function progressFromLearningStatus(status, previous = {}) {
  if (!status || typeof status !== "object") return null;
  const lessons = Array.isArray(status.lessons) ? status.lessons : [];
  const videoProgress = { ...(previous.videoProgress || {}) };
  lessons.forEach(lesson => {
    const id = String(lesson?.id || lesson?.videoId || "");
    if (!id) return;
    videoProgress[id] = {
      ...(videoProgress[id] || {}),
      watchedSeconds: Math.max(0, Number(lesson.watchedSeconds ?? lesson.resumePosition ?? videoProgress[id]?.watchedSeconds ?? 0)),
      resumePosition: Math.max(0, Number(lesson.resumePosition ?? lesson.watchedSeconds ?? videoProgress[id]?.resumePosition ?? 0)),
      duration: Math.max(0, Number(lesson.duration ?? videoProgress[id]?.duration ?? 0)),
      completed: Boolean(lesson.complete),
    };
  });
  return {
    ...previous,
    completedVideoIds: lessons.filter(lesson => lesson?.complete).map(lesson => String(lesson.id || lesson.videoId)).filter(Boolean),
    completedCount: Number(status.completedLessons || 0),
    totalVideos: Number(status.totalLessons || lessons.length || previous.totalVideos || 0),
    progressPercent: Math.max(0, Math.min(100, Number(status.progressPercent || 0))),
    videoProgress,
    updatedAt: new Date().toISOString(),
  };
}

function getCourseThumbnailUri(course, preferVertical = false) {
  return getCourseThumbnailUris(course, preferVertical)[0] || null;
}

function getCourseThumbnailUris(course, preferVertical = false) {
  const urls = preferVertical
    ? [course?.thumbnailVerticalUrl, course?.thumbnailUrl]
    : [course?.thumbnailUrl, course?.thumbnailVerticalUrl];
  return [...new Set(urls.flatMap(url => getThumbnailUrlCandidates(url)))];
}

function getCourseThumbnailAsset(course, preferVertical = false) {
  const configuredAsset = preferVertical
    ? course?.thumbnailVerticalAsset || course?.thumbnailAsset || null
    : course?.thumbnailAsset || course?.thumbnailVerticalAsset || null;
  if (configuredAsset) return configuredAsset;
  return null;
}

function getCourseThumbnailSource(course, preferVertical = false, uriIndex = 0) {
  const uris = getCourseThumbnailUris(course, preferVertical);
  if (uris[uriIndex]) return { uri: uris[uriIndex] };
  return getCourseThumbnailAsset(course, preferVertical);
}

// ── Shared Components ─────────────────────────────────────────────────────────

function ThumbnailBrandBadge({ large = false }) {
  return (
    <View pointerEvents="none" style={[s.thumbnailBrandBadge, large && s.thumbnailBrandBadgeLarge]}>
      <Ionicons name="school" size={11} color={C.primary} />
      <Text style={s.thumbnailBrandText}>Skillomate</Text>
    </View>
  );
}

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

  const source = uris[uriIndex] ? { uri: uris[uriIndex] } : asset;
  if (!source) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        key={uris[uriIndex] || course?._id || "asset"}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        onError={() => {
          const failedUrl = uris[uriIndex];
          traceImageFailure({
            screen: preferVertical ? "CourseThumbnail.vertical" : "CourseThumbnail.landscape",
            courseId: course?._id || course?.id,
            imageUrl: failedUrl,
            fallbackUsed: Boolean(asset || uris[uriIndex + 1]),
          });
          setUriIndex(currentIndex => asset ? Math.min(currentIndex + 1, uris.length) : currentIndex + 1);
        }}
      />
      <ThumbnailBrandBadge />
    </View>
  );
}

function RemoteThumbnailImage({ imageUrl, screen, courseId, borderRadius = 8 }) {
  const candidates = useMemo(() => getThumbnailUrlCandidates(imageUrl, 1000), [imageUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates.join("|")]);

  const resolvedUrl = candidates[candidateIndex];
  if (!resolvedUrl) return null;

  return (
    <Image
      key={resolvedUrl}
      source={{ uri: resolvedUrl }}
      style={[StyleSheet.absoluteFill, { borderRadius }]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      onError={() => {
        traceImageFailure({
          screen,
          courseId,
          imageUrl: resolvedUrl,
          fallbackUsed: Boolean(candidates[candidateIndex + 1]),
        });
        setCandidateIndex(index => index + 1);
      }}
    />
  );
}

function SkillomateLogo({ size = "md", mode, style }) {
  const logoSize = {
    xs: { width: 112, height: 37 },
    sm: { width: 132, height: 44 },
    md: { width: 158, height: 53 },
    lg: { width: 190, height: 63 },
  }[size] || { width: 158, height: 53 };
  const logoMode = mode || (C.isDark ? "dark" : "light");

  return (
    <View style={[s.logoWrap, logoSize, style]}>
      <Image
        source={BRAND_LOGOS[logoMode === "light" ? "light" : "dark"]}
        style={s.logoImage}
        resizeMode="contain"
        accessibilityLabel="Skillomate"
      />
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
              ? <Ionicons name="checkmark" size={14} color={C.onPrimary} />
              : <Text style={{ color: n === current ? C.onPrimary : C.textMuted, fontWeight: "700", fontSize: 13 }}>{n}</Text>
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

function FieldInput({ label, style, secureTextEntry, accessibilityLabel, inputRef, onFocus, onBlur, ...props }) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const [focused, setFocused] = useState(false);
  const spokenLabel = accessibilityLabel || label || props.placeholder || "Text input";
  const handleFocus = event => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur = event => {
    setFocused(false);
    onBlur?.(event);
  };
  if (secureTextEntry) {
    return (
      <View style={{ marginBottom: 16 }}>
        {label ? <FieldLabel label={label} /> : null}
        <View style={{ position: "relative" }}>
          <TextInput
            ref={inputRef}
            style={[s.input, focused && s.inputFocused, { paddingRight: 52 }, style]}
            placeholderTextColor={C.textMuted}
            secureTextEntry={hidden}
            accessibilityLabel={spokenLabel}
            maxFontSizeMultiplier={1.5}
            onFocus={handleFocus}
            onBlur={handleBlur}
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
      <TextInput
        ref={inputRef}
        style={[s.input, focused && s.inputFocused, style]}
        placeholderTextColor={C.textMuted}
        accessibilityLabel={spokenLabel}
        maxFontSizeMultiplier={1.5}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
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
        ? <ActivityIndicator color={outline ? C.primary : C.onPrimary} />
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

const AGES = Array.from({ length: 68 }, (_, i) => i + 13);
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
        <Text style={{ color: C.textSub, fontSize: 12, marginTop: 2 }}>Age: {selected || "Select your age"}</Text>
      </View>
    </View>
  );
}

function Badge({ label, color }) {
  const bg = C.isDark
    ? color === "blue"
      ? C.primaryLight
      : color === "green"
        ? "rgba(111,125,82,0.22)"
        : color === "orange"
          ? "rgba(231,188,104,0.16)"
          : "rgba(239,68,68,0.16)"
    : color === "blue"
      ? C.primaryLight
      : color === "green"
        ? "#EDF7EA"
        : color === "orange"
          ? "#FBF0DA"
          : "#FBEAE7";
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
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessible={false} />
        <View style={[s.upgradeSheet, { backgroundColor: C.white }]}>

          {/* Close */}
          <TouchableOpacity style={s.upgradeClose} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close membership information">
            <Ionicons name="close" size={20} color={C.textMuted} />
          </TouchableOpacity>

          {/* Banner */}
          <View style={[s.upgradeBanner, { backgroundColor: C.accentSoft }]}>
            <View style={[s.upgradeBannerBadge, { backgroundColor: C.accent }]}>
              <Text style={s.upgradeBannerBadgeText}>MEMBER ACCESS</Text>
            </View>
            <View style={s.upgradeBannerIcon}>
              <Ionicons name="ribbon" size={38} color={C.accent} />
            </View>
            {/* Earning potential badge */}
            <View style={s.upgradeEarningBadge}>
              <Text style={s.upgradeEarningBadgeText}>PRACTICAL AI SKILLS</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 14 }}>
            {/* Title */}
            <Text style={[s.upgradeTitle, { color: C.text }]}>Membership required</Text>
            <Text style={[s.upgradeOfferTitle, { color: C.primary }]}>Continue with an existing membership</Text>
            <Text style={[s.upgradeSub, { color: C.textSub }]}>
              Sign in with the Skillomate account connected to your membership to access included courses.
            </Text>

            {/* Features */}
            {FEATURES.map((f, i) => (
              <View key={i} style={s.upgradeFeatureRow}>
                <Ionicons name="checkmark-circle" size={19} color={C.primary} />
                <Text style={[s.upgradeFeatureText, { color: C.text }]}>{f}</Text>
              </View>
            ))}

            <View style={[s.iosMembershipPanel, { marginTop: 16 }]}>
              <Text style={[s.iosMembershipText, { textAlign: "center" }]}>
                {Platform.OS === "ios"
                  ? "Subscriptions are available securely through the App Store in Subscription Details."
                  : "Open Subscription Details to view the payment options available on this device."}
              </Text>
            </View>

            {/* Footer */}
            <View style={s.upgradeFooter}>
              <Ionicons name="shield-checkmark" size={13} color={C.textMuted} />
              <Text style={s.upgradeFooterText}>ACCOUNT-BASED ACCESS</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const NOTIFICATION_VIEWED_SIGNATURE_KEY = "skillomate_notifications_viewed_signature";
const PROBLEM_REPORT_CATEGORIES = [
  { value: "technical", label: "Technical problem" },
  { value: "video", label: "Video or lesson" },
  { value: "payment", label: "Payment or subscription" },
  { value: "ai", label: "AI tutor" },
  { value: "account", label: "Account or login" },
  { value: "other", label: "Something else" },
];
const NOTIFICATION_PREVIEWS = [];

function getNotificationSignature(items = NOTIFICATION_PREVIEWS) {
  return items.map(item => [item.title, item.body, item.time].join("\u001f")).join("\u001e");
}

function useNotificationReadState() {
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  const markNotificationsViewed = useCallback(() => {
    setHasUnreadNotifications(false);
  }, []);

  return { hasUnreadNotifications, markNotificationsViewed };
}

function NotificationPreviewModal({ visible, onClose, onOpenCourses, onOpenAI, onOpenSubscription }) {
  const items = useMemo(() => {
    const actions = {
      ai: onOpenAI,
      courses: onOpenCourses,
      subscription: onOpenSubscription,
    };
    return NOTIFICATION_PREVIEWS.map(item => ({ ...item, action: actions[item.actionKey] }));
  }, [onOpenAI, onOpenCourses, onOpenSubscription]);

  const openItem = action => {
    action?.();
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.notificationOverlay} onPress={onClose} accessible={false}>
        <Pressable style={s.notificationSheet} accessible={false}>
          <View style={s.notificationHandle} />
          <View style={s.notificationHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.notificationTitle}>Notifications</Text>
              <Text style={s.notificationSubtitle}>Account and learning updates</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.notificationClose} accessibilityRole="button" accessibilityLabel="Close notifications">
              <Ionicons name="close" size={19} color={C.text} />
            </TouchableOpacity>
          </View>
          {items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 }}>
              <Ionicons name="notifications-outline" size={30} color={C.textMuted} />
              <Text style={[s.notificationBody, { marginTop: 10, textAlign: "center" }]}>You have no notifications.</Text>
            </View>
          ) : items.map((item, index) => {
            const Row = item.action ? TouchableOpacity : View;
            return (
            <Row
              key={item.title}
              style={[s.notificationItem, index === items.length - 1 && { borderBottomWidth: 0 }]}
              activeOpacity={item.action ? 0.82 : undefined}
              onPress={item.action ? () => openItem(item.action) : undefined}
              accessible
              accessibilityRole={item.action ? "button" : "text"}
              accessibilityLabel={`${item.title}. ${item.body}. ${item.time}`}
              accessibilityHint={item.action ? `Opens ${item.title}` : undefined}
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

function appProblemReportContext(user, route = "home") {
  const viewport = Dimensions.get("window");
  const width = Math.round(viewport.width || 0);
  const height = Math.round(viewport.height || 0);
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "unknown";
  return {
    pageUrl: `skillomate-app://${route}`,
    pageTitle: `Skillomate app - ${route}`,
    route: `app/${route}`,
    theme: "noir",
    viewport: { width, height },
    deviceType: width >= 768 ? "tablet" : "mobile",
    userAgent: `SkillomateApp/${appVersion} ${Platform.OS}/${Platform.Version}`,
    userId: user?._id || "",
    sessionId: user?.sessionId || "",
  };
}

async function submitProblemReportFromApp({ user, category, message, route = "home" }) {
  const token = user?.accessToken || user?.token || "";
  const response = await fetch(`${API_BASE}/api/problem-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      category,
      message,
      ...appProblemReportContext(user, route),
    }),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data.error || "Unable to send your report. Please try again.");
  return data;
}

function ProblemReportModal({ visible, onClose, user, route = "home" }) {
  const [category, setCategory] = useState("technical");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!visible) {
      setCategory("technical");
      setMessage("");
      setBusy(false);
      setError("");
      setReference("");
    }
  }, [visible]);

  const cleanMessage = message.trim();
  const canSubmit = Boolean(category && cleanMessage.length > 0 && !busy);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Please choose a problem type and describe what happened.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitProblemReportFromApp({ user, category, message: cleanMessage, route });
      setReference(result.reportId || "Submitted");
    } catch (submitError) {
      setError(submitError.message || "Unable to send your report. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose?.(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.reportOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessible={false} />
        <View style={s.reportSheet}>
          <View style={s.reportHeader}>
            <View style={s.reportMark}>
              <Ionicons name="flag-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.reportEyebrow}>SKILLOMATE SUPPORT</Text>
              <Text style={s.reportTitle}>Report a problem</Text>
            </View>
            <TouchableOpacity
              style={s.reportClose}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close report form"
            >
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {reference ? (
            <View style={s.reportSuccess}>
              <View style={s.reportSuccessIcon}>
                <Ionicons name="checkmark-circle-outline" size={42} color={C.primary} />
              </View>
              <Text style={s.reportSuccessTitle}>Thank you. We received it.</Text>
              <Text style={s.reportSuccessText}>Reference {reference}. Your report is now visible in the admin panel.</Text>
              <TouchableOpacity style={[s.reportSubmitButton, s.reportDoneButton]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close report confirmation">
                <Text style={s.reportSubmitText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.reportDescription}>
                Tell us what went wrong. We automatically include this app screen and basic device details, never passwords or payment information.
              </Text>

              <Text style={s.reportFieldLabel}>Where is the problem?</Text>
              <View style={s.reportCategoryList}>
                {PROBLEM_REPORT_CATEGORIES.map(item => {
                  const selected = item.value === category;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[s.reportCategoryButton, selected && s.reportCategoryButtonActive]}
                      onPress={() => setCategory(item.value)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[s.reportCategoryText, selected && s.reportCategoryTextActive]}>{item.label}</Text>
                      {selected ? <Ionicons name="checkmark" size={17} color={C.onPrimary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.reportFieldLabel}>What happened?</Text>
              <TextInput
                value={message}
                onChangeText={text => setMessage(text.slice(0, 3000))}
                editable={!busy}
                multiline
                maxLength={3000}
                placeholder="Describe what you were trying to do and what happened instead..."
                placeholderTextColor={C.textMuted}
                style={s.reportTextArea}
                textAlignVertical="top"
                accessibilityLabel="Describe the problem"
              />
              <Text style={s.reportCounter}>{message.length}/3000</Text>
              {!!error && <Text style={s.reportError}>{error}</Text>}

              <View style={s.reportActions}>
                <TouchableOpacity
                  style={s.reportCancelButton}
                  onPress={onClose}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel report"
                >
                  <Text style={s.reportCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.reportSubmitButton, !canSubmit && s.reportSubmitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Send report"
                  accessibilityState={{ disabled: !canSubmit, busy }}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.reportSubmitText}>Send report</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NavIcon({ icon, color, size = 20 }) {
  return <Ionicons name={`${icon}-outline`} size={size} color={color} />;
}

function BottomNav({
  active,
  onHome,
  onCourses,
  onAI,
  onDownloads,
  onProfile,
  aiRobotId,
  forceDark = false,
  persistent = false,
  searchReferences: searchReferencesOverride = null,
  searchPlaceholder = "Search this page",
}) {
  const rootTabSwipe = React.useContext(RootTabSwipeContext);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navSearchText, setNavSearchText] = useState("");
  const navSearchInputRef = useRef(null);
  useEffect(() => {
    if (!searchOpen) return undefined;
    const timer = setTimeout(() => navSearchInputRef.current?.focus?.(), 120);
    return () => clearTimeout(timer);
  }, [searchOpen]);
  if (rootTabSwipe?.hideEmbeddedNav && !persistent) return null;
  const inactiveColor = forceDark ? "#AAA297" : C.slateGray;
  const normalizedSearch = navSearchText.trim().toLowerCase().replace(/%20/g, " ");
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);
  const closeSearch = () => {
    setSearchOpen(false);
    Keyboard.dismiss();
  };
  const toggleSearch = () => {
    if (searchOpen) closeSearch();
    else setSearchOpen(true);
  };
  const tabs = [
    { key: "home", icon: "home", label: "Home", fn: onHome },
    { key: "courses", icon: "compass", label: "Courses", fn: onCourses },
    { key: "search", icon: "search", label: "Search", fn: toggleSearch },
    { key: "ai", icon: "sparkles", label: "Nex AI", fn: onAI },
    { key: "downloads", icon: "download", label: "Downloads", fn: onDownloads },
  ];
  const defaultSearchReferences = [
    {
      key: "ai-influencer-course",
      title: "AI Influencer Course",
      subtitle: "Open the course and related lessons",
      icon: "play-circle",
      fn: onCourses,
      keywords: "ai influencer course masterclass lessons lecture character face prompts",
    },
    {
      key: "course-lessons",
      title: "Course Lessons",
      subtitle: "Browse all Skillomate course lessons",
      icon: "albums",
      fn: onCourses,
      keywords: "course lessons lectures explore browse videos tools setup",
    },
    {
      key: "home-progress",
      title: "Continue Learning",
      subtitle: "Return to your active course progress",
      icon: "home",
      fn: onHome,
      keywords: "continue learning progress resume home ai influencer course",
    },
    {
      key: "nex-ai",
      title: "Nex AI",
      subtitle: "Ask questions about your course",
      icon: "sparkles",
      fn: onAI,
      keywords: "ai chat nex assistant doubt question prompt help",
    },
    {
      key: "downloads",
      title: "Downloads",
      subtitle: "Find offline saved lessons",
      icon: "download",
      fn: onDownloads,
      keywords: "download downloads offline saved videos lessons",
    },
  ];
  const searchReferences = (Array.isArray(searchReferencesOverride) ? searchReferencesOverride : defaultSearchReferences)
    .filter(item => typeof item.fn === "function");
  const searchResults = searchTerms.length
    ? searchReferences.filter(item => {
        const haystack = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
        return searchTerms.every(term => haystack.includes(term));
      }).slice(0, 4)
    : [];
  const openSearchResult = item => {
    closeSearch();
    setNavSearchText("");
    item.fn?.();
  };
  const submitSearch = () => {
    if (searchResults[0]) openSearchResult(searchResults[0]);
  };
  return (
    <View style={[s.bottomNav, forceDark && { backgroundColor: "rgba(13,13,11,0.98)", borderTopColor: "#2E2C27" }]}>
      {searchOpen ? (
        <View style={s.bottomNavSearchBar}>
          {normalizedSearch ? (
            <View style={s.bottomNavSearchResults}>
              {searchResults.length ? searchResults.map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={s.bottomNavSearchResult}
                  onPress={() => openSearchResult(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.subtitle}`}
                >
                  <View style={s.bottomNavSearchResultIcon}>
                    <Ionicons name={`${item.icon}-outline`} size={16} color={C.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.bottomNavSearchResultTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.bottomNavSearchResultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={inactiveColor} />
                </TouchableOpacity>
              )) : (
                <View style={s.bottomNavSearchEmpty}>
                  <Text style={s.bottomNavSearchEmptyText}>No matching references</Text>
                </View>
              )}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={toggleSearch}
            style={s.bottomNavSearchIcon}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <NavIcon icon="search" color={C.primary} size={24} />
          </TouchableOpacity>
          <TextInput
            ref={navSearchInputRef}
            value={navSearchText}
            onChangeText={setNavSearchText}
            placeholder={searchPlaceholder}
            placeholderTextColor={forceDark ? "#AAA297" : C.textMuted}
            style={s.bottomNavSearchInput}
            returnKeyType="search"
            accessibilityLabel="Search this page"
            onSubmitEditing={submitSearch}
          />
          <TouchableOpacity
            onPress={() => {
              if (navSearchText) setNavSearchText("");
              else closeSearch();
            }}
            style={s.bottomNavSearchClose}
            accessibilityRole="button"
            accessibilityLabel={navSearchText ? "Clear search" : "Close search"}
          >
            <Ionicons name={navSearchText ? "close-circle" : "close"} size={22} color={inactiveColor} />
          </TouchableOpacity>
        </View>
      ) : tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          onPress={() => {
            if (t.key !== "search") closeSearch();
            t.fn?.();
          }}
          style={s.bottomTab}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          accessibilityState={{ selected: active === t.key }}
        >
          <View style={[s.bottomTabIcon, active === t.key && s.bottomTabIconActive]}>
            <NavIcon icon={t.icon} color={active === t.key ? C.primary : inactiveColor} />
          </View>
          <Text
            style={[
              s.bottomTabLabel,
              forceDark && { color: "#AAA297" },
              active === t.key && { color: C.primary },
            ]}
            numberOfLines={1}
          >
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const ROOT_TAB_ORDER = ["home", "courses", "ai", "downloads"];
const ROOT_TAB_LABELS = {
  home: "Home",
  courses: "Courses",
  ai: "Nex AI",
  downloads: "Downloads",
  profile: "Profile",
};

function StaticRootTabs({ activeTab, onNavigate, renderTab }) {
  const swipeBoundary = useMemo(() => ({ hideEmbeddedNav: true }), []);
  const stationaryNavActions = useMemo(() => ({
    home: () => onNavigate?.("home"),
    courses: () => onNavigate?.("courses"),
    downloads: () => onNavigate?.("downloads"),
    ai: () => onNavigate?.("ai"),
    profile: () => onNavigate?.("profile"),
  }), [onNavigate]);

  return (
    <RootTabSwipeContext.Provider value={swipeBoundary}>
      <View style={s.swipePagerViewport}>
        <View style={s.staticRootTabPage}>
          {renderTab(activeTab, { isActive: true })}
        </View>
        <BottomNav
          persistent
          active={activeTab}
          onHome={stationaryNavActions.home}
          onCourses={stationaryNavActions.courses}
          onDownloads={stationaryNavActions.downloads}
          onAI={stationaryNavActions.ai}
          onProfile={stationaryNavActions.profile}
        />
      </View>
    </RootTabSwipeContext.Provider>
  );
}

function SwipeableRootTabs(props) {
  return ROOT_TAB_SWIPE_ENABLED ? <SwipeableRootTabsPager {...props} /> : <StaticRootTabs {...props} />;
}

function SwipeableRootTabsPager({ activeTab, onNavigate, renderTab }) {
  const { width, height } = useWindowDimensions();
  const pageGap = ROOT_TAB_PAGE_GAP;
  const pageStride = width + pageGap;
  const activeIndex = ROOT_TAB_ORDER.indexOf(activeTab);
  const trackX = useRef(new Animated.Value(-Math.max(activeIndex, 0) * pageStride)).current;
  const pageChrome = useRef(new Animated.Value(0)).current;
  const navigateRef = useRef(onNavigate);
  const transitionInProgressRef = useRef(false);
  const horizontalChildActiveRef = useRef(false);
  const pendingIndexRef = useRef(null);
  const mountedTabs = ROOT_TAB_ORDER;

  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  React.useLayoutEffect(() => {
    if (activeIndex < 0) return;
    trackX.stopAnimation();
    trackX.setValue(-activeIndex * pageStride);
    pageChrome.stopAnimation();
    pageChrome.setValue(0);
    pendingIndexRef.current = null;
    transitionInProgressRef.current = false;
    horizontalChildActiveRef.current = false;
  }, [activeIndex, pageChrome, pageStride, trackX]);

  const swipeBoundary = useMemo(() => ({
    begin: () => { horizontalChildActiveRef.current = true; },
    end: () => { horizontalChildActiveRef.current = false; },
    hideEmbeddedNav: true,
  }), []);

  const stationaryNavActions = useMemo(() => ({
    home: () => navigateRef.current?.("home"),
    courses: () => navigateRef.current?.("courses"),
    downloads: () => navigateRef.current?.("downloads"),
    ai: () => navigateRef.current?.("ai"),
    profile: () => navigateRef.current?.("profile"),
  }), []);

  const settleChrome = useCallback(() => (
    ROOT_TAB_CHROME_ENABLED
      ? Animated.timing(pageChrome, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        })
      : Animated.delay(0)
  ), [pageChrome]);

  const returnToActive = useCallback(() => {
    if (activeIndex < 0) return;
    transitionInProgressRef.current = true;
    Animated.parallel([
      Animated.timing(trackX, {
        toValue: -activeIndex * pageStride,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      settleChrome(),
    ]).start(() => {
      transitionInProgressRef.current = false;
      pendingIndexRef.current = null;
    });
  }, [activeIndex, pageStride, settleChrome, trackX]);

  const navigateByDirection = useCallback((direction) => {
    if (transitionInProgressRef.current || activeIndex < 0) return;
    const targetIndex = activeIndex + direction;
    const targetTab = ROOT_TAB_ORDER[targetIndex];
    if (!targetTab) return;

    transitionInProgressRef.current = true;
    const canNavigate = navigateRef.current?.(targetTab, { validateOnly: true });
    if (canNavigate === false) {
      navigateRef.current?.(targetTab);
      returnToActive();
      return;
    }

    Animated.parallel([
      Animated.timing(trackX, {
        toValue: -targetIndex * pageStride,
        duration: Math.max(140, Math.min(220, ROOT_TAB_SWITCH_DURATION_MS - Math.abs(direction) * 18)),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      settleChrome(),
    ]).start(({ finished }) => {
      if (!finished) {
        returnToActive();
        return;
      }
      pendingIndexRef.current = targetIndex;
      const didNavigate = navigateRef.current?.(targetTab);
      if (didNavigate === false) {
        pendingIndexRef.current = null;
        returnToActive();
        return;
      }
      AccessibilityInfo.announceForAccessibility(`${ROOT_TAB_LABELS[targetTab]} tab`);
    });
  }, [activeIndex, pageStride, returnToActive, settleChrome, trackX]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (transitionInProgressRef.current || horizontalChildActiveRef.current) return false;
      const horizontalDistance = Math.abs(gesture.dx);
      const verticalDistance = Math.abs(gesture.dy);
      const direction = gesture.dx < 0 ? 1 : -1;
      const targetTab = ROOT_TAB_ORDER[activeIndex + direction];
      const shouldStart = Boolean(targetTab)
        && horizontalDistance > (Platform.OS === "android" ? 10 : 14)
        && horizontalDistance > verticalDistance * (Platform.OS === "android" ? 1.55 : 1.35);
      return shouldStart;
    },
    onPanResponderGrant: () => {
      trackX.stopAnimation();
      if (ROOT_TAB_CHROME_ENABLED) {
        pageChrome.stopAnimation();
        pageChrome.setValue(1);
      }
    },
    onPanResponderMove: (_, gesture) => {
      const direction = gesture.dx < 0 ? 1 : -1;
      const hasTarget = Boolean(ROOT_TAB_ORDER[activeIndex + direction]);
      const clampedDistance = Math.max(-pageStride, Math.min(pageStride, gesture.dx));
      const resistedDistance = hasTarget ? clampedDistance : clampedDistance * 0.18;
      trackX.setValue((-activeIndex * pageStride) + resistedDistance);
    },
    onPanResponderRelease: (_, gesture) => {
      const distanceThreshold = Math.min(92, Math.max(54, width * 0.16));
      const crossedDistance = Math.abs(gesture.dx) >= distanceThreshold;
      const quickFlick = Math.abs(gesture.vx) >= 0.55 && Math.abs(gesture.dx) >= 24;
      const direction = gesture.dx < 0 ? 1 : -1;
      const hasTarget = Boolean(ROOT_TAB_ORDER[activeIndex + direction]);
      if (!hasTarget || (!crossedDistance && !quickFlick)) {
        returnToActive();
        return;
      }
      navigateByDirection(direction);
    },
    onPanResponderTerminate: returnToActive,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  }), [activeIndex, navigateByDirection, pageChrome, pageStride, returnToActive, trackX, width]);

  const renderedTabs = mountedTabs;
  const pageCornerRadius = ROOT_TAB_CHROME_ENABLED
    ? pageChrome.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 28],
        extrapolate: "clamp",
      })
    : 0;

  return (
    <RootTabSwipeContext.Provider value={swipeBoundary}>
      <View style={s.swipePagerViewport}>
        <Animated.View
          style={[
            s.swipePagerTrack,
            {
              width: ROOT_TAB_ORDER.length * pageStride,
              height,
              transform: [{ translateX: trackX }],
            },
          ]}
        >
          {renderedTabs.map(tab => {
            const tabIndex = ROOT_TAB_ORDER.indexOf(tab);
            const isInteractive = tab === activeTab;
            return (
              <Animated.View
                key={tab}
                {...(isInteractive ? panResponder.panHandlers : {})}
                pointerEvents={isInteractive ? "auto" : "none"}
                accessibilityElementsHidden={!isInteractive || undefined}
                importantForAccessibility={!isInteractive ? "no-hide-descendants" : "auto"}
                style={[
                  s.swipePagerPage,
                  {
                    width,
                    height,
                    marginRight: tabIndex === ROOT_TAB_ORDER.length - 1 ? 0 : pageGap,
                    borderRadius: pageCornerRadius,
                  },
                ]}
                collapsable={false}
                renderToHardwareTextureAndroid={Platform.OS === "android"}
                needsOffscreenAlphaCompositing={Platform.OS === "android"}
              >
                {renderTab(tab, { isActive: tab === activeTab })}
              </Animated.View>
            );
          })}
        </Animated.View>
        <BottomNav
          persistent
          active={activeTab}
          onHome={stationaryNavActions.home}
          onCourses={stationaryNavActions.courses}
          onDownloads={stationaryNavActions.downloads}
          onAI={stationaryNavActions.ai}
          onProfile={stationaryNavActions.profile}
        />
      </View>
    </RootTabSwipeContext.Provider>
  );
}

// ── VideoItem ─────────────────────────────────────────────────────────────────
function VideoItem({ courseId, course, user, video: videoProp, videoId: videoIdProp, isActive, height, onComplete, onProgress, onEnded, onSettingsOpenChange, onExitFullscreen, initialTime = 0, localPath, suspendSurface = false }) {
  const [cloudLease, setCloudLease] = useState(null);
  const [cloudError, setCloudError] = useState('');
  const [cloudRetry, setCloudRetry] = useState(0);
  const cloudResume = useRef(0);
  const cloudLeaseRef = useRef(null);
  const sourceQueue = useRef(Promise.resolve());
  useEffect(() => {
    if (videoProp?.provider !== "aws_cloudfront" || !isActive) return;
    let disposed = false;
    let retryTimer = null;
    let renewTimer = null;
    const controller = new AbortController();
    const leaseKey = getPlaybackLeaseKey(courseId, videoProp._id, user?.sessionId);
    const applyLease = lease => {
      cloudLeaseRef.current = { key: leaseKey, lease };
      PLAYBACK_ACCESS_CACHE.set(leaseKey, lease);
      setCloudLease(lease);
      setCloudError("");
    };
    const scheduleRenew = lease => {
      clearTimeout(renewTimer);
      const renewIn = Math.max(15000, Number(lease?.expiresAt || 0) - Date.now() - PLAYBACK_ACCESS_MIN_VALID_MS);
      renewTimer = setTimeout(() => requestLease({ background: true }), renewIn);
    };
    const requestLease = async ({ background = false, attempt = 0 } = {}) => {
      try {
        const lease = await fetchPlaybackLease({ courseId, video: videoProp, user, signal: controller.signal });
        if (disposed) return;
        applyLease(lease);
        scheduleRenew(lease);
      } catch (error) {
        if (disposed) return;
        const wasCanceled = isFetchCancellation(error);
        if (wasCanceled && attempt < 2) {
          retryTimer = setTimeout(() => {
            requestLease({ background, attempt: attempt + 1 });
          }, 600 + (attempt * 900));
          return;
        }
        if (background && getCachedPlaybackLease(leaseKey, 5000)) return;
        setCloudError(wasCanceled ? "Video access is taking longer than expected. Tap retry." : (error.message || "Playback access unavailable."));
      }
    };
    const cachedLease = getCachedPlaybackLease(leaseKey);
    if (cachedLease) {
      applyLease(cachedLease);
      scheduleRenew(cachedLease);
    } else {
      setCloudLease(null);
      setCloudError("");
      requestLease();
    }
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(retryTimer);
      clearTimeout(renewTimer);
    };
  }, [courseId,videoProp?._id,videoProp?.provider,isActive,user?._id,user?.sessionId,cloudRetry]);
  const validCloudLease = cloudLeaseRef.current?.key === `${courseId}:${videoProp?._id}:${user?.sessionId}` ? cloudLease : null;
  const video = {...(videoProp || (videoIdProp ? {youtubeId:videoIdProp}:{})), ...(validCloudLease || {})};
  const nativeVideoUrl = video.provider === "aws_cloudfront" && !validCloudLease && !localPath
    ? "" : getNativeVideoUrl(video, localPath);
  const hasNativeVideo = !!nativeVideoUrl;
  const isOffline = !!localPath;
  const hasEmbeddableVideo = !!(
    video.bunnyGuid ||
    video.bunnyVideoId ||
    video.embedUrl ||
    (!isDirectMediaUrl(video.videoUrl) && video.videoUrl) ||
    video.youtubeId ||
    video.videoId
  );
  const canFallbackToEmbed = video.provider !== 'aws_cloudfront' && !isOffline && hasEmbeddableVideo;
  const preferEmbedPlayer = Platform.OS === "android" && !isOffline && hasEmbeddableVideo && video.provider !== "aws_cloudfront";
  const [nativePlaybackFailed, setNativePlaybackFailed] = useState(false);
  const isNativeVideo = hasNativeVideo && !preferEmbedPlayer && !(nativePlaybackFailed && canFallbackToEmbed);
  const isBunny = !isNativeVideo && !!(video.bunnyGuid || video.bunnyVideoId || video.videoUrl || video.embedUrl);
  const webViewRef = useRef(null);
  const seekBarWidth = useRef(0);
  const tapInfoRef = useRef({ count: 0, side: null, timer: null });
  const completionSentRef = useRef(false);
  const progressSentAtRef = useRef(0);
  const lastProgressFlushRef = useRef({ time: -1, duration: 0, at: 0 });
  const seekGuardRef = useRef({ until: 0, target: 0 });
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef(0);
  const initialSeekDoneRef = useRef(false);
  const autoPlayTimersRef = useRef([]);
  const sleepTimerRef = useRef(null);
  const sendCmdRef = useRef(() => {});
  const shouldBePlayingRef = useRef(isActive);
  const wasSurfaceSuspendedRef = useRef(suspendSurface);
  const lastProgressRef = useRef({ time: finiteSeconds(initialTime, 0), advancedAt: Date.now() });
  const latestProgressValueRef = useRef({ currentTime: finiteSeconds(initialTime, 0), duration: 0 });
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(isActive);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [surfaceResumeTime, setSurfaceResumeTime] = useState(finiteSeconds(initialTime, 0));
  const [qualities, setQualities] = useState([]);
  const [nativeVideoTracks, setNativeVideoTracks] = useState([]);
  const [currentQuality, setCurrentQuality] = useState("Auto");
  const [showSettings, setShowSettings] = useState(false);
  const [loopLesson, setLoopLesson] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [seekAnim, setSeekAnim] = useState(null);
  useEffect(() => {
    latestProgressValueRef.current = { currentTime, duration };
  }, [currentTime, duration]);
  useEffect(() => {
    onSettingsOpenChange?.(Boolean(isActive && showSettings));
    return () => onSettingsOpenChange?.(false);
  }, [isActive, onSettingsOpenChange, showSettings]);
  const nativeVideoSource = useMemo(() => (
    nativeVideoUrl ? { uri: nativeVideoUrl } : null
  ), [nativeVideoUrl]);
  const nativePlayer = useVideoPlayer(null, player => {
    player.loop = false;
    player.preservesPitch = true;
    player.timeUpdateEventInterval = VIDEO_TIME_UPDATE_INTERVAL;
  });
  const playbackStateRef = useRef(null);
  playbackStateRef.current = { isActive, isPlaying, isBuffering, isMuted, playbackRate, isEnded };
  const runNativePlayer = useCallback((operation) => {
    try {
      return operation(nativePlayer);
    } catch {
      return undefined;
    }
  }, [nativePlayer]);
  const pauseNativePlayer = useCallback(() => runNativePlayer(player => player.pause()), [runNativePlayer]);
  const playNativePlayer = useCallback(() => runNativePlayer(player => player.play()), [runNativePlayer]);
  const setNativeTime = useCallback((time) => runNativePlayer(player => { player.currentTime = time; }), [runNativePlayer]);
  const setNativeMuted = useCallback((muted) => runNativePlayer(player => { player.muted = muted; }), [runNativePlayer]);
  const setNativeRate = useCallback((rate) => runNativePlayer(player => { player.playbackRate = rate || 1; }), [runNativePlayer]);
  const clearAutoPlayTimers = useCallback(() => {
    autoPlayTimersRef.current.forEach(timer => clearTimeout(timer));
    autoPlayTimersRef.current = [];
  }, []);
  const queueAutoPlay = useCallback(() => {
    clearAutoPlayTimers();
    if (!isActive) return;
    shouldBePlayingRef.current = true;
    setIsEnded(false);
    if (playbackStateRef.current?.isPlaying && !playbackStateRef.current?.isBuffering) {
      setIsBuffering(false);
      return;
    }
    setIsPlaying(true);
    setIsBuffering(false);
    [0, 120].forEach(delay => {
      const timer = setTimeout(() => {
        if (!playbackStateRef.current?.isActive) return;
        if (playbackStateRef.current?.isPlaying && !playbackStateRef.current?.isBuffering) return;
        sendCmdRef.current("playVideo");
      }, delay);
      autoPlayTimersRef.current.push(timer);
    });
  }, [clearAutoPlayTimers, isActive]);
  const html = useMemo(() => {
    let provider = "youtube";
    let originalMedia = video?.youtubeId || video?.videoId || "";
    let finalUrl = `https://www.youtube.com/embed/${originalMedia}`;
    let nextHtml;
    const htmlInitialTime = finiteSeconds(surfaceResumeTime, initialTime);
    if (video.embedUrl || (!isDirectMediaUrl(video.videoUrl) && video.videoUrl)) {
      provider = "bunny-url";
      originalMedia = video.embedUrl || video.videoUrl;
      finalUrl = video.embedUrl || video.videoUrl;
      nextHtml = buildEmbedPlayerHtml(finalUrl, htmlInitialTime);
    } else if (video.bunnyGuid || video.bunnyVideoId) {
      provider = "bunny-guid";
      originalMedia = video.bunnyGuid || video.bunnyVideoId;
      finalUrl = `https://iframe.mediadelivery.net/embed/${video?.bunnyLibraryId || "675520"}/${originalMedia}`;
      nextHtml = buildEmbedPlayerHtml(finalUrl, htmlInitialTime);
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
  }, [video?.youtubeId, video?.videoId, video?.bunnyGuid, video?.bunnyVideoId, video?.bunnyLibraryId, video?.videoUrl, video?.embedUrl, initialTime, surfaceResumeTime]);

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
    setIsBuffering(false);
    setSurfaceResumeTime(startAt);
    setCurrentQuality(AUTO_QUALITY_LABEL);
    setQualities([]);
    setNativeVideoTracks([]);
    shouldBePlayingRef.current = isActive;
    lastProgressRef.current = { time: startAt, advancedAt: Date.now() };
    setNativePlaybackFailed(false);
  }, [video?.youtubeId, video?.videoId, video?.bunnyGuid, video?.bunnyVideoId, video?._id, video?.videoUrl, video?.embedUrl, localPath, initialTime]);

  useEffect(() => {
    let cancelled = false;
    if (!nativeVideoSource) {
      pauseNativePlayer();
      sourceQueue.current = sourceQueue.current.catch(() => {}).then(() => {
        if (!cancelled) return runNativePlayer(player => player.replaceAsync(null));
      }).catch(() => { /* Player may have been released while leaving the screen. */ });
      return () => { cancelled = true; };
    }
    sourceQueue.current = sourceQueue.current.catch(() => {}).then(async () => {
      if (cancelled) return;
      try {
        pauseNativePlayer();
        await runNativePlayer(player => player.replaceAsync(nativeVideoSource));
        if (cancelled) return;
        const latest = playbackStateRef.current;
        runNativePlayer(player => {
          player.muted = latest.isMuted;
          player.playbackRate = latest.playbackRate || 1;
          player.loop = false;
          player.preservesPitch = true;
          player.timeUpdateEventInterval = VIDEO_TIME_UPDATE_INTERVAL;
        });
        const startAt = video.provider === 'aws_cloudfront' ? Math.max(cloudResume.current,finiteSeconds(initialTime,0)) : finiteSeconds(initialTime, 0);
        if (startAt > 0) setNativeTime(startAt);
        if (latest.isActive) {
          shouldBePlayingRef.current = true;
          setIsPlaying(true);
          setIsBuffering(false);
          playNativePlayer();
        }
      } catch (error) {
        if (!cancelled && video.provider === 'aws_cloudfront') setCloudError('Unable to play HLS. Check connectivity and retry.');
        if (!cancelled && canFallbackToEmbed) {
          setNativePlaybackFailed(true);
          setDuration(0);
          setCurrentTime(0);
          setIsPlaying(false);
        }
      }
    });
    return () => {
      cancelled = true;
      pauseNativePlayer();
    };
  }, [nativeVideoSource, initialTime, canFallbackToEmbed, pauseNativePlayer, playNativePlayer, runNativePlayer, setNativeTime]);

  useEffect(() => {
    shouldBePlayingRef.current = isActive;
    setIsPlaying(isActive);
    setIsBuffering(isActive);
  }, [isActive]);

  useEffect(() => {
    setNativeMuted(isMuted);
    setNativeRate(playbackRate);
    runNativePlayer(player => { player.loop = false; });
  }, [isMuted, playbackRate, loopLesson, runNativePlayer, setNativeMuted, setNativeRate]);

  useEffect(() => {
    if (isActive && isNativeVideo && isPlaying) playNativePlayer();
    else pauseNativePlayer();
  }, [isActive, isNativeVideo, isPlaying, pauseNativePlayer, playNativePlayer]);

  useEventListener(nativePlayer, "sourceLoad", ({ duration: loadedDuration }) => {
    if (!isNativeVideo) return;
    const tracks = nativePlayer.availableVideoTracks || [];
    if (tracks.length) setNativeVideoTracks(tracks);
    const dur = finiteSeconds(loadedDuration, nativePlayer.duration || duration);
    if (dur > 0) setDuration(dur);
    const startAt = finiteSeconds(initialTime, 0);
    if (!initialSeekDoneRef.current && startAt > 0 && dur > 0) {
      initialSeekDoneRef.current = true;
      const nextTime = clampSeconds(startAt, dur);
      dragTargetRef.current = nextTime;
      seekGuardRef.current = { until: Date.now() + 3000, target: nextTime };
      setCurrentTime(nextTime);
      setNativeTime(nextTime);
    }
    if (isActive) {
      setIsPlaying(true);
      playNativePlayer();
    }
  });

  useEventListener(nativePlayer, "availableVideoTracksChange", ({ availableVideoTracks }) => {
    if (!isNativeVideo) return;
    const tracks = availableVideoTracks || nativePlayer.availableVideoTracks || [];
    if (tracks.length) setNativeVideoTracks(tracks);
  });

  useEventListener(nativePlayer, "videoTrackChange", ({ videoTrack }) => {
    if (!isNativeVideo || currentQuality === AUTO_QUALITY_LABEL) return;
    const label = getVideoTrackQualityLabel(videoTrack);
    if (FALLBACK_QUALITY_OPTIONS.includes(label)) setCurrentQuality(label);
  });

  useEventListener(nativePlayer, "timeUpdate", ({ currentTime: nextTime }) => {
    const nativeDuration = runNativePlayer(player => player.duration);
    const nativePlaying = runNativePlayer(player => player.playing);
    handleNativeProgress(nextTime, nativeDuration, nativePlaying);
  });

  useEventListener(nativePlayer, "playingChange", ({ isPlaying: nextPlaying }) => {
    if (!isNativeVideo) return;
    setIsPlaying(nextPlaying);
    if (nextPlaying) setIsBuffering(false);
    else setIsBuffering(Boolean(isActive && shouldBePlayingRef.current && !playbackStateRef.current?.isEnded));
  });

  useEventListener(nativePlayer, "playToEnd", () => {
    if (!isNativeVideo) return;
    const dur = finiteSeconds(nativePlayer.duration, duration);
    if (dur > 0) setCurrentTime(dur);
    if (loopLesson) {
      flushProgress(dur, dur, true);
      seekGuardRef.current = { until: Date.now() + 1000, target: 0 };
      setNativeTime(0);
      setCurrentTime(0);
      setIsEnded(false);
      setIsPlaying(true);
      setIsBuffering(false);
      shouldBePlayingRef.current = true;
      playNativePlayer();
      return;
    }
    shouldBePlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    setIsEnded(true);
    flushProgress(dur, dur, true);
    markCompleteOnce();
    onEnded?.();
  });

  useEventListener(nativePlayer, "statusChange", ({ status }) => {
    if (status === "loading" && isNativeVideo && isActive && shouldBePlayingRef.current) {
      setIsBuffering(true);
      return;
    }
    if (status === "readyToPlay" && isNativeVideo && isActive) {
      setIsEnded(false);
      setIsPlaying(true);
      setIsBuffering(false);
      playNativePlayer();
      return;
    }
    if (status === "error") setIsBuffering(false);
    if (status === "error" && isNativeVideo && canFallbackToEmbed) {
      setIsBuffering(false);
      setNativePlaybackFailed(true);
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  });

  function sendCmd(func, args = []) {
    if (isNativeVideo) {
      if (func === "playVideo") playNativePlayer();
      else if (func === "pauseVideo") pauseNativePlayer();
      else if (func === "seekTo") setNativeTime(clampSeconds(args[0], duration));
      else if (func === "seekAndPlay") {
        setNativeTime(clampSeconds(args[0], duration));
        playNativePlayer();
      }
      else if (func === "setPlaybackRate") setNativeRate(args[0] || 1);
      else if (func === "mute") setNativeMuted(true);
      else if (func === "unMute") setNativeMuted(false);
      return;
    }
    if (isBunny) {
      const map = { playVideo:"bunnyPlay()", pauseVideo:"bunnyPause()", mute:"bunnyMute(true)", unMute:"bunnyMute(false)" };
      const call = func === "setPlaybackRate"
        ? `bunnySpeed(${args[0]})`
        : func === "setQuality"
          ? `bunnyQuality(${JSON.stringify(args[0] || "auto")})`
        : func === "seekAndPlay"
          ? `bunnySeekAndPlay(${args[0]})`
          : func === "seekTo"
            ? `bunnySeek(${args[0]})`
            : map[func];
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
  sendCmdRef.current = sendCmd;

  useEffect(() => {
    if (isActive) {
      queueAutoPlay();
    } else {
      flushProgress(undefined, undefined, true);
      shouldBePlayingRef.current = false;
      clearAutoPlayTimers();
      sendCmd("pauseVideo");
      setIsPlaying(false);
      setIsBuffering(false);
    }
  }, [isActive, isNativeVideo, isBunny, queueAutoPlay, clearAutoPlayTimers]);

  useEffect(() => {
    if (!suspendSurface) return;
    clearAutoPlayTimers();
    shouldBePlayingRef.current = false;
    setSurfaceResumeTime(latestProgressValueRef.current.currentTime);
    flushProgress(undefined, undefined, true);
    sendCmd("pauseVideo");
    setIsPlaying(false);
    setIsBuffering(false);
  }, [clearAutoPlayTimers, suspendSurface]);

  useEffect(() => {
    const wasSuspended = wasSurfaceSuspendedRef.current;
    wasSurfaceSuspendedRef.current = suspendSurface;
    if (!wasSuspended || suspendSurface) return;
    setSurfaceRevision(value => value + 1);
    if (!isActive) return;
    const resumeAt = latestProgressValueRef.current.currentTime;
    const timer = setTimeout(() => {
      if (!playbackStateRef.current?.isActive) return;
      if (resumeAt > 0) setNativeTime(resumeAt);
      queueAutoPlay();
    }, 40);
    return () => clearTimeout(timer);
  }, [isActive, queueAutoPlay, setNativeTime, suspendSurface]);

  useEffect(() => {
    if (!isNativeVideo) return;
    sendCmd(isMuted ? "mute" : "unMute");
  }, [isMuted, isNativeVideo]);

  useEffect(() => {
    if (!isNativeVideo) return;
    sendCmd("setPlaybackRate", [playbackRate]);
  }, [playbackRate, isNativeVideo]);

  useEffect(() => () => {
    const latest = latestProgressValueRef.current;
    if (latest.duration > 0) onProgress?.(latest.currentTime, latest.duration);
    const timer = tapInfoRef.current.timer;
    if (timer) clearTimeout(timer);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    clearAutoPlayTimers();
  }, [clearAutoPlayTimers, onProgress]);

  function flushProgress(nextTime = currentTime, nextDuration = duration, force = false) {
    const dur = finiteSeconds(nextDuration, duration);
    if (dur <= 0) return;
    const ct = clampSeconds(finiteSeconds(nextTime, currentTime), dur);
    const now = Date.now();
    const previous = lastProgressFlushRef.current;
    const recentlyFlushed = Math.abs(previous.time - ct) < 0.25 && Math.abs(previous.duration - dur) < 0.25 && now - previous.at < 1500;
    if (!force && recentlyFlushed) return;
    lastProgressFlushRef.current = { time: ct, duration: dur, at: now };
    progressSentAtRef.current = now;
    onProgress?.(ct, dur);
  }

  function markCompleteOnce() {
    if (completionSentRef.current) return;
    completionSentRef.current = true; onComplete?.();
  }

  function handleNativeProgress(nextTime, nextDuration, nextPlaying) {
    if (!isNativeVideo || !isActive) return;
    const dur = finiteSeconds(nextDuration, duration);
    const ct = clampSeconds(nextTime, dur);
    const now = Date.now();
    const lastProgress = lastProgressRef.current;
    if (Math.abs(ct - lastProgress.time) > 0.05) {
      lastProgressRef.current = { time: ct, advancedAt: now };
      if (shouldBePlayingRef.current) setIsBuffering(false);
    } else if (shouldBePlayingRef.current && !nextPlaying && now - lastProgress.advancedAt > 1200) {
      setIsBuffering(true);
    }
    if (!initialSeekDoneRef.current && initialTime > 0 && dur > 0) {
      initialSeekDoneRef.current = true;
      const startAt = clampSeconds(initialTime, dur);
      dragTargetRef.current = startAt;
      seekGuardRef.current = { until: Date.now() + 3000, target: startAt };
      setCurrentTime(startAt);
      setNativeTime(startAt);
      return;
    }
    if (isDraggingRef.current) {
      if (dur > 0) setDuration(dur);
      setIsPlaying(!!nextPlaying);
      return;
    }
    if (Date.now() < seekGuardRef.current.until && Math.abs(ct - seekGuardRef.current.target) > 1.5) {
      if (dur > 0) setDuration(dur);
      setIsPlaying(!!nextPlaying);
      return;
    }
    setCurrentTime(ct);
    if (dur > 0) setDuration(dur);
    setIsPlaying(!!nextPlaying);
    if (nextPlaying) setIsBuffering(false);
    else if (shouldBePlayingRef.current && !(dur > 0 && ct >= dur - 0.25)) setIsBuffering(true);
    if (dur > 0 && ct >= dur - 0.25 && !nextPlaying) {
      if (loopLesson) {
        flushProgress(ct, dur, true);
        seekGuardRef.current = { until: Date.now() + 1000, target: 0 };
        setCurrentTime(0);
        setNativeTime(0);
        shouldBePlayingRef.current = true;
        setIsEnded(false);
        setIsPlaying(true);
        setIsBuffering(false);
        playNativePlayer();
        return;
      }
      shouldBePlayingRef.current = false;
      setIsBuffering(false);
      setIsEnded(true); flushProgress(ct, dur, true); markCompleteOnce(); onEnded?.();
    } else {
      setIsEnded(false);
    }
    if (dur > 0 && ct / dur >= VIDEO_COMPLETE_THRESHOLD) markCompleteOnce();
    if (dur > 0 && now - progressSentAtRef.current >= 5000) {
      flushProgress(ct, dur, true);
    }
  }

  function handleMsg(e) {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (d.type === "ready") {
        if (isActive) {
          if (initialTime > 0) sendCmd("seekTo", [initialTime, true]);
          queueAutoPlay();
        } else {
          sendCmd("pauseVideo");
        }
        return;
      }
      if (d.type === "stateChange") {
        if (d.playerState === 0) {
          if (loopLesson) {
            flushProgress(duration || currentTime, duration, true);
            shouldBePlayingRef.current = true;
            seekGuardRef.current = { until: Date.now() + 1000, target: 0 };
            setCurrentTime(0);
            sendCmd("seekAndPlay", [0, true]);
            setIsPlaying(true);
            setIsBuffering(false);
            setIsEnded(false);
            return;
          }
          shouldBePlayingRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          setIsEnded(true);
          return;
        }
        if (d.playerState === 3) {
          setIsPlaying(false);
          setIsBuffering(Boolean(isActive && shouldBePlayingRef.current));
          return;
        }
        if (typeof d.playing === "boolean") {
          setIsPlaying(d.playing);
          setIsBuffering(d.playing ? false : Boolean(isActive && shouldBePlayingRef.current));
        }
        return;
      }
      if (d.type === "qualities") { setQualities(normalizeVideoQualityOptions(d.qualities || [])); return; }
      if (d.type === "qualityChange") {
        setCurrentQuality(String(d.quality || "").toLowerCase() === "auto" ? AUTO_QUALITY_LABEL : String(d.quality || AUTO_QUALITY_LABEL));
        return;
      }
      if (d.type === "timeUpdate") {
        const nextDuration = finiteSeconds(d.duration, duration);
        const nextTime = clampSeconds(d.currentTime, nextDuration);
        const now = Date.now();
        const lastProgress = lastProgressRef.current;
        const progressed = Math.abs(nextTime - lastProgress.time) > 0.05;
        if (progressed) {
          lastProgressRef.current = { time: nextTime, advancedAt: now };
          if (shouldBePlayingRef.current) {
            setIsPlaying(true);
            setIsBuffering(false);
          }
        } else if (shouldBePlayingRef.current && isActive && now - lastProgress.advancedAt > 1200) {
          setIsPlaying(false);
          setIsBuffering(true);
        }
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
        if (d.playerState === 0) {
          if (loopLesson) {
            flushProgress(nextDuration || nextTime, nextDuration, true);
            shouldBePlayingRef.current = true;
            seekGuardRef.current = { until: Date.now() + 1000, target: 0 };
            setCurrentTime(0);
            sendCmd("seekAndPlay", [0, true]);
            setIsPlaying(true);
            setIsBuffering(false);
            setIsEnded(false);
            return;
          }
          shouldBePlayingRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          setIsEnded(true);
          flushProgress(nextTime, nextDuration, true);
          markCompleteOnce();
          onEnded?.();
        } else if (d.playerState === 1) {
          setIsPlaying(true);
          setIsBuffering(false);
          setIsEnded(false);
        } else if (d.playerState === 3) {
          setIsPlaying(false);
          setIsBuffering(Boolean(isActive && shouldBePlayingRef.current));
        } else if (d.playerState === 2 || d.playerState === 5) {
          setIsPlaying(false);
          setIsBuffering(Boolean(isActive && shouldBePlayingRef.current));
        }
        if (nextDuration > 0 && nextTime / nextDuration >= VIDEO_COMPLETE_THRESHOLD) markCompleteOnce();
        if (nextDuration > 0 && now - progressSentAtRef.current >= 5000) {
          flushProgress(nextTime, nextDuration, true);
        }
      }
    } catch {}
  }

  function togglePlay() {
    const shouldPause = shouldBePlayingRef.current && (isPlaying || isBuffering);
    shouldBePlayingRef.current = !shouldPause;
    setIsBuffering(false);
    clearAutoPlayTimers();
    if (shouldPause) {
      flushProgress(undefined, undefined, true);
    }
    sendCmd(shouldPause ? "pauseVideo" : "playVideo");
    setIsPlaying(!shouldPause);
  }
  function toggleMute() { sendCmd(isMuted ? "unMute" : "mute"); setIsMuted(m => !m); }
  function selectSpeed(r) { sendCmd("setPlaybackRate", [r]); setPlaybackRate(r); }
  function selectNativeQuality(q) {
    const resumeAt = latestProgressValueRef.current.currentTime;
    const shouldResume = Boolean(isActive && shouldBePlayingRef.current);
    const nextSource = q === AUTO_QUALITY_LABEL
      ? nativeVideoSource
      : (() => {
          const track = findVideoTrackForQuality(nativeVideoTracks, q);
          return track?.url ? { uri: track.url } : null;
        })();
    if (!nextSource) return;
    setCurrentQuality(q);
    setIsBuffering(shouldResume);
    sourceQueue.current = sourceQueue.current.catch(() => {}).then(async () => {
      try {
        pauseNativePlayer();
        await runNativePlayer(player => player.replaceAsync(nextSource));
        runNativePlayer(player => {
          player.muted = playbackStateRef.current?.isMuted;
          player.playbackRate = playbackStateRef.current?.playbackRate || 1;
          player.loop = false;
          player.preservesPitch = true;
          player.timeUpdateEventInterval = VIDEO_TIME_UPDATE_INTERVAL;
        });
        if (resumeAt > 0) setNativeTime(resumeAt);
        if (shouldResume) playNativePlayer();
      } catch {
        setCurrentQuality(AUTO_QUALITY_LABEL);
      } finally {
        setIsBuffering(false);
      }
    });
  }
  function selectQuality(q) {
    if (isNativeVideo) {
      selectNativeQuality(q);
      return;
    }
    const nextQuality = q === AUTO_QUALITY_LABEL ? "auto" : q;
    sendCmd("setQuality", [nextQuality]);
    setCurrentQuality(q);
  }
  function setSleepTimer(minutes) {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setSleepMinutes(minutes);
    if (!minutes) return;
    sleepTimerRef.current = setTimeout(() => {
      shouldBePlayingRef.current = false;
      flushProgress(undefined, undefined, true);
      sendCmd("pauseVideo");
      setIsPlaying(false);
      setIsBuffering(false);
      setSleepMinutes(0);
    }, minutes * 60000);
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
    flushProgress(t, duration, true);
    seekGuardRef.current = { until: Date.now() + 3000, target: t };
    setCurrentTime(t);
    if (duration <= 0 || t < duration - 0.5) setIsEnded(false);
    if (isActive) {
      shouldBePlayingRef.current = true;
      setIsPlaying(true);
      setIsBuffering(false);
      clearAutoPlayTimers();
      sendCmd("seekAndPlay", [t, true]);
    } else {
      sendCmd("seekTo", [t, true]);
    }
  }

  function restart() {
    shouldBePlayingRef.current = true;
    setIsBuffering(true);
    sendCmd("seekTo", [0, true]); sendCmd("playVideo");
    setIsEnded(false); setIsPlaying(true); setCurrentTime(0);
  }

  function seekBy(secs) {
    const t = clampSeconds(currentTime + secs, duration);
    seekGuardRef.current = { until: Date.now() + 3000, target: t };
    if (duration <= 0 || t < duration - 0.5) setIsEnded(false);
    setCurrentTime(t);
    if (isActive) {
      shouldBePlayingRef.current = true;
      setIsPlaying(true);
      setIsBuffering(false);
      clearAutoPlayTimers();
      sendCmd("seekAndPlay", [t, true]);
    } else {
      sendCmd("seekTo", [t, true]);
    }
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
    if (showSettings) { setShowSettings(false); return; }
    togglePlay();
  }

  function handleExitFullscreen() {
    setShowSettings(false);
    if (isActive) onExitFullscreen?.();
  }

  if (video.provider === 'aws_cloudfront' && currentTime > 0) cloudResume.current = currentTime;
  if (video.provider === 'aws_cloudfront' && (!validCloudLease || cloudError)) return (
    <View style={[s.player, { height, justifyContent: "center", alignItems: "center" }]}>
      {!cloudError && <ActivityIndicator size="large" color="#fff" />}
      <Text style={{ color: "#fff", padding: 20, textAlign: "center" }}>{cloudError || "Preparing secure playback..."}</Text>
      {!!cloudError && (
        <TouchableOpacity onPress={() => { setCloudError(""); setCloudRetry(n => n + 1); }} accessibilityRole="button" accessibilityLabel="Retry playback">
          <Text style={{ color: "#e0ac45" }}>Retry playback</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const qualityOptions = [AUTO_QUALITY_LABEL, ...FALLBACK_QUALITY_OPTIONS];
  const showLiveSurface = !suspendSurface;
  const suspendedPosterUrl = suspendSurface ? getLessonThumbnailUrl(video, course) : "";

  return (
    <View style={[s.player, { height }]}>
      {!showLiveSurface ? (
        <View style={s.suspendedVideoSurface} pointerEvents="none">
          {suspendedPosterUrl ? (
            <Image source={{ uri: suspendedPosterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={Platform.OS === "android" ? 1 : 2} />
          ) : course ? (
            <CourseThumbnailImage course={course} />
          ) : null}
          <View style={s.suspendedVideoScrim} />
        </View>
      ) : isNativeVideo ? (
        <VideoView
          key={`native-video-${surfaceRevision}`}
          player={nativePlayer}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          surfaceType="textureView"
          nativeControls={false}
          allowsPictureInPicture={false}
          playsInline
        />
      ) : (
        <WebView
          ref={webViewRef}
          allowsInlineMediaPlayback allowsFullscreenVideo={false}
          domStorageEnabled javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          onLoadEnd={() => { setTimeout(() => isActive ? queueAutoPlay() : sendCmd("pauseVideo"), 300); }}
          onMessage={handleMsg}
          originWhitelist={["*"]} thirdPartyCookiesEnabled
          source={{ html, baseUrl: PLAYER_ORIGIN }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {showLiveSurface && isBuffering && !isEnded ? (
        <View
          style={s.pauseOverlay}
          pointerEvents="none"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Buffering video"
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : showLiveSurface && !isPlaying && !isEnded ? (
        <View style={s.pauseOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.85)" />
        </View>
      ) : null}
      {isEnded ? (
        <TouchableOpacity onPress={restart} style={s.restartOverlay} accessibilityRole="button" accessibilityLabel="Replay lesson">
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
            accessibilityLabel={isPlaying || isBuffering ? "Pause video" : "Play video"}
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
      {showSettings && (
        <View style={s.playerSettingsPanel}>
          <View style={s.playerSettingsHeader}>
            <Text style={s.playerSettingsTitle}>Playback settings</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)} style={s.playerSettingsClose} accessibilityRole="button" accessibilityLabel="Close playback settings">
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.playerSettingsScroll} contentContainerStyle={s.playerSettingsScrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.playerSettingsSection}>
            <Text style={s.playerSettingsLabel}>Playback speed</Text>
            <View style={s.playerSettingsOptions}>
              {SPEEDS.map(r => {
                const label = r === 1 ? "Normal" : `${r}×`;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => selectSpeed(r)}
                    style={[s.playerSettingsOption, playbackRate === r && s.playerSettingsOptionActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set playback speed to ${label}`}
                    accessibilityState={{ selected: playbackRate === r }}
                  >
                    <Text style={[s.playerSettingsOptionText, playbackRate === r && s.playerSettingsOptionTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={s.playerSettingsSection}>
            <Text style={s.playerSettingsLabel}>Quality</Text>
            <View style={s.playerSettingsOptions}>
              {qualityOptions.map(q => (
                <TouchableOpacity
                  key={q}
                  onPress={() => selectQuality(q)}
                  style={[s.playerSettingsOption, currentQuality === q && s.playerSettingsOptionActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Set video quality to ${q}`}
                  accessibilityState={{ selected: currentQuality === q }}
                >
                  <Text style={[s.playerSettingsOptionText, currentQuality === q && s.playerSettingsOptionTextActive]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[s.playerSettingsRow, s.playerSettingsSection]}>
            <Text style={s.playerSettingsLabel}>Loop lesson</Text>
            <TouchableOpacity
              onPress={() => setLoopLesson(value => !value)}
              style={[s.playerSwitch, loopLesson && s.playerSwitchActive]}
              accessibilityRole="switch"
              accessibilityState={{ checked: loopLesson }}
              accessibilityLabel="Loop lesson"
            >
              <View style={[s.playerSwitchThumb, loopLesson && s.playerSwitchThumbActive]} />
            </TouchableOpacity>
          </View>
          <View style={[s.playerSettingsSection, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={s.playerSettingsLabel}>Sleep timer</Text>
            <View style={s.playerSettingsOptions}>
              {[0, 15, 30, 45, 60].map(minutes => {
                const label = minutes ? `${minutes} min` : "Off";
                return (
                  <TouchableOpacity
                    key={minutes}
                    onPress={() => setSleepTimer(minutes)}
                    style={[s.playerSettingsOption, sleepMinutes === minutes && s.playerSettingsOptionActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sleep timer ${label}`}
                    accessibilityState={{ selected: sleepMinutes === minutes }}
                  >
                    <Text style={[s.playerSettingsOptionText, sleepMinutes === minutes && s.playerSettingsOptionTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          </ScrollView>
        </View>
      )}
      {isOffline && (
        <View style={s.offlineBadge} pointerEvents="none">
          <Ionicons name="arrow-down-circle" size={11} color="#fff" />
          <Text style={s.offlineBadgeText}>Offline</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={toggleMute}
        style={s.muteButton}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
      >
        <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
      </TouchableOpacity>
      {!isEnded && !isBuffering && (
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
      <TouchableOpacity
        onPress={() => setShowSettings(value => !value)}
        style={[s.playerSettingsButton, showSettings && s.playerSettingsButtonActive]}
        accessibilityRole="button"
        accessibilityLabel="Playback settings"
        accessibilityState={{ expanded: showSettings }}
      >
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleExitFullscreen}
        style={s.playerExpandButton}
        accessibilityRole="button"
        accessibilityLabel="Exit full screen player"
      >
        <Ionicons name="contract-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <View
        style={s.timeline}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Video progress"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, Math.round(duration)),
          now: Math.max(0, Math.round(currentTime)),
          text: `${formatTime(currentTime)} of ${formatTime(duration)}`,
        }}
        accessibilityActions={[
          { name: "increment", label: "Forward 10 seconds" },
          { name: "decrement", label: "Rewind 10 seconds" },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "increment") seekBy(10);
          if (nativeEvent.actionName === "decrement") seekBy(-10);
        }}
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
function ReelsScreen({ courseId, course, initialIndex, initialTime, onBack, onReportProblem, onGoToDownloads, onDownload, user, session, onVideoComplete, onVideoProgress, downloads, preloadedVideos }) {
  const { width: viewportWidth } = useWindowDimensions();
  const [videos, setVideos] = useState(preloadedVideos || []);
  const [loading, setLoading] = useState(!preloadedVideos);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex ?? 0);
  const [listHeight, setListHeight] = useState(Dimensions.get("window").height);
  const [showDescription, setShowDescription] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showLectures, setShowLectures] = useState(false);
  const [lecturePage, setLecturePage] = useState(0);
  const [showCourseAi, setShowCourseAi] = useState(false);
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState(false);
  const [courseAiInput, setCourseAiInput] = useState("");
  const [, refreshCourseAi] = useState(0);
  const courseAiMounted = useRef(false);
  useEffect(() => {
    courseAiMounted.current = true;
    return () => { courseAiMounted.current = false; };
  }, []);
  const courseAiScrollRef = useRef(null);
  const vcRef = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 120 });
  const flatListRef = useRef(null);

  const activeVideo = videos[activeIndex];
  const courseAiKey = chatKey(user?._id, user?.sessionId, courseId, activeVideo?._id || activeVideo?.id || activeIndex);
  const courseAiEntry = readChat(courseAiKey, [
    { role: "assistant", content: AI_FEATURE_ENABLED
      ? "Ask me to explain this video, summarize key points, or help with doubts from the lesson."
      : "AI is paused for now." },
    ...(DEV_UI_QA_ENABLED ? UI_QA_AI_MESSAGES : []),
  ]);
  const courseAiMessages = courseAiEntry.messages;
  const courseAiLoading = courseAiEntry.pending;
  function updateCourseAi(messages, pending = courseAiEntry.pending) {
    updateChat(courseAiKey, courseAiEntry, messages, pending);
    if (courseAiMounted.current) refreshCourseAi(value => value + 1);
  }
  const activeTitle = activeVideo?.title || "";
  const activeDescription = plainCourseDescription(getVideoDescription(activeVideo)) || "No description available.";
  const activeNotes = getVideoNotes(activeVideo);
  const activePrompts = getVideoPrompts(activeVideo);
  const activeResources = getVideoResources(activeVideo);
  const hasSeparateNotes = !!activeNotes && activeNotes !== activeDescription;
  const activeLessonNumber = Math.min(videos.length, Math.max(1, activeIndex + 1));
  const activeLessonLabel = videos.length ? `Lecture ${activeLessonNumber}/${videos.length}` : "Lecture";
  const activeSummary = activeDescription === "No description available." ? "" : activeDescription;
  const activeShareUrl = `${WEB_APP_BASE}/videos?courseId=${encodeURIComponent(courseId)}`;
  const activeBunnyGuid = getBunnyGuid(activeVideo);
  const activeDownload = activeBunnyGuid ? downloads?.[activeBunnyGuid] : null;
  const activeDownloadStatus = activeDownload?.status || "";
  const activeDownloadBusy = activeDownloadStatus === "downloading";
  const activeDownloadDone = activeDownloadStatus === "done";
  const activeDownloadLabel = activeDownloadBusy ? "Downloading" : activeDownloadDone ? "Saved" : "Download";
  const lecturePageSize = 20;
  const lectureRanges = useMemo(() => {
    const rangeCount = Math.max(1, Math.ceil(videos.length / lecturePageSize));
    return Array.from({ length: rangeCount }, (_, page) => {
      const start = page * lecturePageSize;
      return { start, end: Math.min(videos.length, start + lecturePageSize) };
    });
  }, [videos.length]);
  const visibleLectureRange = lectureRanges[Math.min(lecturePage, lectureRanges.length - 1)] || { start: 0, end: videos.length };
  const visibleLectureVideos = videos.slice(visibleLectureRange.start, visibleLectureRange.end);
  const lectureSheetWidth = Math.min(Math.max(viewportWidth - 28, 300), 420);
  const lectureTileWidth = Math.floor((lectureSheetWidth - 60) / 5);
  const lectureTileHeight = Math.max(40, Math.round(lectureTileWidth * 0.72));
  const videoUiOverlayOpen = showCourseAi || showDescription || showNotes || showLectures;
  const closeCourseAi = useCallback(() => {
    Keyboard.dismiss();
    setShowCourseAi(false);
  }, []);
  const goToLecture = useCallback((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= videos.length) return;
    setShowLectures(false);
    setShowNotes(false);
    setShowDescription(false);
    setPlayerSettingsOpen(false);
    setActiveIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, [videos.length]);
  const reportActiveLesson = useCallback(() => {
    setShowLectures(false);
    setShowNotes(false);
    setShowDescription(false);
    setShowCourseAi(false);
    setPlayerSettingsOpen(false);
    const lessonId = activeVideo?._id || activeVideo?.id || activeIndex + 1;
    onReportProblem?.(`courses/${courseId}/lectures/${lessonId}`);
  }, [activeIndex, activeVideo?._id, activeVideo?.id, courseId, onReportProblem]);

  useEffect(() => {
    if (!user?._id || !user?.sessionId || !videos.length) return;
    [activeIndex + 1, activeIndex + 2].forEach(index => {
      const video = videos[index];
      if (video?.provider !== "aws_cloudfront" || !video?._id) return;
      const leaseKey = getPlaybackLeaseKey(courseId, video._id, user.sessionId);
      if (getCachedPlaybackLease(leaseKey)) return;
      fetchPlaybackLease({ courseId, video, user, timeoutMs: PLAYBACK_ACCESS_TIMEOUT_MS + 15000 })
        .then(lease => {
          PLAYBACK_ACCESS_CACHE.set(leaseKey, lease);
        })
        .catch(() => {});
    });
  }, [activeIndex, courseId, user?._id, user?.sessionId, videos]);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync(PROTECTED_VIDEO_CAPTURE_KEY).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(PROTECTED_VIDEO_CAPTURE_KEY).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (preloadedVideos) return; // already have videos, skip fetch
    if (!user?._id || !user?.sessionId) { setError("Subscription required."); setLoading(false); return; }
    session.requestJson(`/api/courses/${courseId}/videos`)
      .then(d => { setVideos(d.videos || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [courseId, session, user?._id, user?.sessionId]);

  useEffect(() => {
    setCourseAiInput("");
    setShowNotes(false);
    setShowLectures(false);
    setPlayerSettingsOpen(false);
  }, [courseAiKey]);

  useEffect(() => {
    if (showLectures) setLecturePage(Math.floor(activeIndex / lecturePageSize));
  }, [activeIndex, showLectures]);

  const onViewable = useCallback(({ viewableItems }) => {
    const visible = viewableItems.find(item => item.isViewable && Number.isInteger(item.index));
    if (visible) setActiveIndex(visible.index);
  }, []);

  async function shareActiveLesson() {
    try {
      await Share.share({
        title: activeTitle || "Skillomate lecture",
        message: `${activeTitle || "Skillomate lecture"}\n${activeShareUrl}`,
        url: activeShareUrl,
      });
    } catch {}
  }

  function downloadActiveLesson() {
    if (!activeVideo) return;
    if (!activeBunnyGuid) {
      Alert.alert("Download unavailable", "This lesson is not available for offline download.");
      return;
    }
    if (!hasCourseAccess(user)) {
      Alert.alert("Subscription Required", "Upgrade your plan to download videos for offline viewing.");
      return;
    }
    if (activeDownloadDone) {
      Alert.alert("Downloaded", "This video is already saved offline.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Downloads", onPress: onGoToDownloads },
      ]);
      return;
    }
    if (!activeDownloadBusy) onDownload?.(activeVideo, courseId, course?.title);
  }

  async function sendCourseAiMessage(promptText = courseAiInput) {
    const question = promptText.trim();
    if (!question || courseAiEntry.pending) return;
    if (!AI_FEATURE_ENABLED) {
      updateCourseAi([...courseAiEntry.messages, { role: "assistant", content: "AI is paused for now." }]);
      return;
    }
    if (!user?._id || !user?.sessionId) {
      updateCourseAi([...courseAiEntry.messages, { role: "assistant", content: "Please log in again before using Course AI." }]);
      return;
    }
    const messagesWithQuestion = [...courseAiEntry.messages, { role: "user", content: question }];
    setCourseAiInput("");
    updateCourseAi(messagesWithQuestion, true);
    if (DEV_UI_QA_ENABLED) {
      setTimeout(() => {
        updateCourseAi([...messagesWithQuestion, ...UI_QA_AI_MESSAGES], false);
      }, 250);
      return;
    }
    try {
      const data = await session.requestJson("/api/course-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id, courseId, videoTitle: activeTitle, videoDescription: activeDescription, question, messages: courseAiMessages }),
      });
      updateCourseAi([...messagesWithQuestion, { role: "assistant", id: data.messageId, content: data.answer }], false);
    } catch {
      updateCourseAi([...messagesWithQuestion, { role: "assistant", content: "AI is unavailable right now. Please try again." }], false);
    }
  }

  if (loading) return (
    <View style={[s.centered, { backgroundColor: "#000" }]}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  );

  if (error || videos.length === 0) return (
    <View style={[s.centered, { backgroundColor: "#000" }]}>
      <Text style={{ color: "#fff", marginBottom: 16 }}>{error || "No videos yet."}</Text>
      <TouchableOpacity onPress={onBack} style={[s.btn, s.btnFill]} accessibilityRole="button" accessibilityLabel="Go back">
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
          <VideoItem video={item} courseId={courseId} course={course} user={user}
            onComplete={() => { /* Completion comes from validated progress responses. */ }}
            onProgress={async (currentTime, duration) => {
              await onVideoProgress?.(courseId, getVideoKey(item, index), currentTime, duration);
            }}
            onSettingsOpenChange={open => {
              if (index === activeIndex) setPlayerSettingsOpen(open);
            }}
            onExitFullscreen={() => {
              if (index === activeIndex) onBack?.();
            }}
            onEnded={() => {
              if (index === activeIndex && index < videos.length - 1) {
                flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
              }
            }}
            isActive={index === activeIndex && !videoUiOverlayOpen} height={listHeight}
            suspendSurface={index === activeIndex && videoUiOverlayOpen}
            initialTime={index === (initialIndex ?? 0) ? (initialTime ?? 0) : 0}
            localPath={downloads?.[getBunnyGuid(item)]?.status === "done" ? downloads[getBunnyGuid(item)].path : null} />
        )}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={vcRef.current}
        getItemLayout={(_, i) => ({ length: listHeight, offset: listHeight * i, index: i })}
      />

      <SafeAreaView style={s.webPlayerTopBar} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onBack}
          style={s.webPlayerTopBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={C.primary} />
        </TouchableOpacity>
        <Text style={s.webPlayerLectureLabel} numberOfLines={1}>{activeLessonLabel}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setShowNotes(true)}
          style={s.webPlayerTopBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Open lecture notes and prompts"
        >
          <Ionicons name="document-text-outline" size={21} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={reportActiveLesson}
          style={s.webPlayerTopBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Report a problem with this lecture"
        >
          <Ionicons name="flag-outline" size={21} color={C.primary} />
        </TouchableOpacity>
      </SafeAreaView>
      {!playerSettingsOpen && (
        <View style={s.webPlayerSideRail} pointerEvents="box-none">
          <TouchableOpacity onPress={() => setShowCourseAi(true)} style={s.webPlayerRailBtn} accessibilityRole="button" accessibilityLabel="Ask Course AI">
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={s.webPlayerRailText}>AI chat</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowLectures(true)} style={s.webPlayerRailBtn} accessibilityRole="button" accessibilityLabel="Open course lectures">
            <Ionicons name="layers-outline" size={21} color="#fff" />
            <Text style={s.webPlayerRailText}>Lectures</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={downloadActiveLesson}
            style={s.webPlayerRailBtn}
            disabled={activeDownloadBusy}
            accessibilityRole="button"
            accessibilityLabel={
              activeDownloadBusy
                ? `Downloading ${activeTitle || "current lecture"}, ${Math.round((activeDownload?.progress || 0) * 100)} percent`
                : activeDownloadDone
                  ? `Current lecture is downloaded`
                  : `Download current lecture ${activeTitle || ""}`.trim()
            }
            accessibilityState={{ disabled: activeDownloadBusy, busy: activeDownloadBusy }}
          >
            {activeDownloadBusy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name={activeDownloadDone ? "checkmark-circle" : "download-outline"} size={21} color="#fff" />}
            <Text style={s.webPlayerRailText}>{activeDownloadLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={shareActiveLesson} style={s.webPlayerRailBtn} accessibilityRole="button" accessibilityLabel="Share lecture">
            <Ionicons name="share-social-outline" size={21} color="#fff" />
            <Text style={s.webPlayerRailText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}
      {!playerSettingsOpen && (
        <View style={s.webPlayerMeta} pointerEvents="none">
          <Text style={s.webPlayerTitle} numberOfLines={1}>{activeTitle || "Lesson"}</Text>
          {!!activeSummary && <Text style={s.webPlayerDescription} numberOfLines={2}>{activeLessonLabel} - {activeSummary}</Text>}
        </View>
      )}

      <Modal visible={showDescription} transparent animationType="slide" onRequestClose={() => setShowDescription(false)}>
        <View style={s.descriptionOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDescription(false)} accessible={false} />
          <View style={s.descriptionSheet}>
            <View style={s.descriptionHandle} />
            <View style={s.descriptionHeader}>
              <Text style={s.descriptionTitle} numberOfLines={2}>{activeTitle || "Video description"}</Text>
              <TouchableOpacity onPress={() => setShowDescription(false)} style={s.descriptionClose} accessibilityRole="button" accessibilityLabel="Close lesson information">
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={s.descriptionScroll} contentContainerStyle={s.descriptionContent}>
              <View style={s.lessonNotesBlock}>
                <View style={s.lessonNotesBlockHeader}>
                  <Ionicons name="information-circle-outline" size={16} color={C.primary} />
                  <Text style={s.lessonNotesBlockTitle}>About this lesson</Text>
                </View>
                <Text selectable style={s.descriptionBody}>{activeDescription}</Text>
              </View>

              {hasSeparateNotes && (
                <View style={s.lessonNotesBlock}>
                  <View style={s.lessonNotesBlockHeader}>
                    <Ionicons name="reader-outline" size={16} color={C.primary} />
                    <Text style={s.lessonNotesBlockTitle}>Lecture Notes</Text>
                  </View>
                  <Text selectable style={s.lessonNotesBody}>{activeNotes}</Text>
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
                      onPress={() => resource.url ? openSafeExternalUrl(resource.url, "resource") : null}
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
          </View>
        </View>
      </Modal>

      <Modal visible={showNotes} transparent animationType="slide" onRequestClose={() => setShowNotes(false)}>
        <View style={s.descriptionOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowNotes(false)} accessible={false} />
          <View style={s.lessonNotesSheet}>
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
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={s.descriptionScroll} contentContainerStyle={s.lessonNotesContent}>
              <View style={s.lessonNotesBlock}>
                <View style={s.lessonNotesBlockHeader}>
                  <Ionicons name="reader-outline" size={16} color={C.primary} />
                  <Text style={s.lessonNotesBlockTitle}>Lecture Notes</Text>
                </View>
                <Text selectable style={s.lessonNotesBody}>
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
                  <Text selectable style={s.lessonNotesBody}>No prompts shared for this lecture yet.</Text>
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
                      onPress={() => resource.url ? openSafeExternalUrl(resource.url, "resource") : null}
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
          </View>
        </View>
      </Modal>

      <Modal visible={showLectures} transparent animationType="slide" onRequestClose={() => setShowLectures(false)}>
        <View style={s.lecturePickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLectures(false)} accessible={false} />
          <View style={s.lecturePickerSheet}>
            <View style={s.lecturePickerHandle} />
            <View style={s.lecturePickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.lecturePickerHeading} numberOfLines={1}>Lectures</Text>
                <Text style={s.lecturePickerCourse} numberOfLines={1}>{course?.title || "AI Influencer Course"}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLectures(false)} style={s.lecturePickerClose} accessibilityRole="button" accessibilityLabel="Close lectures">
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.lecturePickerTabs}>
              {lectureRanges.map((range, index) => {
                const active = index === Math.min(lecturePage, lectureRanges.length - 1);
                return (
                  <TouchableOpacity
                    key={`${range.start}-${range.end}`}
                    style={[s.lecturePickerTab, active && s.lecturePickerTabActive]}
                    onPress={() => setLecturePage(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show lectures ${range.start + 1} to ${range.end}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.lecturePickerTabText, active && s.lecturePickerTabTextActive]}>
                      {range.start + 1}-{range.end}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <FlatList
              key={`lecture-grid-${visibleLectureRange.start}`}
              data={visibleLectureVideos}
              keyExtractor={(item, index) => getVideoKey(item, visibleLectureRange.start + index)}
              numColumns={5}
              style={s.lecturePickerList}
              contentContainerStyle={s.lecturePickerContent}
              columnWrapperStyle={s.lecturePickerGridRow}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => {
                const lectureIndex = visibleLectureRange.start + index;
                const current = lectureIndex === activeIndex;
                const title = item?.title || `Lecture ${lectureIndex + 1}`;
                const thumbnailUrl = getHomeLessonThumbnailUrl(item, course);
                return (
                  <TouchableOpacity
                    style={[s.lecturePickerTile, { width: lectureTileWidth }, current && s.lecturePickerTileActive]}
                    onPress={() => goToLecture(lectureIndex)}
                    accessibilityRole="button"
                    accessibilityLabel={`${current ? "Current lecture, " : ""}Lecture ${lectureIndex + 1}: ${title}`}
                  >
                    <View style={[s.lecturePickerThumb, { height: lectureTileHeight }]}>
                      {thumbnailUrl ? (
                        <RemoteThumbnailImage
                          imageUrl={thumbnailUrl}
                          screen="Player lecture picker"
                          courseId={courseId}
                          borderRadius={8}
                        />
                      ) : (
                        <View style={s.mediaFallback}>
                          <Ionicons name="play-circle-outline" size={18} color={C.primary} />
                        </View>
                      )}
                      {current && (
                        <View style={s.lecturePickerCurrentBadge}>
                          <Ionicons name="play" size={11} color="#121212" />
                        </View>
                      )}
                    </View>
                    <Text style={[s.lecturePickerNumber, current && s.lecturePickerNumberActive]}>{lectureIndex + 1}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showCourseAi} transparent animationType="slide" onRequestClose={closeCourseAi}>
        <KeyboardAvoidingView style={s.courseAiOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCourseAi} accessible={false} />
          <View style={s.courseAiSheet}>
            <View style={s.courseAiHandle} />
            <View style={s.courseAiHeader}>
              <View>
                <Text style={s.courseAiTitle}>Course AI</Text>
                <Text style={s.courseAiSubtitle} numberOfLines={1}>{activeTitle || "Ask about this video"}</Text>
              </View>
              <TouchableOpacity onPress={closeCourseAi} style={s.courseAiClose} accessibilityRole="button" accessibilityLabel="Close Course AI">
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView ref={courseAiScrollRef} style={s.courseAiMessages} contentContainerStyle={s.courseAiContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => courseAiScrollRef.current?.scrollToEnd({ animated: true })}>
              {courseAiMessages.map((msg, i) => (
                <View key={i} style={[s.courseAiMessage, msg.role === "user" && s.courseAiMessageUser]}>
                  {msg.role !== "user" && <View style={s.courseAiAvatar}><Ionicons name="sparkles" size={15} color={C.onPrimary} /></View>}
                  <View style={[s.courseAiBubble, msg.role === "user" && s.courseAiBubbleUser]}>
                    <Text style={[s.courseAiBubbleText, msg.role === "user" && s.courseAiBubbleTextUser]}>{msg.content}</Text>
                  </View>
                </View>
              ))}
              {courseAiLoading && (
                <View style={s.courseAiMessage}>
                  <View style={s.courseAiAvatar}><Ionicons name="sparkles" size={15} color={C.onPrimary} /></View>
                  <View style={s.courseAiBubble}><ActivityIndicator color={C.primary} size="small" /></View>
                </View>
              )}
              {!courseAiLoading && !courseAiMessages.some(message => message.role === "user") && ["Summarize this video", "Explain this topic simply", "Give me practice questions"].map(p => (
                <TouchableOpacity key={p} style={s.courseAiPrompt} onPress={() => sendCourseAiMessage(p)} accessibilityRole="button" accessibilityLabel={`Ask Course AI: ${p}`}>
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
                accessibilityLabel="Message Course AI"
              />
              <TouchableOpacity style={s.courseAiSend} onPress={() => sendCourseAiMessage()} disabled={courseAiLoading} accessibilityRole="button" accessibilityLabel="Send Course AI message">
                <Ionicons name="send" size={17} color={C.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const COURSE_DESCRIPTION_PREVIEW_LINES = 4;

function ExpandableCourseDescription({ description: rawDescription }) {
  const description = plainCourseDescription(rawDescription);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setHasOverflow(false);
  }, [description]);

  const handleTextMeasure = useCallback(event => {
    const overflows = event.nativeEvent.lines.length > COURSE_DESCRIPTION_PREVIEW_LINES;
    setHasOverflow(current => current === overflows ? current : overflows);
  }, []);

  if (!description) return null;

  return (
    <View style={s.courseDescriptionCard}>
      <Text style={s.courseDescriptionTitle}>About this course</Text>
      <View style={s.courseDescriptionTextFrame}>
        <Text
          style={s.courseDescriptionText}
          numberOfLines={expanded ? undefined : COURSE_DESCRIPTION_PREVIEW_LINES}
          ellipsizeMode="tail"
        >
          {description}
        </Text>
        <Text
          style={[s.courseDescriptionText, s.courseDescriptionMeasure]}
          onTextLayout={handleTextMeasure}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {description}
        </Text>
      </View>
      {hasOverflow && (
        <TouchableOpacity
          style={s.courseDescriptionToggle}
          onPress={() => setExpanded(value => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less course description" : "Read more course description"}
          accessibilityState={{ expanded }}
        >
          <Text style={s.courseDescriptionToggleText}>{expanded ? "Show less" : "Read more"}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={C.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── VideoListScreen ───────────────────────────────────────────────────────────
function VideoListScreen({
  course,
  onSelectVideo,
  onBack,
  onOpenCourseAi,
  downloads,
  onDownload,
  onDeleteDownload,
  hasAccess,
  onGoToHome,
  onGoToCourses,
  onGoToAI,
  onGoToDownloads,
  onGoToProfile,
  aiRobotId,
}) {
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
  const lectureSearchReferences = useMemo(
    () => videos.map((video, index) => {
      const title = video.title || `Video ${index + 1}`;
      const durationLabel = getVideoDurationLabel(video);
      return {
        key: video._id || `lecture-${index}`,
        title,
        subtitle: `Lecture ${index + 1}${durationLabel ? ` · ${durationLabel}` : ""}`,
        icon: "play-circle",
        fn: () => onSelectVideo(index),
        keywords: `${title} lecture ${index + 1} lesson ${index + 1}`,
      };
    }),
    [onSelectVideo, videos]
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
              accessibilityRole="button"
              accessibilityLabel={`Open Course AI for ${course.title}`}
            >
              <Ionicons name="sparkles" size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontSize: 12, fontWeight: "700", marginLeft: 3 }}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {videos.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          <ExpandableCourseDescription description={courseDescription} />
          <View style={[s.centered, { minHeight: 260 }]}>
            <Text style={{ color: C.textSub }}>No videos in this course yet.</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item, i) => item._id || String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 10 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          ListHeaderComponent={courseDescription ? <ExpandableCourseDescription description={courseDescription} /> : null}
          renderItem={({ item, index }) => {
            const durationLabel = getVideoDurationLabel(item);
            const bunnyGuid = getBunnyGuid(item);
            const bunnyLibraryId = getBunnyLibraryId(item);
            const thumbnailUrl = getHomeLessonThumbnailUrl(item, course);
            const dl = bunnyGuid ? downloads?.[bunnyGuid] : null;
            return (
              <TouchableOpacity
                style={s.videoRow}
                onPress={() => onSelectVideo(index)}
                accessibilityRole="button"
                accessibilityLabel={`Play lesson ${index + 1}: ${item.title || `Video ${index + 1}`}${durationLabel ? `, ${durationLabel}` : ""}`}
                accessibilityHint="Opens the lesson player"
              >
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
                    style={s.videoDownloadButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    disabled={dl?.status === "downloading"}
                    onPress={event => {
                      event.stopPropagation?.();
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
                    accessibilityRole="button"
                    accessibilityLabel={
                      !hasAccess
                        ? `Download locked for ${item.title || `lesson ${index + 1}`}`
                        : dl?.status === "done"
                          ? `Manage downloaded lesson ${item.title || index + 1}`
                          : dl?.status === "downloading"
                            ? `Downloading ${item.title || `lesson ${index + 1}`}, ${Math.round((dl.progress || 0) * 100)} percent`
                            : `Download lesson ${index + 1}: ${item.title || `Video ${index + 1}`}`
                    }
                    accessibilityState={{ disabled: dl?.status === "downloading", busy: dl?.status === "downloading" }}
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

      <BottomNav
        active="courses"
        onHome={onGoToHome || onBack}
        onCourses={onGoToCourses || (() => {})}
        onAI={onGoToAI}
        onDownloads={onGoToDownloads}
        onProfile={onGoToProfile}
        aiRobotId={aiRobotId}
        forceDark
        persistent
        searchReferences={lectureSearchReferences}
        searchPlaceholder="Search lectures"
      />

      <Modal visible={showCourseNotes} transparent animationType="slide" onRequestClose={() => setShowCourseNotes(false)}>
        <View style={s.courseNotesOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCourseNotes(false)} accessible={false} />
          <View style={s.courseNotesSheet}>
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

            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={s.courseNotesScroll}
              contentContainerStyle={s.courseNotesContent}
            >
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
                      onPress={() => resource.url ? openSafeExternalUrl(resource.url, "resource") : null}
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
          </View>
        </View>
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
            <Ionicons name="play-circle" size={78} color={C.onPrimary} />
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

const HOME_PALETTE = {
  background: "#0D0D0B",
  surface: "#171714",
  surfaceRaised: "#1C1C18",
  surfaceSoft: "#23231E",
  border: "#302E28",
  borderStrong: "#454137",
  text: "#F5F1E8",
  textSecondary: "#B8B0A5",
  textMuted: "#8D867D",
  gold: "#E7BC68",
  goldSoft: "#E7BC68",
  success: "#7F9A67",
};

function getHomeLessonThumbnailUrl(lesson, course) {
  return getLessonThumbnailUrl(lesson, course);
}

function HomeMedia({ course, lesson, borderRadius = 12, screen = "Home media" }) {
  const imageUrl = getHomeLessonThumbnailUrl(lesson, course);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: HOME_PALETTE.surfaceSoft, borderRadius, overflow: "hidden" }]}>
      <View style={homeStyles.mediaFallback}>
        <Ionicons name="school-outline" size={24} color={HOME_PALETTE.gold} />
        <Text style={homeStyles.mediaFallbackText} numberOfLines={2}>{lesson?.title || course?.title || "Skillomate"}</Text>
      </View>
      <RemoteThumbnailImage
        imageUrl={imageUrl}
        screen={screen}
        courseId={course?._id}
        borderRadius={borderRadius}
      />
    </View>
  );
}

function HomeSectionHeader({ title, onSeeAll, actionLabel = "See All" }) {
  return (
    <View style={homeStyles.sectionHeader}>
      <Text style={homeStyles.sectionTitle}>{title}</Text>
      {onSeeAll ? (
        <TouchableOpacity
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={homeStyles.sectionAction}>{actionLabel}  ›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FeaturedCourseHero({ course, onPress }) {
  return (
    <View
      style={homeStyles.featuredHero}
      onTouchEnd={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Start learning ${course.title}`}
    >
      <HomeMedia course={course} borderRadius={14} screen="Home featured course" />
      <View
        style={homeStyles.featuredButton}
        pointerEvents="none"
      >
        <Text style={homeStyles.featuredButtonText}>Start Learning</Text>
        <Ionicons name="arrow-forward" size={15} color="#17130B" />
      </View>
    </View>
  );
}

function ContinueLearningCard({ course, lessonCount, resumeIndex, progressPercent, isStarted, isComplete, lesson, onPress }) {
  const statusTitle = isComplete ? "Course Complete" : isStarted ? course.title : "Start Your Journey";
  const detail = isComplete
    ? `${lessonCount} lessons completed`
    : isStarted
      ? `Lesson ${Math.min(resumeIndex + 1, lessonCount)} of ${lessonCount}`
      : `${lessonCount} lessons waiting for you`;
  const action = isComplete ? "Review Course" : isStarted ? "Continue" : "Start Course";

  return (
    <TouchableOpacity
      style={homeStyles.continueCard}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${course.title}`}
    >
      <View style={homeStyles.continueThumb}>
        <HomeMedia course={course} lesson={lesson} borderRadius={11} screen="Home continue learning" />
        <View style={homeStyles.continuePlay}>
          <Ionicons name={isComplete ? "refresh" : "play"} size={15} color="#FFFFFF" />
        </View>
      </View>
      <View style={homeStyles.continueBody}>
        <Text style={homeStyles.continueTitle} numberOfLines={2}>{statusTitle}</Text>
        <Text style={homeStyles.continueMeta}>{detail}</Text>
        <View style={homeStyles.continueProgressRow}>
          <View style={homeStyles.continueProgressTrack}>
            <View style={[homeStyles.continueProgressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={homeStyles.continuePercent}>{progressPercent}%</Text>
        </View>
        <Text style={homeStyles.continueLesson} numberOfLines={1}>
          {isComplete ? "Revisit any lesson" : isStarted ? `Continue: ${lesson?.title || "Your next lesson"}` : action}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={HOME_PALETTE.gold} />
    </TouchableOpacity>
  );
}

function TopicGrid({ topics, onPressTopic }) {
  return (
    <View style={homeStyles.topicGrid}>
      {topics.map(topic => (
        <TouchableOpacity
          key={topic.key}
          style={homeStyles.topicCard}
          onPress={() => onPressTopic(topic)}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={`${topic.title}, ${topic.lessons.length} lessons`}
        >
          <View style={[homeStyles.topicIcon, { backgroundColor: `${topic.color}20` }]}>
            <Ionicons name={topic.icon} size={21} color={topic.color} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={homeStyles.topicTitle} numberOfLines={2}>{topic.title}</Text>
            <Text style={homeStyles.topicCount}>{topic.lessons.length} {topic.lessons.length === 1 ? "lesson" : "lessons"}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function HomeLessonCard({ course, lesson, index, width, displayTitle, onPress, compact = false }) {
  const duration = getVideoDurationLabel(lesson);
  const order = Number(lesson?.order) || index + 1;
  return (
    <TouchableOpacity
      style={[compact ? homeStyles.quickCard : homeStyles.lessonCard, width ? { width } : null]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Play lesson ${order}: ${lesson?.title || "Lesson"}`}
    >
      <View style={compact ? homeStyles.quickThumb : homeStyles.lessonThumb}>
        <HomeMedia course={course} lesson={lesson} borderRadius={10} screen={compact ? "Home quick lesson" : "Home recommended lesson"} />
        <View style={homeStyles.lessonPlayBadge}>
          <Ionicons name="play" size={10} color="#FFFFFF" />
          {duration ? <Text style={homeStyles.lessonDuration}>{duration}</Text> : null}
        </View>
      </View>
      <Text style={compact ? homeStyles.quickTitle : homeStyles.lessonTitle} numberOfLines={2}>{displayTitle || lesson?.title}</Text>
      {!compact ? <Text style={homeStyles.lessonNumber}>Lesson {order}</Text> : null}
    </TouchableOpacity>
  );
}

function LessonCarousel({ course, lessons, cardWidth, onPressLesson }) {
  const swipeBoundaryProps = useHorizontalSwipeBoundaryProps();

  return (
    <ScrollView
      {...swipeBoundaryProps}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={homeStyles.horizontalContent}
      directionalLockEnabled
      nestedScrollEnabled
      scrollEventThrottle={16}
      decelerationRate="fast"
      removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
    >
      {lessons.map((lesson, index) => (
        <HomeLessonCard
          key={getVideoKey(lesson, index)}
          course={course}
          lesson={lesson}
          index={index}
          width={cardWidth}
          onPress={() => onPressLesson(lesson)}
        />
      ))}
    </ScrollView>
  );
}

function LearningRoadmap({ stages, onPressStage }) {
  return (
    <View style={homeStyles.roadmapCard}>
      {stages.map((stage, index) => {
        const complete = stage.status === "complete";
        const current = stage.status === "current";
        const firstOrder = Number(stage.lessons[0]?.order) || stage.lessonNumbers[0];
        const lastOrder = Number(stage.lessons[stage.lessons.length - 1]?.order) || stage.lessonNumbers[stage.lessonNumbers.length - 1];
        return (
          <TouchableOpacity
            key={stage.key}
            style={homeStyles.roadmapRow}
            onPress={() => onPressStage(stage)}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={`${stage.title}, lessons ${firstOrder} to ${lastOrder}, ${stage.status}`}
          >
            <View style={homeStyles.roadmapRail}>
              <View style={[
                homeStyles.roadmapStep,
                complete && homeStyles.roadmapStepComplete,
                current && homeStyles.roadmapStepCurrent,
              ]}>
                {complete
                  ? <Ionicons name="checkmark" size={15} color="#17130B" />
                  : <Text style={[homeStyles.roadmapStepText, current && { color: "#17130B" }]}>{index + 1}</Text>}
              </View>
              {index < stages.length - 1 ? (
                <View style={[homeStyles.roadmapLine, complete && homeStyles.roadmapLineComplete]} />
              ) : null}
            </View>
            <View style={homeStyles.roadmapBody}>
              <Text style={[homeStyles.roadmapTitle, stage.status === "locked" && { color: HOME_PALETTE.textSecondary }]}>{stage.title}</Text>
              <Text style={homeStyles.roadmapMeta}>Lessons {firstOrder}–{lastOrder} • {stage.lessons.length} total</Text>
            </View>
            <Ionicons name={complete ? "checkmark-circle-outline" : current ? "play-circle-outline" : "chevron-forward"} size={20} color={complete || current ? HOME_PALETTE.gold : HOME_PALETTE.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function QuickLearnSection({ course, items, onPressLesson }) {
  return (
    <View style={homeStyles.quickGrid}>
      {items.map((item, index) => (
        <HomeLessonCard
          key={item.key}
          course={course}
          lesson={item.lesson}
          index={index}
          displayTitle={item.title}
          compact
          onPress={() => onPressLesson(item.lesson)}
        />
      ))}
    </View>
  );
}

function ProjectCarousel({ course, projects, onPressProject }) {
  const swipeBoundaryProps = useHorizontalSwipeBoundaryProps();

  return (
    <ScrollView
      {...swipeBoundaryProps}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={homeStyles.horizontalContent}
      directionalLockEnabled
      nestedScrollEnabled
      scrollEventThrottle={16}
      decelerationRate="fast"
      removeClippedSubviews={ANDROID_CLIPPED_SUBVIEWS}
    >
      {projects.map(project => (
        <TouchableOpacity
          key={project.key}
          style={homeStyles.projectCard}
          onPress={() => onPressProject(project)}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={`${project.title}, ${project.lessons.length} lesson project`}
        >
          <View style={homeStyles.projectThumb}>
            <HomeMedia course={course} lesson={project.lessons[0]} borderRadius={10} screen="Home project" />
            <View style={homeStyles.projectShade} />
            <Ionicons name={project.icon} size={22} color={HOME_PALETTE.goldSoft} />
          </View>
          <Text style={homeStyles.projectTitle} numberOfLines={2}>{project.title}</Text>
          <Text style={homeStyles.projectMeta}>{project.lessons.length} {project.lessons.length === 1 ? "lesson" : "lessons"}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function LessonListSection({ course, lessons, onPressLesson, screen = "Home lesson list" }) {
  return (
    <View style={homeStyles.latestList}>
      {lessons.map((lesson, index) => {
        const duration = getVideoDurationLabel(lesson);
        return (
          <TouchableOpacity
            key={getVideoKey(lesson, index)}
            style={homeStyles.latestRow}
            onPress={() => onPressLesson(lesson)}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel={`Open lesson ${lesson.order || index + 1}: ${lesson.title}`}
          >
            <View style={homeStyles.latestThumb}>
              <HomeMedia course={course} lesson={lesson} borderRadius={9} screen={screen} />
              <View style={homeStyles.latestPlay}><Ionicons name="play" size={9} color="#FFFFFF" /></View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={homeStyles.latestTitle} numberOfLines={2}>{lesson.title}</Text>
              <Text style={homeStyles.latestMeta}>Lesson {lesson.order || index + 1}{duration ? ` • ${duration}` : ""}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={HOME_PALETTE.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ChallengeCard({ title, steps, completedCount, onPress }) {
  return (
    <TouchableOpacity style={homeStyles.challengeCard} onPress={onPress} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`Start the 7-Day Challenge: ${title}`}>
      <View style={homeStyles.challengeIcon}>
        <Ionicons name="calendar-clear" size={29} color="#17130B" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={homeStyles.challengeKicker}>7-DAY CHALLENGE</Text>
        <Text style={homeStyles.challengeTitle}>{title}</Text>
        <Text style={homeStyles.challengeText}>A step-by-step plan using {steps.length} real lessons.</Text>
        <Text style={homeStyles.challengeProgress}>{completedCount}/{steps.length} days complete</Text>
      </View>
      <Ionicons name="arrow-forward-circle" size={28} color="#17130B" />
    </TouchableOpacity>
  );
}

const homeStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HOME_PALETTE.background },
  header: { paddingTop: ANDROID_STATUS_BAR_INSET, backgroundColor: HOME_PALETTE.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HOME_PALETTE.border },
  headerInner: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerInnerCompact: { paddingHorizontal: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandCopy: { flexShrink: 1 },
  brandIcon: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  brandName: { color: HOME_PALETTE.text, fontSize: 17, lineHeight: 21, fontWeight: "800" },
  brandTagline: { color: HOME_PALETTE.textSecondary, fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, alignItems: "center", justifyContent: "center", backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border, position: "relative" },
  headerFlagButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, alignItems: "center", justifyContent: "center", backgroundColor: "#140707", borderWidth: 1, borderColor: "#A30B0B" },
  headerDot: { position: "absolute", top: 10, right: 11, width: 7, height: 7, borderRadius: 4, backgroundColor: HOME_PALETTE.gold, borderWidth: 1, borderColor: HOME_PALETTE.surface },
  profileButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: HOME_PALETTE.gold },
  scrollContent: { paddingTop: 10, paddingBottom: 118 },
  mediaFallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: HOME_PALETTE.surfaceSoft },
  mediaFallbackText: { color: HOME_PALETTE.textSecondary, fontSize: 10, lineHeight: 13, fontWeight: "700", textAlign: "center", marginTop: 5 },
  featuredHero: { position: "relative", width: "auto", aspectRatio: 16 / 9, marginHorizontal: 14, borderRadius: 14, overflow: "hidden", backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.borderStrong },
  featuredButton: { position: "absolute", left: 14, bottom: 14, zIndex: 6, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: HOME_PALETTE.gold },
  featuredButtonText: { color: "#17130B", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  section: { marginTop: 20 },
  sectionHeader: { minHeight: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, marginBottom: 9 },
  sectionTitle: { flex: 1, color: HOME_PALETTE.text, fontSize: 18, lineHeight: 23, fontWeight: "800", letterSpacing: -0.15 },
  sectionAction: { color: HOME_PALETTE.gold, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  continueCard: { marginHorizontal: 14, minHeight: 116, padding: 9, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  continueThumb: { width: 112, aspectRatio: 16 / 9, flexShrink: 0, alignSelf: "center", borderRadius: 11, overflow: "hidden", backgroundColor: HOME_PALETTE.surfaceSoft },
  continuePlay: { position: "absolute", right: 7, bottom: 7, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,8,7,0.86)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  continueBody: { flex: 1, minWidth: 0 },
  continueTitle: { color: HOME_PALETTE.text, fontSize: 14, lineHeight: 18, fontWeight: "800" },
  continueMeta: { color: HOME_PALETTE.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 3 },
  continueProgressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  continueProgressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: HOME_PALETTE.borderStrong },
  continueProgressFill: { height: "100%", borderRadius: 2, backgroundColor: HOME_PALETTE.gold },
  continuePercent: { minWidth: 29, color: HOME_PALETTE.text, fontSize: 10.5, lineHeight: 14, fontWeight: "800", textAlign: "right" },
  continueLesson: { color: HOME_PALETTE.textSecondary, fontSize: 10.5, lineHeight: 14, marginTop: 7 },
  topicGrid: { paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap", gap: 9 },
  topicCard: { flexBasis: "47%", flexGrow: 1, minWidth: 136, minHeight: 78, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 11, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  topicIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  topicTitle: { color: HOME_PALETTE.text, fontSize: 12.5, lineHeight: 16, fontWeight: "800" },
  topicCount: { color: HOME_PALETTE.textSecondary, fontSize: 10.5, lineHeight: 14, marginTop: 3 },
  horizontalContent: { paddingHorizontal: 14, paddingRight: 26, gap: 10 },
  lessonCard: { width: 154 },
  lessonThumb: { width: "100%", aspectRatio: 16 / 9, alignSelf: "center", borderRadius: 10, overflow: "hidden", backgroundColor: HOME_PALETTE.surfaceSoft, borderWidth: 1, borderColor: HOME_PALETTE.border },
  lessonPlayBadge: { position: "absolute", right: 6, bottom: 6, minHeight: 23, minWidth: 23, paddingHorizontal: 6, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "rgba(5,5,4,0.86)" },
  lessonDuration: { color: "#FFFFFF", fontSize: 9.5, lineHeight: 12, fontWeight: "700" },
  lessonTitle: { color: HOME_PALETTE.text, fontSize: 12.5, lineHeight: 16, fontWeight: "800", marginTop: 7 },
  lessonNumber: { color: HOME_PALETTE.textSecondary, fontSize: 10.5, lineHeight: 14, marginTop: 3 },
  roadmapCard: { marginHorizontal: 14, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 13, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  roadmapRow: { minHeight: 67, flexDirection: "row", alignItems: "center", gap: 11 },
  roadmapRail: { width: 30, alignSelf: "stretch", alignItems: "center" },
  roadmapStep: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 18, zIndex: 2, backgroundColor: HOME_PALETTE.surfaceSoft, borderWidth: 1, borderColor: HOME_PALETTE.borderStrong },
  roadmapStepComplete: { backgroundColor: HOME_PALETTE.goldSoft, borderColor: HOME_PALETTE.goldSoft },
  roadmapStepCurrent: { backgroundColor: HOME_PALETTE.gold, borderColor: HOME_PALETTE.gold },
  roadmapStepText: { color: HOME_PALETTE.textSecondary, fontSize: 11, lineHeight: 14, fontWeight: "900" },
  roadmapLine: { position: "absolute", width: 2, top: 46, bottom: -20, backgroundColor: HOME_PALETTE.borderStrong },
  roadmapLineComplete: { backgroundColor: HOME_PALETTE.gold },
  roadmapBody: { flex: 1, minWidth: 0, paddingVertical: 12 },
  roadmapTitle: { color: HOME_PALETTE.text, fontSize: 13.5, lineHeight: 18, fontWeight: "800" },
  roadmapMeta: { color: HOME_PALETTE.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 3 },
  quickGrid: { paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap", gap: 9 },
  quickCard: { flexBasis: "47%", flexGrow: 0, minWidth: 136, padding: 8, borderRadius: 11, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  quickThumb: { width: "100%", aspectRatio: 1.6, borderRadius: 9, overflow: "hidden", backgroundColor: HOME_PALETTE.surfaceSoft },
  quickTitle: { minHeight: 32, color: HOME_PALETTE.text, fontSize: 12, lineHeight: 16, fontWeight: "800", marginTop: 7 },
  projectCard: { width: 132, padding: 8, borderRadius: 11, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  projectThumb: { height: 78, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  projectShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(7,7,6,0.54)" },
  projectTitle: { color: HOME_PALETTE.text, fontSize: 12, lineHeight: 16, fontWeight: "800", marginTop: 7 },
  projectMeta: { color: HOME_PALETTE.textMuted, fontSize: 10, lineHeight: 13, marginTop: 2 },
  latestList: { marginHorizontal: 14 },
  latestRow: { minHeight: 79, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9 },
  latestThumb: { width: 88, height: 60, borderRadius: 9, overflow: "hidden", backgroundColor: HOME_PALETTE.surfaceSoft },
  latestPlay: { position: "absolute", right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,4,0.84)" },
  latestTitle: { color: HOME_PALETTE.text, fontSize: 12.5, lineHeight: 17, fontWeight: "800" },
  latestMeta: { color: HOME_PALETTE.textSecondary, fontSize: 10.5, lineHeight: 14, marginTop: 4 },
  challengeCard: { marginHorizontal: 14, minHeight: 146, padding: 16, flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 14, backgroundColor: HOME_PALETTE.goldSoft, borderWidth: 1, borderColor: "#F2D49A" },
  challengeIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.35)" },
  challengeKicker: { color: "#5E4012", fontSize: 9.5, lineHeight: 13, fontWeight: "900", letterSpacing: 0.8 },
  challengeTitle: { color: "#17130B", fontSize: 17, lineHeight: 21, fontWeight: "900", marginTop: 3 },
  challengeText: { color: "#5A4829", fontSize: 11, lineHeight: 15, marginTop: 4 },
  challengeProgress: { color: "#17130B", fontSize: 10.5, lineHeight: 14, fontWeight: "800", marginTop: 7 },
  stateCard: { minHeight: 220, marginHorizontal: 14, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 14, backgroundColor: HOME_PALETTE.surface, borderWidth: 1, borderColor: HOME_PALETTE.border },
  stateTitle: { color: HOME_PALETTE.text, fontSize: 17, lineHeight: 22, fontWeight: "800", textAlign: "center", marginTop: 12 },
  stateText: { color: HOME_PALETTE.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 6 },
  stateButton: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: HOME_PALETTE.gold, marginTop: 16 },
  stateButtonText: { color: "#17130B", fontSize: 12, fontWeight: "900" },
});

// ── HomeScreen ────────────────────────────────────────────────────────────────
function LegacyHomeScreenDraft({ user, onGoToCourses, onGoToAI, onGoToDownloads, onGoToProfile, onGoToSubscription, onStartTrial, trialLoading = false, onSelectCourse, onResumeCourse, onOpenHeroPreview, onReportProblem, courseProgress = {}, aiRobotId }) {
  const hasAccess = hasCourseAccess(user);
  const [topCourses, setTopCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [mostWatchedVideo, setMostWatchedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { hasUnreadNotifications, markNotificationsViewed } = useNotificationReadState();
  const openNotifications = useCallback(() => {
    setShowNotifications(true);
    markNotificationsViewed();
  }, [markNotificationsViewed]);

  useEffect(() => {
    let cancelled = false;
    async function loadHomeData() {
      try {
        const [top, all, mostWatched] = await Promise.all([
          fetchApiJson("/api/courses/top", []),
          fetchApiJson("/api/courses", []),
          fetchApiJson('/api/videos/most-watched', null, undefined, { Authorization: `Bearer ${user.accessToken || user.token || ''}` }),
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
            `/api/courses/${nextTop[0]._id}/videos`,
            null,
            undefined,
            { Authorization: `Bearer ${user.accessToken || user.token || ''}` }
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
                onPress={openNotifications}
              >
                <Ionicons name="notifications-outline" size={20} color={C.text} />
                {hasUnreadNotifications ? <View style={s.notificationDot} /> : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.homeFlagButton}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Report a problem"
                onPress={onReportProblem}
              >
                <Ionicons name="flag-outline" size={19} color="#FF5656" />
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
          {Platform.OS !== "ios" && (
            <View style={s.trialBadge}>
              <Text style={s.trialBadgeText}>₹1 Trial</Text>
            </View>
          )}
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
                accessibilityRole="button"
                accessibilityLabel={`Start learning ${previewCourse?.title || "featured course"}`}
              >
                <Ionicons name="play" size={16} color={C.text} />
                <Text style={s.startLearningText}>Start Learning</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.myListHeroBtn} activeOpacity={0.86} onPress={onGoToCourses} accessibilityRole="button" accessibilityLabel="Open my course list">
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
            <TouchableOpacity onPress={onGoToCourses} accessibilityRole="button" accessibilityLabel="See all continue learning courses">
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
              <TouchableOpacity style={s.learningCard} activeOpacity={0.9} onPress={() => openContinue(course)} accessibilityRole="button" accessibilityLabel={`Continue ${course.title}, ${progressPct} percent complete`}>
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

        {SHOW_DRAFT_HOME_RECOMMENDATIONS && (
          <>
            <View style={s.streamingSection}>
              <View style={s.streamingSectionHeader}>
                <Text style={s.streamingSectionTitle}>Top 10 in India Today</Text>
              </View>
              <HorizontalRail
                data={rankedCourses.slice(0, 5)}
                keyExtractor={course => `${course._id}-rank`}
                contentContainerStyle={s.rankRailContent}
                renderItem={({ item: course, index }) => (
                  <TouchableOpacity style={s.rankItem} activeOpacity={0.9} onPress={() => openCourse(course)} accessibilityRole="button" accessibilityLabel={`Open ranked course ${index + 1}: ${course.title}`}>
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
          </>
        )}

        <View style={s.streamingSection}>
          <View style={s.streamingSectionHeader}>
            <Text style={s.streamingSectionTitle}>Trending Now</Text>
            <TouchableOpacity onPress={onGoToCourses} accessibilityRole="button" accessibilityLabel="See all trending courses">
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
                <TouchableOpacity style={s.trendingLandscapeCard} activeOpacity={0.9} onPress={() => openCourse(course)} accessibilityRole="button" accessibilityLabel={`Open course ${course.title}`}>
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
          <TouchableOpacity onPress={onGoToCourses} style={s.learnEarnBtn} accessibilityRole="button" accessibilityLabel="Explore Learn to Earn courses">
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
            <TouchableOpacity onPress={onGoToCourses} accessibilityRole="button" accessibilityLabel="See all saved courses">
              <Text style={s.streamingSeeAll}>See All &gt;</Text>
            </TouchableOpacity>
          </View>
          <HorizontalRail
            data={discoveryCourses.slice(2, 7)}
            keyExtractor={course => `${course._id}-list`}
            contentContainerStyle={s.railContent}
            renderItem={({ item: course, index }) => (
              <TouchableOpacity style={s.myListPoster} activeOpacity={0.9} onPress={() => openCourse(course)} accessibilityRole="button" accessibilityLabel={`Open saved course ${course.title}`}>
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

        <TouchableOpacity style={s.nexPromptBand} onPress={onGoToAI} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Ask Nex AI what to learn next">
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
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onStartTrial={onStartTrial || onGoToSubscription}
        trialLoading={trialLoading}
      />
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
          <TouchableOpacity style={s.posterCard} activeOpacity={0.9} onPress={() => onPressCourse(course)} accessibilityRole="button" accessibilityLabel={`Open course ${course.title}`}>
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

// Only public catalog metadata survives Home unmounts; never cache playback grants.
let homeCatalogCourse = null;

function HomeScreen({
  session,
  user,
  onGoToCourses,
  onGoToAI,
  onGoToDownloads,
  onGoToProfile,
  onGoToSubscription,
  onStartTrial,
  trialLoading = false,
  onSelectCourse,
  onResumeCourse,
  onOpenLessonCollection,
  onReportProblem,
  courseProgress = {},
  aiRobotId,
}) {
  const { width } = useWindowDimensions();
  const hasAccess = hasCourseAccess(user);
  const [primaryCourse, setPrimaryCourse] = useState(() => homeCatalogCourse);
  const [loading, setLoading] = useState(() => !homeCatalogCourse);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { hasUnreadNotifications, markNotificationsViewed } = useNotificationReadState();
  const openNotifications = useCallback(() => {
    setShowNotifications(true);
    markNotificationsViewed();
  }, [markNotificationsViewed]);

  useEffect(() => {
    let cancelled = false;

    const homeAbort = new AbortController();
    async function loadPrimaryCourse() {
      setLoading(!homeCatalogCourse);
      setLoadError("");
      setPrimaryCourse(homeCatalogCourse);
      try {
        const richResponse = await fetchApiJson("/api/courses/top?limit=24", [], homeAbort.signal).catch(error => {
          if (homeAbort.signal.aborted) throw error;
          return [];
        });
        if (cancelled) return;

        const richCourses = (Array.isArray(richResponse) ? richResponse : richResponse?.courses || []).filter(course => !course?.isMock);
        const fallbackResponse = richCourses.length ? [] : await fetchApiJson("/api/courses", [], homeAbort.signal);
        const fallbackCourses = (Array.isArray(fallbackResponse) ? fallbackResponse : fallbackResponse?.courses || []).filter(course => !course?.isMock);
        const candidates = [...(richCourses.length ? richCourses : fallbackCourses)];
        candidates.sort((left, right) => {
          const rightLessonCount = right.videos?.length || right.lessonCount || 0;
          const leftLessonCount = left.videos?.length || left.lessonCount || 0;
          const rightIsInfluencerMasterclass = rightLessonCount >= 35 && /ai\s*influencer/i.test(String(right?.title || "")) ? 1 : 0;
          const leftIsInfluencerMasterclass = leftLessonCount >= 35 && /ai\s*influencer/i.test(String(left?.title || "")) ? 1 : 0;
          if (rightIsInfluencerMasterclass !== leftIsInfluencerMasterclass) {
            return rightIsInfluencerMasterclass - leftIsInfluencerMasterclass;
          }
          const lessonDifference = rightLessonCount - leftLessonCount;
          if (lessonDifference) return lessonDifference;
          return new Date(right.publishedAt || right.createdAt || 0).getTime() - new Date(left.publishedAt || left.createdAt || 0).getTime();
        });

        let course = candidates[0] || null;
        if (!course) {
          homeCatalogCourse = null;
          setPrimaryCourse(null);
          setLoadError("No published course is available right now.");
          return;
        }

        if (cancelled) return;
        homeCatalogCourse = course;
        setPrimaryCourse(course);
        setLoading(false);
        if (hasAccess && user?._id && user?.sessionId) {
          const playableData = await session.requestJson(`/api/courses/${course._id}/videos`).catch(() => null);
          if (!cancelled && Array.isArray(playableData?.videos) && playableData.videos.length) {
            course = { ...course, videos: playableData.videos, __homePlayableVideos: true };
          }
        }

        if (!cancelled) setPrimaryCourse(course);
      } catch {
        if (!cancelled) {
          setPrimaryCourse(homeCatalogCourse);
          setLoadError("Home could not load the course catalog. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPrimaryCourse();
    return () => { cancelled = true; homeAbort.abort(); };
  }, [hasAccess, reloadKey, session, user?._id, user?.sessionId]);

  const lessons = useMemo(() => sortLessons(primaryCourse?.videos || []), [primaryCourse?.videos]);
  const course = useMemo(
    () => primaryCourse ? { ...primaryCourse, videos: lessons } : null,
    [primaryCourse, lessons]
  );
  const savedProgress = course ? courseProgress?.[course._id] || {} : {};
  const completedIds = useMemo(
    () => new Set((savedProgress.completedVideoIds || []).map(String)),
    [savedProgress.completedVideoIds]
  );
  const isLessonComplete = useCallback(
    lesson => completedIds.has(getVideoKey(lesson, lessons.indexOf(lesson))),
    [completedIds, lessons]
  );
  const completedLessonCount = useMemo(
    () => lessons.reduce((count, lesson, index) => count + (completedIds.has(getVideoKey(lesson, index)) ? 1 : 0), 0),
    [completedIds, lessons]
  );
  const hasPartialProgress = Object.values(savedProgress.videoProgress || {}).some(value => Number(value?.watchedSeconds || 0) > 0);
  const isStarted = completedLessonCount > 0 || hasPartialProgress;
  const progressPercent = course ? getCourseProgressPercent(course, courseProgress) : 0;
  const isComplete = lessons.length > 0 && (progressPercent >= 100 || completedLessonCount === lessons.length);
  const resume = course ? getResumeInfo(course, courseProgress) : { index: 0, seconds: 0 };
  const resumeLesson = lessons[resume.index] || lessons[0] || null;
  const lessonCount = lessons.length || Number(course?.lessonCount || course?.videoCount || 0);
  const hasFullMasterclass = lessons.length >= 35 && /ai\s*influencer/i.test(String(course?.title || ""));
  const hasAiFoundationsCourse = lessons.length >= 10 && /ai\s*basic/i.test(String(course?.title || ""));
  const homeContent = hasFullMasterclass
    ? HOME_INFLUENCER_CONTENT
    : hasAiFoundationsCourse
      ? HOME_AI_FOUNDATIONS_CONTENT
      : null;

  const topics = useMemo(
    () => buildLessonTopics(lessons, homeContent?.topicDefinitions),
    [homeContent, lessons]
  );
  const recommendedLessons = useMemo(
    () => homeContent ? resolveLessonNumbers(lessons, homeContent.recommendedLessonNumbers).slice(0, 6) : lessons.slice(0, 6),
    [homeContent, lessons]
  );
  const quickLearnItems = useMemo(
    () => homeContent
      ? homeContent.quickLearnDefinitions
        .map(item => ({ ...item, lesson: lessons[item.lessonNumber - 1] }))
        .filter(item => item.lesson)
      : [],
    [homeContent, lessons]
  );
  const projects = useMemo(
    () => homeContent
      ? homeContent.projectDefinitions
        .map(definition => ({ ...definition, lessons: resolveLessonNumbers(lessons, definition.lessonNumbers) }))
        .filter(project => project.lessons.length > 0)
      : [],
    [homeContent, lessons]
  );
  const roadmapStages = useMemo(() => {
    if (!homeContent) return [];
    const resolved = homeContent.roadmapDefinitions
      .map(definition => ({ ...definition, lessons: resolveLessonNumbers(lessons, definition.lessonNumbers) }))
      .filter(stage => stage.lessons.length > 0);
    const firstIncomplete = resolved.findIndex(stage => !stage.lessons.every(isLessonComplete));
    return resolved.map((stage, index) => ({
      ...stage,
      status: stage.lessons.every(isLessonComplete)
        ? "complete"
        : index === (firstIncomplete < 0 ? resolved.length - 1 : firstIncomplete)
          ? "current"
          : "locked",
    }));
  }, [homeContent, isLessonComplete, lessons]);
  const challengeSteps = useMemo(
    () => homeContent
      ? homeContent.challengeDefinitions
        .map(step => ({ ...step, lesson: lessons[step.lessonNumber - 1] }))
        .filter(step => step.lesson)
      : [],
    [homeContent, lessons]
  );
  const completedChallengeCount = challengeSteps.filter(step => isLessonComplete(step.lesson)).length;
  const latestLessons = useMemo(() => {
    const withDates = lessons.filter(lesson => lesson.createdAt || lesson.publishedAt || lesson.releasedAt);
    if (withDates.length) {
      return [...withDates]
        .sort((left, right) => new Date(right.createdAt || right.publishedAt || right.releasedAt).getTime() - new Date(left.createdAt || left.publishedAt || left.releasedAt).getTime())
        .slice(0, 3);
    }
    return lessons.slice(-3).reverse();
  }, [lessons]);

  const lessonCardWidth = Math.min(174, Math.max(144, width * 0.42));

  const requireAccess = useCallback(action => {
    if (!hasAccess) {
      setShowUpgrade(true);
      return;
    }
    action();
  }, [hasAccess]);

  const openLesson = useCallback(lesson => {
    if (!course || !lesson) return;
    requireAccess(() => {
      const index = lessons.findIndex(item => getVideoKey(item) === getVideoKey(lesson));
      if (index < 0) return;
      const key = getVideoKey(lesson, index);
      const seconds = Math.floor(savedProgress.videoProgress?.[key]?.resumePosition ?? savedProgress.videoProgress?.[key]?.watchedSeconds ?? 0);
      onResumeCourse(course, index, seconds);
    });
  }, [course, lessons, onResumeCourse, requireAccess, savedProgress.videoProgress]);

  const openCollection = useCallback((title, collection) => {
    if (!course || !collection?.length) return;
    requireAccess(() => {
      onOpenLessonCollection(course, {
        title,
        videoIds: collection.map((lesson, index) => getVideoKey(lesson, index)),
      });
    });
  }, [course, onOpenLessonCollection, requireAccess]);

  const continueCourse = useCallback(() => {
    if (!course || !lessons.length) return;
    requireAccess(() => onResumeCourse(course, isComplete ? 0 : resume.index, isComplete ? 0 : resume.seconds));
  }, [course, isComplete, lessons.length, onResumeCourse, requireAccess, resume.index, resume.seconds]);

  return (
    <View style={homeStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor={HOME_PALETTE.background} />
      <View style={homeStyles.header}>
        <SafeAreaView>
          <View style={[homeStyles.headerInner, width <= 340 && homeStyles.headerInnerCompact]}>
            <View style={homeStyles.brandRow}>
              <SkillomateLogo size={width <= 340 ? "xs" : "sm"} mode="dark" />
            </View>
            <View style={homeStyles.headerActions}>
              <TouchableOpacity style={homeStyles.headerButton} onPress={openNotifications} accessibilityRole="button" accessibilityLabel="Open notifications">
                <Ionicons name="notifications-outline" size={20} color={HOME_PALETTE.text} />
                {hasUnreadNotifications ? <View style={homeStyles.headerDot} /> : null}
              </TouchableOpacity>
              <TouchableOpacity style={homeStyles.headerFlagButton} onPress={onReportProblem} accessibilityRole="button" accessibilityLabel="Report a problem">
                <Ionicons name="flag-outline" size={19} color="#FF5656" />
              </TouchableOpacity>
              <TouchableOpacity
                style={homeStyles.profileButton}
                onPress={onGoToProfile}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="home-profile-button"
              >
                <AvatarImage avatarId={user.avatar || "a1"} size={40} style={{ borderRadius: 20 }} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={homeStyles.scrollContent}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
      >
        {loading && !course ? (
          <View style={homeStyles.stateCard}>
            <ActivityIndicator color={HOME_PALETTE.gold} />
            <Text style={homeStyles.stateTitle}>Loading your masterclass</Text>
            <Text style={homeStyles.stateText}>Preparing the real course and lesson roadmap.</Text>
          </View>
        ) : !course ? (
          <View style={homeStyles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={32} color={HOME_PALETTE.gold} />
            <Text style={homeStyles.stateTitle}>Course unavailable</Text>
            <Text style={homeStyles.stateText}>{loadError || "The course catalog is temporarily unavailable."}</Text>
            <TouchableOpacity style={homeStyles.stateButton} onPress={() => setReloadKey(value => value + 1)} accessibilityRole="button" accessibilityLabel="Try loading the course again">
              <Text style={homeStyles.stateButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <FeaturedCourseHero
              course={course}
              lessonCount={lessonCount}
              tagline={homeContent?.heroTagline}
              onPress={() => onSelectCourse(course)}
            />

            <View style={homeStyles.section}>
              <HomeSectionHeader title="Continue Learning" onSeeAll={() => onSelectCourse(course)} />
              {lessons.length ? (
                <ContinueLearningCard
                  course={course}
                  lessonCount={lessonCount}
                  resumeIndex={resume.index}
                  progressPercent={progressPercent}
                  isStarted={isStarted}
                  isComplete={isComplete}
                  lesson={resumeLesson}
                  onPress={continueCourse}
                />
              ) : (
                <View style={homeStyles.stateCard}>
                  <Ionicons name="hourglass-outline" size={30} color={HOME_PALETTE.gold} />
                  <Text style={homeStyles.stateTitle}>Lessons are being prepared</Text>
                  <Text style={homeStyles.stateText}>The course is available, but its lesson list could not be loaded.</Text>
                </View>
              )}
            </View>

            {recommendedLessons.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Recommended Lessons" onSeeAll={() => onSelectCourse(course)} />
                <LessonCarousel course={course} lessons={recommendedLessons} cardWidth={lessonCardWidth} onPressLesson={openLesson} />
              </View>
            ) : null}

            {topics.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Learn by Topic" />
                <TopicGrid topics={topics} onPressTopic={topic => openCollection(topic.title, topic.lessons)} />
              </View>
            ) : null}

            {quickLearnItems.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Quick Learn" />
                <QuickLearnSection course={course} items={quickLearnItems} onPressLesson={openLesson} />
              </View>
            ) : null}

            {roadmapStages.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Your Learning Roadmap" onSeeAll={() => onSelectCourse(course)} />
                <LearningRoadmap stages={roadmapStages} onPressStage={stage => openCollection(stage.title, stage.lessons)} />
              </View>
            ) : null}

            {projects.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Build With AI" />
                <ProjectCarousel course={course} projects={projects} onPressProject={project => openCollection(project.title, project.lessons)} />
              </View>
            ) : null}

            {latestLessons.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="Latest Lessons" onSeeAll={() => onSelectCourse(course)} />
                <LessonListSection course={course} lessons={latestLessons} onPressLesson={openLesson} screen="Home latest lesson" />
              </View>
            ) : null}

            {challengeSteps.length ? (
              <View style={homeStyles.section}>
                <ChallengeCard
                  title={homeContent?.challengeTitle || "Build Your Learning Streak"}
                  steps={challengeSteps}
                  completedCount={completedChallengeCount}
                  onPress={() => openCollection("7-Day Challenge", challengeSteps.map(step => step.lesson))}
                />
              </View>
            ) : null}

            {lessons.length ? (
              <View style={homeStyles.section}>
                <HomeSectionHeader title="All Lectures" />
                <LessonCarousel course={course} lessons={lessons} cardWidth={lessonCardWidth} onPressLesson={openLesson} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomNav
        active="home"
        onHome={() => {}}
        onCourses={onGoToCourses}
        onAI={onGoToAI}
        onDownloads={onGoToDownloads}
        onProfile={onGoToProfile}
        aiRobotId={aiRobotId}
        forceDark
      />
      <NotificationPreviewModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        onOpenCourses={onGoToCourses}
        onOpenAI={onGoToAI}
        onOpenSubscription={onGoToSubscription}
      />
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onStartTrial={onStartTrial || onGoToSubscription}
        trialLoading={trialLoading}
      />
    </View>
  );
}

// ── CourseListScreen ──────────────────────────────────────────────────────────
function CourseListScreen({ onSelect, user, onGoToHome, onGoToCourses, onGoToAI, onGoToDownloads, onGoToProfile, onGoToSubscription, onStartTrial, trialLoading = false, wishlist = [], onToggleWishlist, courseProgress = {}, onRefreshProgress, aiRobotId, keepPreviewMounted = false, activeTab = "courses" }) {
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
        <TouchableOpacity style={[s.btn, s.btnFill, { marginTop: 18, minWidth: 140 }]} onPress={loadCourses} accessibilityRole="button" accessibilityLabel="Retry loading courses">
          <Text style={s.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
      <BottomNav active={activeTab} onHome={onGoToHome} onCourses={onGoToCourses || (() => {})} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={onGoToProfile} aiRobotId={aiRobotId} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <SafeAreaView style={{ backgroundColor: C.white }}>
        <View style={[s.pageHeader, s.pageHeaderLogoOnly]}>
          <SkillomateLogo size="sm" />
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
        removeClippedSubviews={keepPreviewMounted ? false : ANDROID_CLIPPED_SUBVIEWS}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          const declaredCount = Number(item.lessonCount ?? item.videoCount);
          const lessonCount = Number.isFinite(declaredCount)
            ? declaredCount
            : Array.isArray(item.videos) ? item.videos.length : 0;
          const categoryName = typeof item.category === "string"
            ? item.category.trim()
            : String(item.category?.name || "").trim();
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

                {/* Only show metadata supplied by the uploaded course. */}
                <View style={s.clMetaRow}>
                  <Ionicons name="play-circle-outline" size={15} color={C.primary} />
                  <Text style={s.clMetaText}>{lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}</Text>
                  {categoryName ? (
                    <>
                      <Text style={s.clMetaDot}>·</Text>
                      <Text style={s.clMetaText} numberOfLines={1}>{categoryName}</Text>
                    </>
                  ) : null}
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

      <BottomNav active={activeTab} onHome={onGoToHome} onCourses={onGoToCourses || (() => {})} onAI={onGoToAI} onDownloads={onGoToDownloads} onProfile={onGoToProfile} aiRobotId={aiRobotId} />
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onStartTrial={onStartTrial || onGoToSubscription}
        trialLoading={trialLoading}
      />
    </View>
  );
}

// ── WishlistScreen ────────────────────────────────────────────────────────────
function WishlistScreen({ wishlist, onToggleWishlist, onSelect, onBack, user, onGoToSubscription, onStartTrial, trialLoading = false }) {
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
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.videos?.length ?? 0} lessons`}
              accessibilityHint={hasAccess ? "Opens the course" : "Subscription required"}
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
                <TouchableOpacity
                  style={s.wishlistBtn}
                  onPress={event => { event.stopPropagation?.(); onToggleWishlist(item._id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title} from wishlist`}
                >
                  <Ionicons name="heart" size={14} color={C.primary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onStartTrial={onStartTrial || onGoToSubscription}
        trialLoading={trialLoading}
      />
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
          accessibilityRole="button"
          accessibilityLabel={`Download certificate for ${cert.courseTitle}`}
          accessibilityState={{ disabled: downloading, busy: downloading }}
        >
          {downloading
            ? <ActivityIndicator color={C.onPrimary} size="small" />
            : <Ionicons name="download-outline" size={18} color={C.onPrimary} />}
          <Text style={{ color: C.onPrimary, fontWeight: "700", fontSize: 14 }}>
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
              <Text style={{ color: C.onPrimary, fontWeight: "700", fontSize: 15 }}>Continue Learning</Text>
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

function InfoPageScreen({ page, onBack }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.homeTopBar, { paddingBottom: 12, backgroundColor: C.white }]}>
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={s.homeTopBarInner}>
            <TouchableOpacity onPress={onBack} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back to profile">
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <View pointerEvents="none" style={{ position: "absolute", left: 56, right: 56, alignItems: "center" }}>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 16, textAlign: "center" }} numberOfLines={1}>{page.title}</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.infoHeroCard}>
          <View style={s.infoHeroIcon}>
            <Ionicons name={page.icon} size={30} color={C.primary} />
          </View>
          <Text style={s.infoEyebrow}>{page.eyebrow}</Text>
          <Text style={s.infoTitle}>{page.title}</Text>
          <Text style={s.infoIntro}>{page.intro}</Text>
        </View>

        {page.sections.map((section, index) => (
          <View key={section.title} style={s.infoSectionCard}>
            <View style={s.infoSectionHeader}>
              <View style={s.infoSectionIcon}>
                <Ionicons name={section.icon} size={19} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoSectionNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={s.infoSectionTitle}>{section.title}</Text>
              </View>
            </View>
            <Text style={s.infoSectionBody}>{section.body}</Text>
            {section.actionLabel && (
              <TouchableOpacity
                onPress={section.onPress}
                style={s.infoActionButton}
                accessibilityRole="button"
                accessibilityLabel={section.actionLabel}
              >
                <Ionicons name={section.actionIcon || "open-outline"} size={16} color={C.onPrimary} />
                <Text style={s.infoActionText}>{section.actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SubscriptionDetailsScreen({ user, onBack, session, appleSubscription, onOpenTerms, onOpenPrivacy }) {
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [error, setError] = useState(null);

  const loadSubscription = useCallback(() => {
    setLoading(true);
    setError(null);
    session.requestJson(`/api/user/${user._id}/subscription`)
      .then(data => { setSubData(data); setLoading(false); })
      .catch(() => { setError("Failed to load subscription details."); setLoading(false); });
  }, [session, user._id]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription, appleSubscription.entitlement?.entitlementState, appleSubscription.entitlement?.expiresAt]);

  const isActive = subData
    ? subData.entitlementActive === true
    : hasActivePremiumEntitlement(user);

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
          <TouchableOpacity style={[s.btn, s.btnFill, { marginTop: 18, minWidth: 140 }]} onPress={loadSubscription} accessibilityRole="button" accessibilityLabel="Retry loading subscription details">
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
              <View style={s.iosMembershipPanel}>
                {Platform.OS === "ios" ? (
                  <>
                    <Text style={s.iosMembershipText}>
                      Unlock all protected Skillomate courses, downloads, progress, certificates, and Nex AI course assistance. Payment is charged to your Apple ID. The monthly subscription renews automatically until cancelled in Apple ID settings.
                    </Text>
                    <Text style={[s.iosMembershipText, { marginTop: 8, fontWeight: "800" }]}>
                      {appleSubscription.localizedPrice
                        ? `${appleSubscription.localizedPrice} per ${appleSubscription.period}`
                        : appleSubscription.productLoadStatus === "loading"
                          ? "Loading App Store price…"
                          : "App Store price unavailable"}
                    </Text>
                    {appleSubscription.productLoadStatus === "loading" && <ActivityIndicator color={C.primary} style={{ marginTop: 10 }} />}
                    {!!appleSubscription.error && <Text style={[s.errorText, { marginTop: 10 }]}>{appleSubscription.error}</Text>}
                    {appleSubscription.productLoadStatus === "error" && (
                      <TouchableOpacity
                        onPress={appleSubscription.retryProductLoad}
                        style={[s.btn, { marginTop: 10, borderWidth: 1, borderColor: C.primary }]}
                        accessibilityRole="button"
                        accessibilityLabel="Retry loading App Store subscription"
                      >
                        <Text style={[s.btnText, { color: C.primary }]}>Retry App Store</Text>
                      </TouchableOpacity>
                    )}
                    {!!appleSubscription.notice && <Text style={[s.iosMembershipText, { marginTop: 10 }]}>{appleSubscription.notice}</Text>}
                    <TouchableOpacity
                      onPress={appleSubscription.purchase}
                      disabled={appleSubscription.working || !appleSubscription.product || !appleSubscription.entitlement?.appAccountToken}
                      style={[s.btn, s.btnFill, { marginTop: 12 }, (appleSubscription.working || !appleSubscription.product || !appleSubscription.entitlement?.appAccountToken) && { opacity: 0.55 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Subscribe with the App Store"
                    >
                      {appleSubscription.working ? <ActivityIndicator color={C.onPrimary} /> : <Ionicons name="logo-apple" size={17} color={C.onPrimary} />}
                      <Text style={s.btnText}>Subscribe with Apple</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 14 }}>
                      <TouchableOpacity
                        onPress={onOpenTerms}
                        accessibilityRole="link"
                        accessibilityLabel="Read subscription Terms of Use"
                      >
                        <Text style={{ color: C.primary, fontWeight: "700", fontSize: 12 }}>Terms of Use</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={onOpenPrivacy}
                        accessibilityRole="link"
                        accessibilityLabel="Read subscription Privacy Policy"
                      >
                        <Text style={{ color: C.primary, fontWeight: "700", fontSize: 12 }}>Privacy Policy</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={s.iosMembershipText}>
                    Existing memberships appear automatically when you sign in with the linked Skillomate account.
                  </Text>
                )}
              </View>
            )}

            {Platform.OS === "ios" && (
              <>
                <TouchableOpacity
                  onPress={appleSubscription.restore}
                  disabled={appleSubscription.working}
                  style={[s.btn, { marginTop: 12, borderWidth: 1, borderColor: C.primary }, appleSubscription.working && { opacity: 0.55 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Restore App Store purchases"
                >
                  <Ionicons name="refresh" size={17} color={C.primary} />
                  <Text style={[s.btnText, { color: C.primary }]}>Restore Purchases</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Promise.all([loadSubscription(), appleSubscription.refresh().catch(() => null)])}
                  disabled={appleSubscription.working}
                  style={[s.btn, { marginTop: 8 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh subscription status"
                >
                  <Text style={[s.btnText, { color: C.text }]}>Refresh Status</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openSafeExternalUrl(APPLE_SUBSCRIPTION_MANAGEMENT_URL, "account")}
                  style={[s.btn, { marginTop: 8 }]}
                  accessibilityRole="link"
                  accessibilityLabel="Manage App Store subscription"
                >
                  <Ionicons name="open-outline" size={17} color={C.text} />
                  <Text style={[s.btnText, { color: C.text }]}>Manage App Store Subscription</Text>
                </TouchableOpacity>
              </>
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

function DeleteAccountModal({ visible, user, onClose, onDeleteAccount }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canDelete = Boolean(currentPassword) && confirmation === "DELETE" && !submitting;
  const hasActivePlan = hasActivePremiumEntitlement(user);

  useEffect(() => {
    if (!visible) {
      setCurrentPassword("");
      setConfirmation("");
      setError("");
      setSubmitting(false);
    }
  }, [visible]);

  const closeModal = () => {
    if (submitting) return;
    setCurrentPassword("");
    setConfirmation("");
    setError("");
    onClose();
  };

  const submitDeletion = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    setError("");
    const result = await onDeleteAccount({ password: currentPassword, confirmation });
    if (result?.ok) return;
    setError(result?.error || "Account could not be deleted. Please try again.");
    setSubmitting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.deleteAccountOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessible={false} />
        <View style={s.deleteAccountDialog} accessibilityViewIsModal>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.deleteAccountContent}
          >
            <View style={s.deleteAccountIcon}>
              <Ionicons name="trash-outline" size={26} color={C.danger} />
            </View>
            <Text style={s.deleteAccountTitle}>Permanently delete account?</Text>
            <Text style={s.deleteAccountSubtitle}>
              This cannot be undone. Your Skillomate account and learning data will be permanently removed.
            </Text>

            <View style={s.deleteAccountWarningBox}>
              {[
                "Profile and saved preferences",
                "Course progress, notes and certificates",
                "Wishlist, AI tutor history and app downloads",
              ].map(item => (
                <View key={item} style={s.deleteAccountWarningRow}>
                  <Ionicons name="close-circle" size={17} color={C.danger} />
                  <Text style={s.deleteAccountWarningText}>{item}</Text>
                </View>
              ))}
            </View>

            {hasActivePlan && (
              <View style={s.deleteAccountPlanNotice}>
                <Ionicons name="alert-circle-outline" size={18} color={C.warning} />
                <Text style={s.deleteAccountPlanText}>
                  Skillomate will try to cancel linked recurring billing. Your account deletion continues even if a billing provider is temporarily unavailable; cancellation is queued for retry.
                </Text>
              </View>
            )}

            {Platform.OS === "ios" && (
              <View style={s.deleteAccountPlanNotice}>
                <Ionicons name="logo-apple" size={18} color={C.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={s.deleteAccountPlanText}>
                    Deleting your Skillomate account does not cancel a subscription billed by Apple. Manage or cancel it in the App Store; account deletion remains available either way.
                  </Text>
                  <TouchableOpacity
                    onPress={() => openSafeExternalUrl(APPLE_SUBSCRIPTION_MANAGEMENT_URL, "account")}
                    accessibilityRole="link"
                    accessibilityLabel="Manage App Store subscription before deletion"
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    <Text style={{ color: C.primary, fontWeight: "800", fontSize: 12 }}>Manage App Store Subscription</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!!(user?.email || user?.mobileNumber) && (
              <Text style={s.deleteAccountIdentity} numberOfLines={1}>
                Account: {user.email || user.mobileNumber}
              </Text>
            )}

            <Text style={s.deleteAccountFieldLabel}>Current password</Text>
            <TextInput
              value={currentPassword}
              onChangeText={value => { setCurrentPassword(value); setError(""); }}
              placeholder="Enter your password"
              placeholderTextColor={C.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              style={s.deleteAccountInput}
              editable={!submitting}
              accessibilityLabel="Current password"
              testID="delete-account-password"
            />

            <Text style={s.deleteAccountFieldLabel}>
              Type <Text style={{ color: C.danger, fontWeight: "900" }}>DELETE</Text> to confirm
            </Text>
            <TextInput
              value={confirmation}
              onChangeText={value => { setConfirmation(value); setError(""); }}
              placeholder="DELETE"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={s.deleteAccountInput}
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={submitDeletion}
              accessibilityLabel="Type DELETE to confirm"
              testID="delete-account-confirmation"
            />

            {!!error && (
              <Text style={s.deleteAccountError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}

            <View style={s.deleteAccountActions}>
              <TouchableOpacity
                style={s.deleteAccountCancelBtn}
                onPress={closeModal}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
              >
                <Text style={s.deleteAccountCancelText}>Keep Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.deleteAccountConfirmBtn, !canDelete && s.deleteAccountConfirmBtnDisabled]}
                onPress={submitDeletion}
                disabled={!canDelete}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete account"
                accessibilityState={{ disabled: !canDelete, busy: submitting }}
                testID="delete-account-submit"
              >
                {submitting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={s.deleteAccountConfirmText}>Delete Forever</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProfileScreen({ user, session, onLogout, onDeleteAccount, onGoToHome, onGoToCourses, onGoToAI, onGoToDownloads, wishlistCount, onGoToWishlist, onGoToCertificates, certificatesCount, onAvatarChange, aiRobotId, onGoToSubscription, onOpenLegal }) {
  const isActive = hasActivePremiumEntitlement(user);
  const memberSince = user?._id
    ? new Date(parseInt(user._id.substring(0, 8), 16) * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [tempAvatar, setTempAvatar] = useState(user.avatar || "a1");
  const [savingAvatar, setSavingAvatar] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
      <View style={[s.homeTopBar, { paddingBottom: 20, backgroundColor: C.white }]}>
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={[s.homeTopBarInner, s.pageHeaderLogoOnly]}>
            <TouchableOpacity
              onPress={onGoToHome}
              style={{ position: "absolute", left: 16, width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <SkillomateLogo size="sm" />
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
              <Ionicons name="pencil" size={12} color={C.onPrimary} />
            </View>
          </TouchableOpacity>

          {/* Avatar picker modal */}
          <Modal visible={showAvatarPicker} transparent animationType="slide" onRequestClose={() => setShowAvatarPicker(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAvatarPicker(false)} accessible={false}>
              <Pressable style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }} accessible={false}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 20 }} />
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 20 }}>Choose Avatar</Text>
                {/* Preview selected */}
                <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <View style={{ width: 90, height: 90, borderRadius: 45, overflow: "hidden", borderWidth: 3, borderColor: C.primary }}>
                    <AvatarImage avatarId={tempAvatar?.uri || tempAvatar} size={90} style={{ borderRadius: 0 }} />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    const selectedImage = await pickProfileImage();
                    if (selectedImage) setTempAvatar(selectedImage);
                  }}
                  style={[s.btn, { marginTop: 0, marginBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose profile picture from photos"
                >
                  <Ionicons name="image-outline" size={18} color={C.primary} />
                  <Text style={{ color: C.primary, fontWeight: "800" }}>Choose From Photos</Text>
                </TouchableOpacity>

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
                        <View style={s.avatarPickerCheck}><Ionicons name="checkmark" size={10} color={C.onPrimary} /></View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    setSavingAvatar(true);
                    try {
                      let data;
                      if (tempAvatar?.uri) {
                        const imageResponse = await fetch(tempAvatar.uri);
                        const imageBytes = await imageResponse.blob();
                        data = await session.requestJson(`/api/user/${user._id}/avatar-photo`, {
                          method: "PUT",
                          headers: { "Content-Type": tempAvatar.mimeType || "image/jpeg" },
                          body: imageBytes,
                        });
                      } else {
                        data = await session.requestJson(`/api/user/${user._id}/avatar`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ avatar: tempAvatar }),
                        });
                      }
                      if (data?.avatar) { onAvatarChange?.(data.avatar); setShowAvatarPicker(false); }
                    } catch (uploadError) {
                      Alert.alert("Photo not saved", uploadError.message || "Check your connection and try again.");
                    }
                    setSavingAvatar(false);
                  }}
                  style={[s.btn, s.btnFill, { marginTop: 0 }]}
                  disabled={savingAvatar}
                  accessibilityRole="button"
                  accessibilityLabel="Save profile avatar"
                  accessibilityState={{ disabled: savingAvatar, busy: savingAvatar }}
                >
                  {savingAvatar
                    ? <ActivityIndicator color={C.onPrimary} />
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

        {/* Menu items */}
        {[
          { icon: "card-outline", label: "Subscription Details", onPress: onGoToSubscription },
          { icon: "ribbon-outline", label: "My Certificates", badge: certificatesCount || 0, onPress: onGoToCertificates },
          { icon: "heart-outline", label: "My Wishlist", badge: wishlistCount || 0, onPress: onGoToWishlist },
          { icon: "help-circle-outline", label: "Help & Support", onPress: () => onOpenLegal?.("help") },
          { icon: "document-text-outline", label: "Terms & Conditions", onPress: () => onOpenLegal?.("terms") },
          { icon: "shield-outline", label: "Privacy Policy", onPress: () => onOpenLegal?.("privacy") },
        ].map((item, i) => (
          <TouchableOpacity
            key={i}
            style={s.menuItem}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}${item.badge > 0 ? `, ${item.badge}` : ""}`}
          >
            <View style={s.menuIconBox}>
              <Ionicons name={item.icon} size={20} color={C.primary} />
            </View>
            <Text style={s.menuLabel}>{item.label}</Text>
            {item.badge > 0 && (
              <View style={{ backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 }}>
                <Text style={{ color: C.onPrimary, fontSize: 11, fontWeight: "700" }}>{item.badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => Alert.alert("Log out?", "Log out of Skillomate on this device? You’ll need to sign in again to access your courses and downloads.", [
            { text: "Cancel", style: "cancel" },
            { text: "Log out", style: "destructive", onPress: () => onLogout?.() },
          ])}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Log out of Skillomate"
          testID="profile-logout"
        >
          <Ionicons name="log-out-outline" size={18} color={C.danger} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={s.dangerZone}>
          <Text style={s.dangerZoneLabel}>Danger Zone</Text>
          <TouchableOpacity
            style={s.deleteAccountRow}
            onPress={() => setShowDeleteAccount(true)}
            accessibilityRole="button"
            accessibilityLabel="Permanently delete account"
            accessibilityHint="Opens a confirmation form"
            testID="open-delete-account"
          >
            <View style={s.deleteAccountRowIcon}>
              <Ionicons name="trash-outline" size={19} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deleteAccountRowTitle}>Delete Account</Text>
              <Text style={s.deleteAccountRowSubtitle}>Permanently remove your account and data</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.danger} />
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: "center", color: C.textMuted, fontSize: 12, marginTop: 16 }}>Version 1.0</Text>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteAccount}
        user={user}
        onClose={() => setShowDeleteAccount(false)}
        onDeleteAccount={onDeleteAccount}
      />
      <BottomNav active="" onHome={onGoToHome} onCourses={onGoToCourses} onAI={onGoToAI} onDownloads={onGoToDownloads} aiRobotId={aiRobotId} persistent />
    </View>
  );
}

const AI_SUGGESTIONS = [
  "Explain prompt engineering with an example",
  "My AI character's face changes between clips",
  "Help me choose a course",
];

function formatAiCourseName(course) {
  return (course?.title || course?.name || course?.id || course?._id || "AI Full Course")
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
      course._id,
      course.title,
      course.slug,
      course.name,
      ...(Array.isArray(course.modules) ? course.modules : []),
    ].map(normalizeAiCourseKey);
    return candidates.some(candidate =>
      candidate && values.some(value => value === candidate || value.includes(candidate) || candidate.includes(value))
    );
  }) || null;
}

function RobotAvatar({ robotId, size = 30, animated = false, replying = false, mood = "idle" }) {
  const motion = useRef(new Animated.Value(0)).current;
  const resolvedRobotId = AI_ROBOT_IMAGES[robotId] ? robotId : DEFAULT_AI_ROBOT_ID;
  const isSignatureRobot = resolvedRobotId === DEFAULT_AI_ROBOT_ID;
  const src = mood === "thinking" && isSignatureRobot ? AI_ROBOT_THINKING_IMAGE : AI_ROBOT_IMAGES[resolvedRobotId];

  useEffect(() => {
    if (!animated && !replying) {
      motion.stopAnimation();
      motion.setValue(0);
      return undefined;
    }
    const sequence = Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(motion, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]);
    const animation = animated ? Animated.loop(sequence) : sequence;
    animation.start();
    return () => animation.stop();
  }, [animated, motion, replying]);

  const motionStyle = animated || replying ? {
    transform: [
      { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
      { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
  } : null;

  if (!src) return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="sparkles" size={size * 0.5} color={C.onPrimary} />
    </View>
  );
  return (
    <Animated.View accessible={false} style={[{
      width: size, height: size,
      borderRadius: isSignatureRobot ? 0 : size / 2,
      overflow: isSignatureRobot ? "visible" : "hidden",
      backgroundColor: isSignatureRobot ? "transparent" : C.cardBg,
      borderWidth: isSignatureRobot ? 0 : 1,
      borderColor: C.border,
    }, motionStyle]}>
      <Image source={src} style={{ width: size, height: size }} resizeMode={isSignatureRobot ? "contain" : "cover"} />
    </Animated.View>
  );
}

function TypingDots({ color = C.primary }) {
  const dots = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.stagger(140, dots.map(dot => Animated.sequence([
      Animated.timing(dot, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0.35, duration: 260, useNativeDriver: true }),
    ]))));
    animation.start();
    return () => animation.stop();
  }, [dots]);

  return (
    <View accessible={false} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
            opacity: dot,
            transform: [{ translateY: dot.interpolate({ inputRange: [0.35, 1], outputRange: [1, -2] }) }],
          }}
        />
      ))}
    </View>
  );
}

function AiAssistantScreen({
  mode = "master",
  fixedCourse = null,
  user,
  session,
  onBack,
  onGoToHome,
  onGoToCourses,
  onGoToDownloads,
  onGoToProfile,
  onRobotChange,
  isRootTabActive = true,
}) {
  const aiMounted = useRef(false);
  useEffect(() => { aiMounted.current = true; return () => { aiMounted.current = false; }; }, []);
  const aiInFlight = useRef(false);
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
  const [robotId, setRobotId] = useState(DEFAULT_AI_ROBOT_ID);
  const [showRobotPicker, setShowRobotPicker] = useState(false);
  const [assistantName, setAssistantName] = useState(DEFAULT_AI_NAME);
  const [assistantNameDraft, setAssistantNameDraft] = useState("");
  const [nameSetupComplete, setNameSetupComplete] = useState(false);
  const [showNameSetup, setShowNameSetup] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef(null);
  const aiGeneration = useRef(0);
  const chatStorageKey = useMemo(
    () => aiChatStorageKey(user, mode, fixedCourse),
    [fixedCourse?._id, fixedCourse?.id, fixedCourse?.slug, fixedCourse?.title, mode, user?._id, user?.id]
  );

  const introMessages = useCallback((content = null) => [{
    role: "assistant",
    content: content || (isCourseMode
      ? `Ask doubts from ${fixedCourse?.title || "this course"}. I will answer only from this course's indexed lessons.`
      : "Ask anything from your indexed courses. I can search across all course lessons."),
    createdAt: Date.now(),
  }], [fixedCourse?.title, isCourseMode]);

  const replaceActiveConversationMessages = useCallback((nextMessages) => {
    const normalizedMessages = nextMessages.map(message => ({
      ...message,
      createdAt: message.createdAt || Date.now(),
    })).slice(-MAX_AI_CHAT_MESSAGES);
    setMessages(normalizedMessages);
    if (!activeConversationId) return;
    setConversations(current => {
      const next = current.map(session => (
        session.id === activeConversationId
          ? { ...session, messages: normalizedMessages, updatedAt: Date.now() }
          : session
      ));
      writeAiChatSessions(chatStorageKey, next);
      return next;
    });
  }, [activeConversationId, chatStorageKey]);

  const appendAiConversationMessage = useCallback((sessionId, message) => {
    const record = {
      role: message.role,
      id: message.id || null,
      content: String(message.content || "").slice(0, 4000),
      failed: Boolean(message.failed),
      createdAt: Date.now(),
    };
    setMessages(current => [...current, record].slice(-MAX_AI_CHAT_MESSAGES));
    setConversations(current => {
      const session = current.find(item => item.id === sessionId) || createAiConversationSession(introMessages());
      const updatedMessages = [...session.messages, record].slice(-MAX_AI_CHAT_MESSAGES);
      const updated = {
        ...session,
        id: sessionId,
        title: record.role === "user" && session.title === "New chat" ? aiChatTitle(record.content) : session.title,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };
      const next = [updated, ...current.filter(item => item.id !== sessionId)].slice(0, MAX_AI_CHAT_SESSIONS);
      writeAiChatSessions(chatStorageKey, next);
      return next;
    });
    return record;
  }, [chatStorageKey, introMessages]);

  const startNewChat = useCallback(() => {
    aiGeneration.current += 1;
    const active = conversations.find(session => session.id === activeConversationId);
    const next = active && !active.messages.some(message => message.role === "user")
      ? active
      : createAiConversationSession(introMessages());
    if (!active || active.messages.some(message => message.role === "user")) {
      setConversations(current => [next, ...current].slice(0, MAX_AI_CHAT_SESSIONS));
    }
    setActiveConversationId(next.id);
    setMessages(next.messages);
    setInput("");
    setHistoryOpen(false);
    setStatus(status === "offline" ? "offline" : "online");
  }, [activeConversationId, conversations, introMessages, status]);

  const selectConversation = useCallback((session) => {
    aiGeneration.current += 1;
    setActiveConversationId(session.id);
    setMessages(session.messages?.length ? session.messages : introMessages());
    setInput("");
    setHistoryOpen(false);
  }, [introMessages]);

  useEffect(() => {
    AsyncStorage.getItem(AI_AVATAR_STORAGE_KEY).then(saved => {
      const nextRobotId = saved && AI_ROBOT_IMAGES[saved] ? saved : DEFAULT_AI_ROBOT_ID;
      setRobotId(nextRobotId);
      if (!saved) AsyncStorage.setItem(AI_AVATAR_STORAGE_KEY, nextRobotId).catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const keys = aiNameStorageKeys(user);
    Promise.all([AsyncStorage.getItem(keys.name), AsyncStorage.getItem(keys.setup)])
      .then(([savedName, savedSetup]) => {
        if (cancelled) return;
        const nextName = normalizeAiName(savedName) || DEFAULT_AI_NAME;
        const setupComplete = savedSetup === "true";
        setAssistantName(nextName);
        setAssistantNameDraft(nextName === DEFAULT_AI_NAME ? "" : nextName);
        setNameSetupComplete(setupComplete);
        setShowNameSetup(isRootTabActive && Boolean(user?._id) && !setupComplete);
      })
      .catch(() => {
        if (!cancelled) setShowNameSetup(isRootTabActive && Boolean(user?._id));
      });
    return () => { cancelled = true; };
  }, [isRootTabActive, user?._id]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(chatStorageKey)
      .then(raw => {
        if (cancelled) return;
        const stored = readAiChatSessions(raw);
        const initial = createAiConversationSession(introMessages());
        const next = [initial, ...stored].slice(0, MAX_AI_CHAT_SESSIONS);
        aiGeneration.current += 1;
        setConversations(next);
        setActiveConversationId(initial.id);
        setMessages(initial.messages);
        setInput("");
        setHistoryOpen(false);
      })
      .catch(() => {
        if (cancelled) return;
        const initial = createAiConversationSession(introMessages());
        setConversations([initial]);
        setActiveConversationId(initial.id);
        setMessages(initial.messages);
      });
    return () => { cancelled = true; };
  }, [chatStorageKey, introMessages]);

  async function saveAiName(value = assistantNameDraft) {
    const nextName = normalizeAiName(value) || DEFAULT_AI_NAME;
    const keys = aiNameStorageKeys(user);
    setAssistantName(nextName);
    setAssistantNameDraft(nextName === DEFAULT_AI_NAME ? "" : nextName);
    setNameSetupComplete(true);
    setShowNameSetup(false);
    await AsyncStorage.multiSet([[keys.name, nextName], [keys.setup, "true"]]).catch(() => {});
  }

  useEffect(() => {
    if (!AI_FEATURE_ENABLED) {
      setStatus("offline");
      setCourseScopeReady(false);
      replaceActiveConversationMessages([
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
      replaceActiveConversationMessages([{
        role: "assistant",
        content: "Please log in again before using Nex AI.",
      }]);
      return;
    }

    Promise.all([
      fetch(`${API_BASE}/api/health/db`).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not check Nex AI");
        return data;
      }),
      fetch(`${API_BASE}/api/courses`).then(async res => {
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
            replaceActiveConversationMessages([
              {
                role: "assistant",
                content: `Ask doubts from ${fixedCourse?.title || formatAiCourseName(matchedCourse)}. I will answer only from this course.`,
              },
            ]);
          } else {
            setCourseId(null);
            setCourseName(fixedCourse?.title || "Course AI");
            replaceActiveConversationMessages([
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
          replaceActiveConversationMessages([
            {
              role: "assistant",
              content: "I could not load the AI course index. Check that the AI service is running.",
            },
          ]);
        }
      });
  }, [fixedCourse, isCourseMode, replaceActiveConversationMessages, user?._id, user?.sessionId]);

  useEffect(() => {
    const scrollTimer = setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 80);
    return () => clearTimeout(scrollTimer);
  }, [messages, loading]);

  async function clearAiHistory() {
    try {
      await session.requestJson("/api/ai/history", { method: "DELETE" });
      await AsyncStorage.removeItem(chatStorageKey);
      const initial = createAiConversationSession(introMessages());
      aiGeneration.current += 1;
      setConversations([initial]);
      setActiveConversationId(initial.id);
      setMessages(initial.messages);
      setHistoryOpen(false);
      Alert.alert("AI history deleted", "Your Nex AI chat history was deleted.");
    } catch (_) {
      Alert.alert("Could not delete history", "Check your connection and try again.");
    }
  }

  function reportAiResponse(message) {
    if (!message?.id) {
      Alert.alert("Report unavailable", "This older response does not have a report identifier.");
      return;
    }
    const reasons = [
      ["Incorrect", "incorrect"],
      ["Harmful or unsafe", "harmful_or_unsafe"],
      ["Inappropriate", "inappropriate"],
      ["Privacy concern", "privacy_concern"],
      ["Other", "other"],
    ];
    Alert.alert("Report response", "Why are you reporting this response?", [
      ...reasons.map(([label, reason]) => ({
        text: label,
        onPress: async () => {
          try {
            const result = await session.requestJson("/api/ai/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageId: message.id, reason, response: message.content }),
            });
            Alert.alert("Report received", result.message || "Thanks. We will review this response.");
          } catch (_) {
            Alert.alert("Report not sent", "Check your connection and try again.");
          }
        },
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function sendAiMessage(value = input) {
    const question = value.trim();
    if (!question || loading || aiInFlight.current) return;
    if (!AI_FEATURE_ENABLED) {
      setInput("");
      const targetSessionId = activeConversationId || createAiConversationSession(introMessages()).id;
      appendAiConversationMessage(targetSessionId, { role: "user", content: question });
      appendAiConversationMessage(targetSessionId, { role: "assistant", content: "AI is paused for now." });
      return;
    }
    if (isCourseMode && !courseId) {
      const targetSessionId = activeConversationId || createAiConversationSession(introMessages()).id;
      appendAiConversationMessage(targetSessionId, {
        role: "assistant",
        content: "I cannot answer for this course yet because it is not indexed in the AI knowledge base.",
      });
      return;
    }

    const requestGeneration = aiGeneration.current;
    const requestSessionId = activeConversationId || createAiConversationSession(introMessages()).id;
    setInput("");
    appendAiConversationMessage(requestSessionId, { role: "user", content: question });
    setLoading(true);
    aiInFlight.current = true;

    try {
      const data = await requestTutor({ baseUrl: API_BASE, user, question, courseId, messages, assistantName, session });
      if (!aiMounted.current || requestGeneration !== aiGeneration.current) return;
      setStatus("online");
      appendAiConversationMessage(requestSessionId, { id: data.messageId, role: "assistant", content: data.answer });
    } catch (error) {
      if (!aiMounted.current || requestGeneration !== aiGeneration.current || ["SESSION_CHANGED", "SESSION_EXPIRED"].includes(error.code)) return;
      setInput(question);
      appendAiConversationMessage(requestSessionId, {
        role: "assistant", failed: true,
        content: error.name === "AbortError" ? "Nex AI took too long. Please try again." : error.message || "I could not reach Nex AI. Please try again.",
      });
      setStatus("offline");
    } finally {
      aiInFlight.current = false;
      if (aiMounted.current) setLoading(false);
    }
  }

  const hasConversation = messages.some(message => message.role === "user") || loading;
  const assistantStatusText = status !== "online"
    ? "Unavailable"
    : isCourseMode
      ? courseScopeReady ? "Scoped to this course" : "Course not indexed"
      : "Active now";
  const visibleConversations = conversations.filter(session => session.messages?.some(message => message.role === "user"));
  return (
    <View style={s.aiScreen}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <SafeAreaView style={s.aiTopSafe}>
        <View style={s.aiTopHeader}>
          <SkillomateLogo size="xs" mode="dark" />
          <View style={s.aiTopHeaderSpacer} />
        </View>

        <View style={s.aiIdentityBar}>
          <TouchableOpacity
            style={s.aiIdentityMenu}
            onPress={() => setHistoryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open chat history"
            accessibilityState={{ expanded: historyOpen }}
          >
            <Ionicons name="menu" size={22} color="#D9D2C8" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRobotPicker(true)}
            style={s.aiIdentityAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change AI companion"
          >
            <RobotAvatar robotId={robotId} size={46} mood={loading ? "thinking" : "idle"} animated={loading} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setAssistantNameDraft(assistantName === DEFAULT_AI_NAME ? "" : assistantName);
              setShowNameSetup(true);
            }}
            style={s.aiIdentityText}
            accessibilityRole="button"
            accessibilityLabel={`Customize AI name. Current name: ${assistantName}`}
          >
            <Text style={s.aiIdentityName} numberOfLines={1}>{assistantName}</Text>
            <View style={s.aiIdentityStatusRow}>
              <View style={[s.aiStatusDot, status === "online" ? s.aiStatusOnline : s.aiStatusOffline]} />
              <Text style={s.aiIdentityStatus} numberOfLines={1}>{assistantStatusText}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.aiIdentityAdd}
            onPress={startNewChat}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
          >
            <Ionicons name="add" size={23} color="#F5F1E8" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 74 : 0}
        style={[s.aiKeyboardArea, !isCourseMode && s.aiKeyboardAreaWithNav]}
      >
        {hasConversation ? (
          <FlatList
            ref={listRef}
            style={s.aiMessageList}
            data={messages}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={s.aiMessages}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={9}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={isRootTabActive ? ANDROID_CLIPPED_SUBVIEWS : false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            renderItem={({ item, index }) => {
              const isUser = item.role === "user";
              return (
                <View style={[s.aiMessageRow, isUser && s.aiMessageRowUser]}>
                  {!isUser && <RobotAvatar robotId={robotId} size={46} replying={!loading && index === messages.length - 1 && messages.length > 1} />}
                  <View style={[s.aiBubble, isUser && s.aiBubbleUser]}>
                    <Text style={[s.aiBubbleText, isUser && s.aiBubbleTextUser]}>{item.content}</Text>
                    {!isUser && item.id ? (
                      <TouchableOpacity
                        onPress={() => reportAiResponse(item)}
                        style={{ alignSelf: "flex-end", marginTop: 7, minWidth: 44, minHeight: 30, alignItems: "center", justifyContent: "center" }}
                        accessibilityRole="button"
                        accessibilityLabel="Report AI response"
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={C.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {isUser && <AvatarImage avatarId={user?.avatar || "a1"} size={30} />}
                </View>
              );
            }}
            ListFooterComponent={loading ? (
              <View style={s.aiMessageRow}>
                <View style={{ alignItems: "center", paddingTop: 14 }}>
                  <View style={{ position: "absolute", zIndex: 2, top: 0, left: 28, minWidth: 44, height: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg, alignItems: "center", justifyContent: "center" }}>
                    <TypingDots />
                  </View>
                  <RobotAvatar robotId={robotId} size={68} mood="thinking" animated />
                </View>
                <View style={[s.aiBubble, s.aiTypingBubble]}>
                  <Text style={s.aiTypingText}>{assistantName} is thinking...</Text>
                </View>
              </View>
            ) : null}
          />
        ) : (
          <ScrollView
            style={s.aiWelcomeScroll}
            contentContainerStyle={s.aiWelcomeContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <RobotAvatar robotId={robotId} size={108} />
            <Text style={s.aiWelcomeTitle}>What can I help you learn?</Text>
            <Text style={s.aiWelcomeSubtitle}>Ask about your course, a project problem, or practise with a quiz.</Text>
            <View style={s.aiWelcomePrompts}>
              {AI_SUGGESTIONS.map(prompt => (
                <TouchableOpacity
                  key={prompt}
                  style={s.aiSuggestion}
                  onPress={() => sendAiMessage(prompt)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask ${assistantName}: ${prompt}`}
                >
                  <Text style={s.aiSuggestionText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        <View style={[s.aiComposer, isCourseMode && s.aiComposerStandalone]}>
          <View style={s.aiComposerRow}>
            <TextInput
              style={s.aiInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your course or project..."
              placeholderTextColor="#A39D95"
              editable={!loading}
              multiline
              accessibilityLabel={`Message ${assistantName}`}
            />
            <TouchableOpacity
              style={[s.aiSend, (!input.trim() || loading) && s.aiSendDisabled]}
              onPress={() => sendAiMessage()}
              disabled={!input.trim() || loading}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !input.trim() || loading }}
            >
              <Ionicons name="arrow-up" size={20} color="#17130B" />
          </TouchableOpacity>
        </View>
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

      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={s.aiHistoryOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHistoryOpen(false)} accessible={false} />
          <View style={s.aiHistorySheet}>
            <View style={s.aiHistoryHeader}>
              <View>
                <Text style={s.aiHistoryEyebrow}>{assistantName} CHATS</Text>
                <Text style={s.aiHistoryTitle}>Chat history</Text>
              </View>
              <TouchableOpacity
                onPress={() => setHistoryOpen(false)}
                style={s.aiHistoryClose}
                accessibilityRole="button"
                accessibilityLabel="Close chat history"
              >
                <Ionicons name="close" size={20} color="#F5F1E8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={startNewChat}
              style={s.aiHistoryNewChat}
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
            >
              <Text style={s.aiHistoryNewChatText}>New chat</Text>
              <Ionicons name="add" size={20} color="#17130B" />
            </TouchableOpacity>

            <Text style={s.aiHistoryLabel}>Previous chats</Text>
            {visibleConversations.length ? (
              <ScrollView style={s.aiHistoryList} contentContainerStyle={s.aiHistoryListContent} showsVerticalScrollIndicator={false}>
                {visibleConversations.map(item => {
                  const active = item.id === activeConversationId;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => selectConversation(item)}
                      style={[s.aiHistoryItem, active && s.aiHistoryItemActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open chat ${item.title}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={s.aiHistoryItemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.aiHistoryItemMeta} numberOfLines={1}>{aiChatDateLabel(item.updatedAt)} · {item.messages.length} messages</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={s.aiHistoryEmpty}>
                <Ionicons name="chatbubble-ellipses-outline" size={26} color="#E7BC68" />
                <Text style={s.aiHistoryEmptyText}>Your chats will appear here after you send a message.</Text>
              </View>
            )}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 10, gap: 8 }}>
              <Text style={s.aiHistoryLabel}>AI Data Controls</Text>
              <TouchableOpacity
                onPress={() => Alert.alert("Delete AI history?", "This removes your Nex AI conversations from this device and the server.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: clearAiHistory },
                ])}
                style={[s.aiHistoryNewChat, { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border }]}
                accessibilityRole="button"
                accessibilityLabel="Delete AI chat history"
              >
                <Text style={[s.aiHistoryNewChatText, { color: C.danger }]}>Delete AI history</Text>
                <Ionicons name="trash-outline" size={18} color={C.danger} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isRootTabActive && showNameSetup}
        transparent
        animationType="fade"
        onRequestClose={() => { if (nameSetupComplete) setShowNameSetup(false); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 24, width: "100%", maxWidth: 420 }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <RobotAvatar robotId={robotId} size={76} />
            </View>
            <Text style={{ color: C.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textAlign: "center", textTransform: "uppercase" }}>Your learning companion</Text>
            <Text style={{ color: C.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 5 }}>Name your AI</Text>
            <Text style={{ color: C.textSub, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7, marginBottom: 20 }}>Choose a personal name. You can change it anytime by tapping the name in the chat header.</Text>
            <Text style={{ color: C.text, fontSize: 12, fontWeight: "800", marginBottom: 7 }}>AI name</Text>
            <TextInput
              value={assistantNameDraft}
              onChangeText={setAssistantNameDraft}
              placeholder="Example: Nova"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={() => saveAiName()}
              style={{ minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.cardBg, color: C.text, paddingHorizontal: 14, fontSize: 15, fontWeight: "600" }}
              accessibilityLabel="AI name"
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                onPress={() => nameSetupComplete ? setShowNameSetup(false) : saveAiName(DEFAULT_AI_NAME)}
                style={[s.btn, { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg }]}
                accessibilityRole="button"
                accessibilityLabel={nameSetupComplete ? "Cancel AI name change" : "Use default AI name"}
              >
                <Text style={[s.btnText, { color: C.text }]}>{nameSetupComplete ? "Cancel" : "Use AI"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => saveAiName()}
                style={[s.btn, s.btnFill, { flex: 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Save AI name"
              >
                <Text style={s.btnText}>Save name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

function LegalContentScreen({ page = "privacy", onBack }) {
  const config = LEGAL_APP_PAGES[page] || LEGAL_APP_PAGES.privacy;

  return (
    <View style={s.legalScreen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={s.legalSafeArea}>
        <View style={s.legalHeader}>
          <TouchableOpacity
            onPress={onBack}
            style={s.legalBackButton}
            accessibilityRole="button"
            accessibilityLabel={`Close ${config.title}`}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={s.legalHeaderTitleWrap}>
            <Text style={s.legalHeaderEyebrow} numberOfLines={1}>{config.eyebrow}</Text>
            <Text style={s.legalHeaderTitle} numberOfLines={1}>{config.title}</Text>
          </View>
          <View style={s.legalHeaderIcon}>
            <Ionicons name={config.icon} size={20} color={C.primary} />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={s.legalContentScroll}
        contentContainerStyle={s.legalContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.legalIntroCard}>
          <Ionicons name={config.icon} size={26} color={C.primary} />
          <Text style={s.legalIntroText}>{config.intro}</Text>
        </View>

        {config.sections.map((section, index) => (
          <View key={section.title} style={s.legalSectionCard}>
            <View style={s.legalSectionNumber}>
              <Text style={s.legalSectionNumberText}>{String(index + 1).padStart(2, "0")}</Text>
            </View>
            <View style={s.legalSectionBody}>
              <Text style={s.legalSectionTitle}>{section.title}</Text>
              <Text style={s.legalSectionText}>{section.body}</Text>
            </View>
          </View>
        ))}

        <Text style={s.legalOfflineNote}>Available inside the app — no website required.</Text>
      </ScrollView>
    </View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [isRestoring, setIsRestoring] = useState(true);
  const [user, setUserState] = useState(null);
  const userRef = useRef(null);
  const sessionRef = useRef(null);
  const secureSessionStorageRef = useRef(null);
  if (!secureSessionStorageRef.current) {
    secureSessionStorageRef.current = createSecureSessionStorage({ secureStore: SecureStore, legacyStorage: AsyncStorage });
  }
  if (!sessionRef.current) sessionRef.current = createNativeSession({
    baseUrl: API_BASE, storage: secureSessionStorageRef.current,
    onChange: next => { userRef.current = next; setUserState(next); },
    onExpired: () => {
      setSelectedCourse(null); setStartIndex(null); setCourseAiTarget(null); setMainScreen("home");
      setLoginError("Your session has ended. Please log in again.");
    },
  });
  const nativeSession = sessionRef.current;
  const setUser = useCallback(value => sessionRef.current.setUser(value), []);
  const mergeAppleEntitlement = useCallback(entitlement => {
    setUser(previous => previous ? ({
      ...previous,
      entitlementState: entitlement.entitlementState,
      entitlementActive: entitlement.entitlementActive,
      entitlementExpiresAt: entitlement.entitlementState === "GRACE_PERIOD" ? entitlement.gracePeriodExpiresAt : entitlement.expiresAt,
      gracePeriodExpiresAt: entitlement.gracePeriodExpiresAt,
      entitlementSource: "apple",
      subscriptionExpiry: entitlement.entitlementState === "GRACE_PERIOD" ? entitlement.gracePeriodExpiresAt : entitlement.expiresAt,
      subscriptionStatus: entitlement.entitlementActive ? "active" : "expired",
    }) : previous);
  }, [setUser]);
  const appleSubscription = useAppleSubscriptions({
    session: nativeSession,
    user,
    onEntitlementChanged: mergeAppleEntitlement,
  });
  const [mainScreen, setMainScreen] = useState("home");
  const [legalPage, setLegalPage] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [startIndex, setStartIndex] = useState(null);
  const [initialTime, setInitialTime] = useState(0);
  const [preloadedVideos, setPreloadedVideos] = useState(null);
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);
  const [downloads, setDownloads] = useState({});
  const downloadsRef = useRef({});
  const downloadStorageReady = useRef(null);
  const [aiRobotId, setAiRobotId] = useState(null);
  const [showAppUpgrade, setShowAppUpgrade] = useState(false);
  const [showProblemReport, setShowProblemReport] = useState(false);
  const [problemReportRoute, setProblemReportRoute] = useState("home");
  const [courseAiTarget, setCourseAiTarget] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [courseProgress, setCourseProgress] = useState({});
  const [certificates, setCertificates] = useState([]);
  const [certModal, setCertModal] = useState(null);
  const openLegalPage = useCallback(page => {
    if (page === "privacy") {
      openSafeExternalUrl("https://skillomate.in/privacy", "legal");
      return;
    }
    setLegalPage(page);
  }, []);
  const openProblemReport = useCallback((route = "home") => {
    setProblemReportRoute(route || "home");
    setShowProblemReport(true);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passwordInputRef = useRef(null);
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
  const [signupPassword, setSignupPassword] = useState("");
  const [signupGender, setSignupGender] = useState("");
  const [signupAge, setSignupAge] = useState("");
  const [signupAvatar, setSignupAvatar] = useState("a1");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");

  const navigateRootTab = useCallback((targetTab, options = {}) => {
    if (targetTab === "profile") {
      if (options.validateOnly) return true;
      setShowAppUpgrade(false);
      setSelectedCourse(null);
      setStartIndex(null);
      setInitialTime(0);
      setPreloadedVideos(null);
      setIsPreviewOnly(false);
      setCourseAiTarget(null);
      setMainScreen("profile");
      return true;
    }
    if (!ROOT_TAB_ORDER.includes(targetTab)) return false;
    if (targetTab === "downloads" && !hasCourseAccess(userRef.current)) {
      if (!options.validateOnly) setShowAppUpgrade(true);
      return false;
    }
    if (options.validateOnly) return true;

    setShowAppUpgrade(false);
    setSelectedCourse(null);
    setStartIndex(null);
    setInitialTime(0);
    setPreloadedVideos(null);
    setIsPreviewOnly(false);
    setCourseAiTarget(null);
    setMainScreen(targetTab);
    return true;
  }, []);

  const refreshUser = useCallback(async (userId, fallback = null, sessionId = null) => {
    const owner = userRef.current;
    if (!owner || owner._id !== userId || owner.sessionId !== sessionId) return;
    const sameOwner = () => userRef.current?._id === userId && userRef.current?.sessionId === sessionId;
    try {
      const { user: fresh, wishlist: freshWishlist } = await nativeSession.requestJson(`/api/auth/validate/${encodeURIComponent(userId)}`);
      if (!sameOwner()) return;
      setUser(prev => ({ ...prev, ...fresh, sessionId: prev.sessionId,
        accessToken: prev.accessToken, token: prev.token, refreshToken: prev.refreshToken }));
      if (Array.isArray(freshWishlist)) setWishlist(freshWishlist);
    } catch { /* Temporary network errors retain the current session. */ }
  }, [nativeSession, setUser]);

  useEffect(() => {
    nativeSession.restore().then(async stored => {
      if (stored) await refreshUser(stored._id, stored, stored.sessionId);
    }).catch(() => {}).finally(() => setIsRestoring(false));
    AsyncStorage.getItem(AI_AVATAR_STORAGE_KEY).then(v => { if (v) setAiRobotId(v); }).catch(() => {});
  }, [nativeSession, refreshUser]);

  // Check independently of WebSocket support so a replaced login stops playback.
  useEffect(() => {
    const id = user?._id;
    const sid = user?.sessionId;
    if (!id || !sid) return;
    let disposed = false;
    let pending = false;
    async function validateSession() {
      if (pending || disposed || AppState.currentState === "background") return;
      pending = true;
      try {
        await nativeSession.requestJson(`/api/auth/validate/${encodeURIComponent(id)}`);
      } catch (error) {
        if (disposed || error?.code !== "SESSION_EXPIRED" || userRef.current?.sessionId !== sid) return;
        setLoginError("Your account is logged in on a different device.");
        // A network failure is not proof that the session was revoked.
      } finally {
        pending = false;
      }
    }
    validateSession();
    const timer = setInterval(validateSession, 15000);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") validateSession();
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [nativeSession, setUser, user?._id, user?.sessionId]);

  useEffect(() => { downloadsRef.current = downloads; }, [downloads]);



  // Migrate old document downloads and discard entries evicted from temporary storage.
  useEffect(() => {
    let mounted = true;
    const ready = prepareTemporaryDownloads(FileSystem, AsyncStorage);
    downloadStorageReady.current = ready;
    ready.then(verified => {
      if (!mounted) return;
      downloadsRef.current = verified;
      setDownloads(DEV_UI_QA_ENABLED ? { ...UI_QA_DOWNLOADS, ...verified } : verified);
    }).catch(() => {
      if (mounted && DEV_UI_QA_ENABLED) setDownloads(UI_QA_DOWNLOADS);
    });
    return () => { mounted = false; };
  }, []);

  const startDownload = useCallback(async (video, courseId, courseTitle) => {
    const u = userRef.current;
    const guid = getBunnyGuid(video);
    const libraryId = getBunnyLibraryId(video);
    if (!guid || !u?._id || !u?.sessionId) return;
    let filePath;
    try {
      await downloadStorageReady.current;
      filePath = downloadPath(FileSystem, guid);
      await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
    } catch {
      Alert.alert("Download unavailable", "Temporary storage could not be prepared. Restart the app and try again.");
      return;
    }
    const current = downloadsRef.current[guid];
    if (current?.status === "downloading") return;
    if (current?.status === "done" && (await FileSystem.getInfoAsync(filePath)).exists) return;
    const meta = { title: video.title || "Video", courseId: courseId || "", courseTitle: courseTitle || "", bunnyGuid: guid, bunnyLibraryId: libraryId, videoId: String(video._id || guid) };

    setDownloads(prev => ({ ...prev, [guid]: { status: "downloading", progress: 0, path: filePath, ...meta } }));
    try {
      const grant = await nativeSession.requestJson(`/api/videos/${encodeURIComponent(guid)}/download-grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!grant?.downloadUrl) throw new Error("The download authorization response was invalid.");
      const url = `${API_BASE}${grant.downloadUrl}`;
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
        Alert.alert("Downloaded", "Video saved in temporary app storage for offline viewing. Your device may clear it to free space.");
      } else {
        const errorMessage = getDownloadFailureMessage(null, result?.status);
        setDownloads(prev => ({ ...prev, [guid]: { status: "error", progress: 0, errorMessage, ...meta } }));
        Alert.alert("Download failed", errorMessage);
      }
    } catch (e) {
      const errorMessage = getDownloadFailureMessage(e);
      setDownloads(prev => ({ ...prev, [guid]: { status: "error", progress: 0, errorMessage, ...meta } }));
      Alert.alert("Download failed", errorMessage);
    }
  }, [nativeSession]);

  const retryDownload = useCallback((item) => {
    if (!item?.bunnyGuid || item.status !== "error") return;
    startDownload({
      _id: item.videoId || item.bunnyGuid,
      bunnyGuid: item.bunnyGuid,
      bunnyLibraryId: item.bunnyLibraryId || "",
      title: item.title || "Video",
    }, item.courseId || "", item.courseTitle || "");
  }, [startDownload]);

  const deleteDownload = useCallback(async (guid) => {
    await FileSystem.deleteAsync(downloadPath(FileSystem, guid), { idempotent: true }).catch(() => {});
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
      const data = await nativeSession.requestJson(`/api/user/${encodeURIComponent(u._id)}/progress`);
      const nextProgress = data.courseProgress || {};
      setCourseProgress(DEV_UI_QA_ENABLED && Object.keys(nextProgress).length === 0 ? UI_QA_PROGRESS : nextProgress);
    } catch {
      if (DEV_UI_QA_ENABLED) setCourseProgress(UI_QA_PROGRESS);
    }
  }, [nativeSession]);

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
      const data = await nativeSession.requestJson(`/api/user/${encodeURIComponent(u._id)}/certificates`);
      const nextCertificates = data.certificates || [];
      setCertificates(DEV_UI_QA_ENABLED && nextCertificates.length === 0 ? getQaCertificatesForUser(u) : nextCertificates);
    } catch {
      if (DEV_UI_QA_ENABLED) setCertificates(getQaCertificatesForUser(u));
    }
  }, [nativeSession]);

  useEffect(() => {
    if (user?._id && user?.sessionId) loadCertificates(user);
    else setCertificates(DEV_UI_QA_ENABLED && user?._id ? getQaCertificatesForUser(user) : []);
  }, [user?._id, user?.sessionId, loadCertificates]);

  const backToLessons = useCallback(() => {
    if (!isPreviewOnly) loadCourseProgress();
    setStartIndex(null);
    setInitialTime(0);
    setPreloadedVideos(Array.isArray(selectedCourse?.videos) ? selectedCourse.videos : null);
  }, [isPreviewOnly, selectedCourse, loadCourseProgress]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (legalPage) { setLegalPage(null); return true; }
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
        backToLessons();
        return true;
      }
      if (mainScreen === "courses" && selectedCourse) {
        loadCourseProgress();
        setSelectedCourse(null);
        return true;
      }
      if (mainScreen === "wishlist" || mainScreen === "certificates" || mainScreen === "subscription" || mainScreen === "help" || mainScreen === "terms" || mainScreen === "privacy") {
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
  }, [screen, otpSent, resetVisible, legalPage, courseAiTarget, certModal, showAppUpgrade, mainScreen, startIndex, selectedCourse, isPreviewOnly, loadCourseProgress, backToLessons]);

  const openCourse = useCallback(async (course, options = {}) => {
    const u = userRef.current;
    if (!hasCourseAccess(u)) { setShowAppUpgrade(true); return; }
    const prepareCourse = source => {
      const sourceVideos = sortLessons(source?.videos || []);
      const requestedIds = Array.isArray(options.videoIds) ? options.videoIds.map(String) : null;
      const videosById = new Map(sourceVideos.map((video, index) => [getVideoKey(video, index), video]));
      const videos = requestedIds
        ? requestedIds.map(id => videosById.get(id)).filter(Boolean)
        : sourceVideos;
      return {
        ...source,
        title: options.title || source?.title,
        videos,
      };
    };
    const fixtureCourse = DEV_UI_QA_ENABLED
      ? UI_QA_COURSES.find(item => item._id === course?._id)
      : null;
    if (fixtureCourse || course?.__homePlayableVideos || (DEV_UI_QA_ENABLED && Array.isArray(course?.videos) && course.videos.length > 0)) {
      const nextCourse = prepareCourse(fixtureCourse || course);
      setSelectedCourse(nextCourse);
      setPreloadedVideos(nextCourse.videos);
      setIsPreviewOnly(false);
      setInitialTime(options.initialTime || 0);
      setStartIndex(Number.isInteger(options.startIndex) ? options.startIndex : null);
      setMainScreen("courses");
      return;
    }
    try {
      const data = await nativeSession.requestJson(`/api/courses/${encodeURIComponent(course._id)}/videos`);
      setSelectedCourse(prepareCourse({ ...course, videos: data.videos || [] }));
      setPreloadedVideos(null);
      setIsPreviewOnly(false);
      setInitialTime(options.initialTime || 0);
      setStartIndex(Number.isInteger(options.startIndex) ? options.startIndex : null);
      setMainScreen("courses");
    } catch (e) {
      const accessMessage = String(e?.message || "");
      if (/subscription|expired|course access|entitlement/i.test(accessMessage)) {
        setShowAppUpgrade(true);
        return;
      }
      Alert.alert("Course unavailable", accessMessage || "Could not open course.");
    }
  }, [nativeSession]);

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
      const data = await nativeSession.requestJson("/api/user/progress/complete-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, videoId: id }),
      });
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
    } catch (_) {
      revertCompletion();
    }
  }, [courseProgress, nativeSession]);

  const saveVideoProgress = useCallback(async (courseId, videoId, currentTime, duration) => {
    const u = userRef.current;
    if (!u?._id || !u?.sessionId || !courseId || !videoId || !duration) return;
    const body = {
      courseId,
      videoId: String(videoId),
      currentTime,
      duration,
    };
    const applyProgressResult = data => {
      if (data.progress) {
        setCourseProgress(prev => ({ ...prev, [courseId]: data.progress }));
      } else if (data.eligibility) {
        setCourseProgress(prev => ({
          ...prev,
          [courseId]: progressFromLearningStatus(data.eligibility, prev[courseId]),
        }));
      }
      if (data.certificate) {
        setCertificates(prev => {
          const exists = prev.some(c => c.courseId === courseId);
          if (!exists) setCertModal(data.certificate);
          return exists ? prev : [data.certificate, ...prev];
        });
      }
    };
    try {
      let data;
      try {
        data = await nativeSession.requestJson(`/api/learning/${encodeURIComponent(courseId)}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (error?.status !== 404) throw error;
        data = await nativeSession.requestJson("/api/user/progress/update-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      applyProgressResult(data);
      return data;
    } catch (_) {
      return { error: "Offline: progress is not verified. Reconnect and replay unrecorded sections." };
    }
  }, [nativeSession]);

  const toggleWishlist = useCallback(async (courseId) => {
    const u = userRef.current;
    if (!u) return;
    // Optimistic update
    setWishlist(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
    try {
      const data = await nativeSession.requestJson("/api/user/wishlist/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      setWishlist(data.wishlist || []);
    } catch {
      // Network error — revert
      setWishlist(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
    }
  }, [nativeSession]);

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
              if (!prev || prev._id !== id || prev.sessionId !== sid) return prev;
              const merged = { ...prev, ...data.user, sessionId: sid, accessToken: prev.accessToken, token: prev.token, refreshToken: prev.refreshToken };
              return merged;
            });
          } else if (data.type === "USER_DELETED" || data.type === "SESSION_REPLACED") {
            if (userRef.current?._id !== id || userRef.current?.sessionId !== sid) return;
            intentionallyClosed = true;
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
    if (!email.trim() || !password.trim()) { setLoginError("Please enter your mobile number and password."); return; }
    setLoginLoading(true); setLoginError("");
    try {
      const identifier = email.replace(/\D/g, "");
      if (identifier.length !== 10) {
        setLoginError("Enter the 10-digit mobile number registered to your account.");
        return;
      }
      const { res, data } = await postApiJson("/api/auth/login", {
        mobileNumber: identifier,
        password,
      });
      if (!res.ok) {
        if (data?.code === "MOBILE_NOT_REGISTERED" || data?.code === "ACCOUNT_NOT_FOUND") {
          const digits = identifier.replace(/\D/g, "");
          const localMobile = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
          setLoginError("Account does not exist.");
          setSignupError("Account does not exist. Create your account to continue.");
          setMobile(localMobile.length === 10 ? localMobile : "");
          setScreen("signup1");
          return;
        }
        setLoginError(data.error || "Login failed.");
      }
      else {
        const authUser = normalizeAuthUser(data);
        if (!authUser) {
          setLoginError("Login succeeded, but the server response was incomplete.");
          return;
        }
        setUser(authUser);
        setWishlist(authUser.wishlist || []);
        clearLoginForm();
      }
    } catch (error) {
      setLoginError(
        error?.code === "API_TIMEOUT"
          ? "The server took too long to respond. Check your connection and try again."
          : "Cannot connect to server. Check Wi-Fi or mobile data and try again.",
      );
    }
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
    if (!signupAge || Number(signupAge) < 13 || Number(signupAge) > 80) { setSignupError("Select your age. Skillomate is for learners aged 13 and older."); return; }
    if (!signupToken && !DEV_UI_QA_ENABLED) { setSignupError("Please verify your mobile number again."); setScreen("signup1"); return; }
    setSignupLoading(true); setSignupError("");
    try {
      const mobileNumber = mobile.trim();
      const fullName = signupFullName.trim();
      const { res, data } = await postApiJson(["/api/auth/register", "/api/auth/signup"], {
        fullName,
        name: fullName,
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
    setSignupFullName(""); setSignupPassword(""); setSignupGender(""); setSignupAge(""); setSignupAvatar("a1"); setSignupError("");
  }

  async function handleLogout() {
    AsyncStorage.removeItem(AI_AVATAR_STORAGE_KEY).catch(() => {});
    setAiRobotId(null);
    setWishlist([]);
    setCourseProgress({});
    clearLoginForm();
    resetSignup();
    setLegalPage(null);
    setUser(null); setSelectedCourse(null); setStartIndex(null); setCourseAiTarget(null); setMainScreen("home");
    await nativeSession.flush().catch(() => {});
  }

  async function handleDeleteAccount({ password: currentPassword, confirmation }) {
    const currentUser = userRef.current;
    if (!currentUser?._id || !currentUser?.sessionId) {
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }

    try {
      await nativeSession.requestJson("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        password: currentPassword,
        confirmation,
        }),
      });

      if (DOWNLOADS_DIR) await FileSystem.deleteAsync(DOWNLOADS_DIR, { idempotent: true }).catch(() => {});
      await AsyncStorage.multiRemove([AI_AVATAR_STORAGE_KEY, DOWNLOADS_STORAGE_KEY]);

      setDownloads({});
      setAiRobotId(null);
      setWishlist([]);
      setCourseProgress({});
      setCertificates([]);
      setCertModal(null);
      setShowAppUpgrade(false);
      clearLoginForm();
      resetSignup();
      setUser(null);
      setSelectedCourse(null);
      setStartIndex(null);
      setInitialTime(0);
      setPreloadedVideos(null);
      setIsPreviewOnly(false);
      setCourseAiTarget(null);
      setLegalPage(null);
      setMainScreen("home");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Cannot connect to server. Check your connection and try again." };
    }
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

  if (legalPage) {
    return <LegalContentScreen page={legalPage} onBack={() => setLegalPage(null)} />;
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
                accessibilityLabel="Mobile verification code"
              />
              <TouchableOpacity style={s.otpResendBtn}
                onPress={() => { setOtpSent(false); setOtp(""); setSignupError(""); }}
                accessibilityRole="button"
                accessibilityLabel="Resend mobile verification code">
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
            onPress={() => setLegalPage("terms")}
            accessibilityRole="button"
            accessibilityLabel="Read Terms and Conditions"
          >
            <Text style={s.legalLinkText}>Terms &amp; Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openLegalPage("privacy")}
            accessibilityRole="button"
            accessibilityLabel="Read Privacy Policy"
          >
            <Text style={s.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={resetSignup} style={s.authLink} accessibilityRole="button" accessibilityLabel="Return to login">
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
                  <Ionicons name="checkmark" size={10} color={C.onPrimary} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FieldInput label="FIRST NAME" placeholder="e.g. Alex"
          value={signupFullName} onChangeText={setSignupFullName} />
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
          accessibilityRole="button"
          accessibilityLabel="Complete profile"
          accessibilityState={{ disabled: signupLoading, busy: signupLoading }}
        >
          {signupLoading
            ? <ActivityIndicator color={C.onPrimary} />
            : <Text style={{ color: C.onPrimary, fontWeight: "900", fontSize: 16 }}>Complete My Profile</Text>
          }
        </TouchableOpacity>

        <Text style={s.termsText}>By continuing, you agree to Skillomate policies.</Text>
        <View style={s.legalLinksRow}>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => setLegalPage("terms")}
            accessibilityRole="button"
            accessibilityLabel="Read Terms and Conditions"
          >
            <Text style={s.legalLinkText}>Terms &amp; Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.legalLinkButton}
            onPress={() => openLegalPage("privacy")}
            accessibilityRole="button"
            accessibilityLabel="Read Privacy Policy"
          >
            <Text style={s.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={resetSignup} style={s.authLink} accessibilityRole="button" accessibilityLabel="Return to login">
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
  <View style={s.authScreen}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <SafeAreaView style={s.authSafeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.authKeyboardView}>
        <ScrollView
          contentContainerStyle={s.authScrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.authContent}>
            <View style={s.authBrand}>
              <SkillomateLogo size="md" />
              <Text style={s.authBrandTagline}>LEARN · GROW · EARN</Text>
            </View>

            <View style={s.authHeadingBlock}>
              <Text style={s.authWelcome}>Welcome back</Text>
              <Text style={s.authWelcomeSub}>Continue your AI learning journey.</Text>
            </View>

            <View style={s.authForm}>
              <FieldInput
                label="Mobile number"
                placeholder="Enter your mobile number"
                value={email}
                onChangeText={text => setEmail(text.replace(/[^0-9]/g, ""))}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="tel"
                textContentType="telephoneNumber"
                keyboardType="phone-pad"
                maxLength={10}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />

              <View style={s.authPasswordLabelRow}>
                <Text style={[s.fieldLabel, { marginBottom: 0 }]}>PASSWORD</Text>
                <TouchableOpacity
                  onPress={openPasswordReset}
                  style={s.authForgotButton}
                  accessibilityRole="button"
                  accessibilityLabel="Reset forgotten password"
                >
                  <Text style={s.authForgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <FieldInput
                inputRef={passwordInputRef}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={login}
              />

              {!!loginError && (
                <View style={s.authErrorBanner} accessibilityRole="alert">
                  <Ionicons name="alert-circle-outline" size={18} color={C.danger} />
                  <Text style={s.authErrorText}>{loginError}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={login}
                disabled={loginLoading || !email.trim() || !password.trim()}
                style={[
                  s.authPrimaryButton,
                  (loginLoading || !email.trim() || !password.trim()) && s.authPrimaryButtonDisabled,
                ]}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel="Log in"
                accessibilityState={{
                  disabled: loginLoading || !email.trim() || !password.trim(),
                  busy: loginLoading,
                }}
              >
                {loginLoading
                  ? <ActivityIndicator color={C.onPrimary} />
                  : <Text style={s.authPrimaryButtonText}>Log in</Text>
                }
              </TouchableOpacity>

              <View style={s.authCreateRow}>
                <Text style={s.authCreatePrompt}>New to Skillomate?</Text>
                <TouchableOpacity
                  onPress={() => { setScreen("signup1"); setSignupError(""); }}
                  style={s.authCreateButton}
                  accessibilityRole="button"
                  accessibilityLabel="Create an account"
                >
                  <Text style={s.authCreateText}>Create account</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.authFooter}>
              <TouchableOpacity onPress={() => setLegalPage("terms")} style={s.authFooterLink} accessibilityRole="button" accessibilityLabel="Read Terms and Conditions">
                <Text style={s.authFooterLinkText}>Terms</Text>
              </TouchableOpacity>
              <Text style={s.authFooterSeparator}>|</Text>
              <TouchableOpacity onPress={() => openLegalPage("privacy")} style={s.authFooterLink} accessibilityRole="button" accessibilityLabel="Read Privacy Policy">
                <Text style={s.authFooterLinkText}>Privacy</Text>
              </TouchableOpacity>
              <Text style={s.authFooterSeparator}>|</Text>
              <TouchableOpacity onPress={() => setLegalPage("help")} style={s.authFooterLink} accessibilityRole="button" accessibilityLabel="Open support information">
                <Text style={s.authFooterLinkText}>Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
        session={nativeSession}
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
          course={selectedCourse}
          initialIndex={startIndex}
          initialTime={initialTime}
          downloads={downloads}
          preloadedVideos={preloadedVideos || (DEV_UI_QA_ENABLED ? selectedCourse.videos : null)}
          user={user}
          session={nativeSession}
          onVideoComplete={isPreviewOnly ? undefined : markVideoComplete}
          onVideoProgress={isPreviewOnly ? undefined : saveVideoProgress}
          onReportProblem={openProblemReport}
          onGoToDownloads={() => navigateRootTab("downloads")}
          onDownload={(video, courseId, courseTitle) => startDownload(video, courseId, courseTitle)}
          onBack={backToLessons}
        />
        <CertificateModal cert={certModal} onClose={() => setCertModal(null)} />
        <ProblemReportModal
          visible={showProblemReport}
          onClose={() => setShowProblemReport(false)}
          user={user}
          route={problemReportRoute}
        />
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
        onGoToHome={() => { loadCourseProgress(); setSelectedCourse(null); navigateRootTab("home"); }}
        onGoToCourses={() => { loadCourseProgress(); setSelectedCourse(null); navigateRootTab("courses"); }}
        onGoToAI={() => { setSelectedCourse(null); navigateRootTab("ai"); }}
        onGoToDownloads={() => { setSelectedCourse(null); navigateRootTab("downloads"); }}
        onGoToProfile={() => { setSelectedCourse(null); navigateRootTab("profile"); }}
        aiRobotId={aiRobotId}
      />
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
        session={nativeSession}
        appleSubscription={appleSubscription}
        onBack={() => setMainScreen("profile")}
        onOpenTerms={() => setLegalPage("terms")}
        onOpenPrivacy={() => openLegalPage("privacy")}
      />
    );
  }

  if (mainScreen === "help") {
    return (
      <InfoPageScreen
        page={HELP_SUPPORT_CONTENT}
        onBack={() => setMainScreen("profile")}
      />
    );
  }

  if (mainScreen === "terms") {
    return (
      <InfoPageScreen
        page={TERMS_CONTENT}
        onBack={() => setMainScreen("profile")}
      />
    );
  }

  if (mainScreen === "privacy") {
    return (
      <InfoPageScreen
        page={PRIVACY_CONTENT}
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
        onGoToSubscription={() => setMainScreen("subscription")}
        onStartTrial={openMembershipAccess}
        trialLoading={false}
      />
    );
  }

  function renderRootTab(tab, { isActive = false } = {}) {
    if (tab === "courses") {
      return (
        <CourseListScreen
          onSelect={c => openCourse(c)}
          user={user}
          courseProgress={courseProgress}
          onRefreshProgress={loadCourseProgress}
          wishlist={wishlist}
          onToggleWishlist={toggleWishlist}
          onGoToHome={() => { loadCourseProgress(); navigateRootTab("home"); }}
          onGoToCourses={() => navigateRootTab("courses")}
          onGoToAI={() => navigateRootTab("ai")}
          onGoToDownloads={() => navigateRootTab("downloads")}
          onGoToProfile={() => navigateRootTab("profile")}
          onGoToSubscription={() => setMainScreen("subscription")}
          onStartTrial={openMembershipAccess}
          trialLoading={false}
          aiRobotId={aiRobotId}
          keepPreviewMounted
          activeTab="courses"
        />
      );
    }

  if (tab === "downloads") {
    const downloadItems = Object.values(downloads).filter(d => d.bunnyGuid);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor={C.white} />
        <SafeAreaView style={{ backgroundColor: C.white }}>
          <View style={[s.pageHeader, s.pageHeaderLogoOnly]}>
            <SkillomateLogo size="sm" />
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
            renderItem={({ item }) => {
              const isDone = item.status === "done";
              const isDownloading = item.status === "downloading";
              const isError = item.status === "error";
              const progressPercent = Math.round((item.progress || 0) * 100);
              const statusColor = isError ? C.danger : isDone ? C.success : C.primary;
              const DownloadContent = isDone ? TouchableOpacity : View;

              const playDownload = () => {
                const offlineVideo = {
                  _id: item.videoId || item.bunnyGuid,
                  bunnyGuid: item.bunnyGuid,
                  bunnyLibraryId: item.bunnyLibraryId || "",
                  title: item.title,
                  order: 0,
                };
                const offlineCourseId = item.courseId && /^[a-f0-9]{24}$/i.test(item.courseId)
                  ? item.courseId : "000000000000000000000000";
                setSelectedCourse({ _id: offlineCourseId, title: item.courseTitle || "Downloaded Video", videos: [offlineVideo] });
                setPreloadedVideos([offlineVideo]);
                setStartIndex(0);
                setInitialTime(0);
                setMainScreen("courses");
              };

              return (
                <View style={[s.dlVideoRow, isError && s.dlVideoRowError]}>
                  <View style={s.dlVideoRowMain}>
                    <DownloadContent
                      style={s.dlVideoContent}
                      accessible
                      accessibilityRole={isDone ? "button" : "text"}
                      accessibilityLabel={
                        isDone
                          ? `${item.title}. Ready offline. Tap to play.`
                          : isDownloading
                            ? `${item.title}. Downloading ${progressPercent} percent.`
                            : `${item.title}. Download failed. ${item.errorMessage || "Check your connection and course access, then retry."}`
                      }
                      accessibilityState={{ disabled: !isDone, busy: isDownloading }}
                      {...(isDone ? {
                        activeOpacity: 0.85,
                        onPress: playDownload,
                        accessibilityHint: "Opens the offline lesson player",
                      } : {})}
                    >
                      <View style={[s.dlVideoThumb, !isDone && { opacity: 0.72 }]}>
                        <RemoteThumbnailImage
                          imageUrl={`${API_BASE}/api/bunny/thumbnail/${item.bunnyGuid}?libraryId=${encodeURIComponent(item.bunnyLibraryId || "")}`}
                          screen="Downloads thumbnail"
                          courseId={item.courseId}
                          borderRadius={10}
                        />
                        <View style={[StyleSheet.absoluteFill, s.dlVideoThumbOverlay]}>
                          {isDownloading
                            ? <ActivityIndicator size="small" color={C.primary} />
                            : <Ionicons name={isError ? "alert-circle" : "play-circle"} size={32} color={isError ? C.danger : "#fff"} />
                          }
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
                              name={isError ? "alert-circle-outline" : isDownloading ? "cloud-download-outline" : "checkmark-circle"}
                              size={13}
                              color={statusColor}
                            />
                            <Text style={{ color: statusColor, fontSize: 11, fontWeight: "700" }}>
                              {isError ? "Download failed" : isDownloading ? `Downloading ${progressPercent}%` : "Ready offline"}
                            </Text>
                          </View>
                          {isDownloading && (
                            <View style={[s.dlProgressBar, { flex: 1, minWidth: 36, marginTop: 0 }]}>
                              <View style={[s.dlProgressFill, { width: `${progressPercent}%` }]} />
                            </View>
                          )}
                          {isDone && item.size > 0 && (
                            <Text style={{ color: C.textMuted, fontSize: 11 }}>
                              {item.size > 1024 * 1024 * 1024
                                ? `${(item.size / (1024 * 1024 * 1024)).toFixed(1)} GB`
                                : `${Math.round(item.size / (1024 * 1024))} MB`}
                            </Text>
                          )}
                        </View>
                      </View>
                    </DownloadContent>
                    <TouchableOpacity
                      style={s.dlDeleteButton}
                      onPress={() => {
                        Alert.alert("Remove Download", `Remove "${item.title}" from downloads?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => deleteDownload(item.bunnyGuid) },
                        ]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.title} from downloads`}
                    >
                      <Ionicons name="trash-outline" size={20} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {isError && (
                    <View style={s.dlErrorFooter}>
                      <Text style={s.dlErrorMessage}>
                        {item.errorMessage || "The download did not finish. Check your connection and course access, then retry."}
                      </Text>
                      <TouchableOpacity
                        style={s.dlRetryButton}
                        onPress={() => retryDownload(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Retry download ${item.title}`}
                      >
                        <Ionicons name="refresh" size={16} color={C.onPrimary} />
                        <Text style={s.dlRetryButtonText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        <BottomNav active="downloads"
          onHome={() => navigateRootTab("home")}
          onCourses={() => navigateRootTab("courses")}
          onAI={() => navigateRootTab("ai")}
          onDownloads={() => {}}
          onProfile={() => navigateRootTab("profile")}
          aiRobotId={aiRobotId}
        />
      </View>
    );
  }

  if (tab === "ai") {
    return (
      <AiAssistantScreen
        session={nativeSession}
        user={user}
        isRootTabActive={isActive}
        onGoToHome={() => navigateRootTab("home")}
        onGoToCourses={() => navigateRootTab("courses")}
        onGoToDownloads={() => navigateRootTab("downloads")}
        onGoToProfile={() => navigateRootTab("profile")}
        onRobotChange={id => setAiRobotId(id)}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <HomeScreen
        session={nativeSession}
        user={user}
        onGoToCourses={() => navigateRootTab("courses")}
        onGoToAI={() => navigateRootTab("ai")}
        onGoToDownloads={() => navigateRootTab("downloads")}
        onGoToProfile={() => navigateRootTab("profile")}
        onGoToSubscription={() => setMainScreen("subscription")}
        onStartTrial={openMembershipAccess}
        trialLoading={false}
        onSelectCourse={course => openCourse(course)}
        onResumeCourse={(course, idx, secs) => {
          openCourse(course, { startIndex: idx, initialTime: secs });
        }}
        onOpenLessonCollection={(course, options) => openCourse(course, options)}
        onReportProblem={() => openProblemReport("home")}
        onOpenHeroPreview={openHeroPreview}
        courseProgress={courseProgress}
        aiRobotId={aiRobotId}
      />
    </View>
  );
  }

  if (mainScreen === "profile") {
    return (
      <ProfileScreen
        user={user}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        wishlistCount={wishlist.length}
        certificatesCount={certificates.length}
        onGoToWishlist={() => setMainScreen("wishlist")}
        onGoToCertificates={() => setMainScreen("certificates")}
        onGoToSubscription={() => setMainScreen("subscription")}
        onOpenLegal={setLegalPage}
        onGoToHome={() => navigateRootTab("home")}
        onGoToCourses={() => navigateRootTab("courses")}
        onGoToAI={() => navigateRootTab("ai")}
        onGoToDownloads={() => navigateRootTab("downloads")}
        onAvatarChange={avatarId => {
          setUser(prev => {
            if (!prev) return prev;
            return { ...prev, avatar: avatarId };
          });
        }}
        aiRobotId={aiRobotId}
      />
    );
  }

  const activeRootTab = ROOT_TAB_ORDER.includes(mainScreen) ? mainScreen : "home";
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SwipeableRootTabs
        activeTab={activeRootTab}
        onNavigate={navigateRootTab}
        renderTab={renderRootTab}
      />
      <CertificateModal cert={certModal} onClose={() => setCertModal(null)} />
      <ProblemReportModal
        visible={showProblemReport}
        onClose={() => setShowProblemReport(false)}
        user={user}
        route={problemReportRoute}
      />
      <UpgradeModal
        visible={showAppUpgrade}
        onClose={() => setShowAppUpgrade(false)}
        onStartTrial={openMembershipAccess}
        trialLoading={false}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C) {
return StyleSheet.create({
	  // Logo
	  logoWrap: {
	    alignItems: "flex-start",
	    justifyContent: "center",
	    overflow: "visible",
	  },
	  logoImage: {
	    width: "100%",
	    height: "100%",
	  },
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
  authScreen: { flex: 1, backgroundColor: C.bg },
  authSafeArea: { flex: 1, backgroundColor: C.bg },
  authKeyboardView: { flex: 1 },
  authScrollContent: { flexGrow: 1 },
  authContent: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 24,
    // Match Android's login composition to the iPhone safe-area layout.
    // React Native's built-in SafeAreaView only supplies the larger inset on iOS.
    paddingTop: Platform.OS === "android" ? 87 : 24,
    paddingBottom: Platform.OS === "android" ? 44 : 8,
  },
  authBrand: { alignItems: "center" },
  authBrandTagline: {
    ...TYPE.caption,
    color: C.primary,
    fontWeight: "700",
    letterSpacing: 1.8,
    marginTop: 5,
  },
  authHeadingBlock: { marginTop: 52, marginBottom: 30 },
  authWelcome: { ...TYPE.display, color: C.text, fontWeight: "800", lineHeight: 39 },
  authWelcomeSub: { fontSize: 16, lineHeight: 23, color: C.textSub, marginTop: 8 },
  authForm: { width: "100%" },
  authPasswordLabelRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -4,
  },
  authForgotButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingLeft: 16,
  },
  authForgotText: { ...TYPE.caption, color: C.primary, fontWeight: "700" },
  authErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.42)",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  authErrorText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 19 },
  authPrimaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  authPrimaryButtonDisabled: { opacity: 0.46 },
  authPrimaryButtonText: { color: C.onPrimary, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  authCreateRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 18,
  },
  authCreatePrompt: { ...TYPE.body, color: C.textSub },
  authCreateButton: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 6 },
  authCreateText: { ...TYPE.bodyMedium, color: C.primary, fontWeight: "800" },
  authFooter: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
    paddingTop: 44,
  },
  authFooterLink: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 10 },
  authFooterLinkText: { ...TYPE.caption, color: C.textMuted },
  authFooterSeparator: { color: C.borderStrong, fontSize: 12 },
  authTagline: { ...TYPE.label, color: C.textSub, marginTop: 6, textTransform: "uppercase" },
  authTitle: { ...TYPE.h1, color: C.text, marginBottom: 6 },
  authSub: { ...TYPE.body, color: C.textSub, marginBottom: SPACE.xl },
  fieldLabel: { ...TYPE.label, color: C.text, marginBottom: 6, textTransform: "uppercase" },
  input: {
    ...TYPE.bodyMedium,
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    minHeight: 52, borderWidth: 1.2, borderColor: C.border, color: C.text,
  },
  inputFocused: { borderColor: C.primary, backgroundColor: C.surfaceElevated },
  btn: {
    minHeight: 52,
    borderRadius: RADIUS.sm, paddingVertical: 14, paddingHorizontal: 16,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  btnFill: { backgroundColor: C.primary },
  btnOutline: { borderWidth: 1.2, borderColor: C.borderStrong, backgroundColor: C.surface },
  btnText: { ...TYPE.button, color: C.onPrimary },
  errorText: { color: C.danger, fontSize: 13, marginBottom: 10 },
  iosMembershipPanel: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  iosMembershipText: { ...TYPE.body, color: C.textSub },
  iosMembershipHelp: { minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", marginTop: 4 },
  iosMembershipHelpText: { ...TYPE.bodyMedium, color: C.primary, fontWeight: "700" },
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
    flex: 1, minHeight: MIN_TOUCH_TARGET, paddingVertical: 11, borderRadius: RADIUS.sm,
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
  legalLinkButton: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
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
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },

  // Navigation
  pageHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    paddingTop: 12 + ANDROID_STATUS_BAR_INSET,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pageHeaderLogoOnly: {
    justifyContent: "flex-start",
  },
  pageTitle: { flex: 1, ...TYPE.title, color: C.text, marginLeft: 8 },
  iconBtn: {
    minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, padding: 8, borderRadius: RADIUS.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.isDark ? C.surfaceElevated : C.accentSoft,
  },
  legalScreen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  legalSafeArea: {
    backgroundColor: C.bg,
  },
  legalHeader: {
    minHeight: 70,
    paddingTop: ANDROID_STATUS_BAR_INSET,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderStrong,
  },
  legalBackButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  legalHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  legalHeaderEyebrow: {
    ...TYPE.label,
    color: C.primary,
    fontSize: 10,
    textTransform: "uppercase",
  },
  legalHeaderTitle: {
    ...TYPE.title,
    color: C.text,
    fontWeight: "900",
    marginTop: 2,
  },
  legalHeaderIcon: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  legalContentScroll: {
    flex: 1,
    backgroundColor: C.bg,
  },
  legalContent: {
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  legalIntroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.xl,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  legalIntroText: {
    ...TYPE.body,
    flex: 1,
    color: C.text,
    lineHeight: 21,
  },
  legalSectionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  legalSectionNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primaryLight,
  },
  legalSectionNumberText: {
    ...TYPE.label,
    color: C.primary,
    fontWeight: "900",
  },
  legalSectionBody: {
    flex: 1,
    minWidth: 0,
  },
  legalSectionTitle: {
    ...TYPE.title,
    color: C.text,
    fontWeight: "800",
    marginBottom: 6,
  },
  legalSectionText: {
    ...TYPE.body,
    color: C.textSub,
    lineHeight: 21,
  },
  legalOfflineNote: {
    ...TYPE.caption,
    color: C.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  infoHeroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
  },
  infoHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACE.md,
  },
  infoEyebrow: {
    ...TYPE.label,
    color: C.primary,
    textTransform: "uppercase",
    marginBottom: SPACE.xs,
  },
  infoTitle: {
    ...TYPE.h1,
    color: C.text,
    marginBottom: SPACE.sm,
  },
  infoIntro: {
    ...TYPE.body,
    color: C.textSub,
  },
  infoSectionCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  infoSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    marginBottom: SPACE.sm,
  },
  infoSectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  infoSectionNumber: {
    ...TYPE.caption,
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  infoSectionTitle: {
    ...TYPE.title,
    color: C.text,
  },
  infoSectionBody: {
    ...TYPE.body,
    color: C.textSub,
  },
  infoActionButton: {
    minHeight: MIN_TOUCH_TARGET,
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xs,
    alignSelf: "flex-start",
  },
  infoActionText: {
    ...TYPE.button,
    color: C.onPrimary,
  },
  reportOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  reportSheet: {
    width: "100%",
    maxHeight: "92%",
    backgroundColor: "#101113",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  reportMark: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF2F32",
  },
  reportEyebrow: {
    color: "#FF686B",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  reportTitle: {
    ...TYPE.h2,
    color: C.text,
    marginTop: 1,
  },
  reportClose: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  reportDescription: {
    ...TYPE.body,
    color: C.textSub,
    lineHeight: 22,
    marginBottom: 18,
  },
  reportFieldLabel: {
    ...TYPE.label,
    color: C.text,
    marginBottom: 8,
  },
  reportCategoryList: {
    gap: 8,
    marginBottom: 16,
  },
  reportCategoryButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#15181D",
    borderWidth: 1,
    borderColor: "#303640",
  },
  reportCategoryButtonActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  reportCategoryText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  reportCategoryTextActive: {
    color: C.onPrimary,
  },
  reportTextArea: {
    minHeight: 150,
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: "#15181D",
    borderWidth: 1.4,
    borderColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  reportCounter: {
    color: C.textMuted,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "right",
    marginTop: 6,
  },
  reportError: {
    color: C.danger,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 9,
  },
  reportActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  reportCancelButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#62656B",
    backgroundColor: "#242426",
    paddingHorizontal: 12,
  },
  reportCancelText: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },
  reportSubmitButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EF2F32",
    borderWidth: 1,
    borderColor: "#FF686B",
    paddingHorizontal: 12,
    shadowColor: "#EF2F32",
    shadowOpacity: 0.42,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  reportSubmitButtonDisabled: {
    backgroundColor: "#471E22",
    borderColor: "#6A282D",
    shadowOpacity: 0,
    elevation: 0,
  },
  reportDoneButton: {
    flex: 0,
    width: "100%",
  },
  reportSubmitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  reportSuccess: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 4,
  },
  reportSuccessIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel,
    marginBottom: 12,
  },
  reportSuccessTitle: {
    ...TYPE.h3,
    color: C.text,
    textAlign: "center",
  },
  reportSuccessText: {
    ...TYPE.body,
    color: C.textSub,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  bottomNav: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "ios" ? 10 : 22,
    zIndex: 50,
    elevation: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.isDark ? "rgba(18,18,17,0.96)" : "rgba(255,253,248,0.96)",
    borderWidth: 1,
    borderColor: C.isDark ? "rgba(231,188,104,0.2)" : "rgba(30,24,16,0.12)",
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: C.isDark ? 0.34 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  bottomTab: {
    flex: 1,
    flexBasis: "20%",
    minWidth: 0,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 20,
  },
  bottomTabIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bottomTabIconActive: {
    backgroundColor: C.isDark ? "rgba(231,188,104,0.16)" : "rgba(197,139,42,0.14)",
  },
  bottomNavSearchBar: {
    flex: 1,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    paddingHorizontal: 10,
    backgroundColor: C.isDark ? "rgba(255,255,255,0.055)" : "rgba(20,18,15,0.06)",
  },
  bottomNavSearchIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.isDark ? "rgba(231,188,104,0.16)" : "rgba(197,139,42,0.14)",
  },
  bottomNavSearchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    color: C.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    paddingVertical: 0,
  },
  bottomNavSearchClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavSearchResults: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 74,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: C.isDark ? "rgba(24,24,23,0.98)" : "rgba(255,253,248,0.98)",
    borderWidth: 1,
    borderColor: C.isDark ? "rgba(231,188,104,0.2)" : "rgba(30,24,16,0.12)",
    shadowColor: "#000",
    shadowOpacity: C.isDark ? 0.28 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  bottomNavSearchResult: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  bottomNavSearchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.isDark ? "rgba(231,188,104,0.14)" : C.primaryLight,
  },
  bottomNavSearchResultTitle: {
    color: C.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  bottomNavSearchResultSubtitle: {
    color: C.textSub,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  bottomNavSearchEmpty: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  bottomNavSearchEmptyText: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  bottomTabLabel: {
    ...TYPE.caption,
    width: "100%",
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 14,
    color: C.slateGray,
    includeFontPadding: false,
  },
  swipePagerViewport: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  swipePagerTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    flexDirection: "row",
  },
  swipePagerPage: {
    zIndex: 1,
    backgroundColor: C.bg,
    overflow: "hidden",
  },
  staticRootTabPage: {
    flex: 1,
    backgroundColor: C.bg,
  },
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
    paddingTop: ANDROID_STATUS_BAR_INSET,
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    position: "relative",
  },
  homeFlagButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#140707",
    borderWidth: 1,
    borderColor: "#A30B0B",
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
    minHeight: MIN_TOUCH_TARGET,
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
    ...StyleSheet.absoluteFill,
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
  thumbnailBrandBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 104,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderBottomRightRadius: 10,
    backgroundColor: "#0D0D0B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(231,188,104,0.45)",
  },
  thumbnailBrandText: {
    color: "#F5F1E8",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
  },
  thumbnailBrandBadgeLarge: {
    width: 114,
    minHeight: 42,
    paddingVertical: 10,
  },
  streamingHeroPhotoWash: {
    ...StyleSheet.absoluteFill,
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
    minHeight: MIN_TOUCH_TARGET,
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
    color: C.onPrimary,
  },
  myListHeroBtn: {
    minHeight: MIN_TOUCH_TARGET,
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
    ...StyleSheet.absoluteFill,
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
    color: C.onPrimary,
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
    color: C.onPrimary,
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
    borderBottomColor: C.border,
  },
  homeTopBarInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 12 + ANDROID_STATUS_BAR_INSET,
  },
  avatarBtn: {
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.primary,
    overflow: "hidden",
  },
  avatarBtnText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
  hero: {
    minHeight: 252, marginHorizontal: 16, marginTop: 18,
    borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: C.cardBg,
    borderWidth: 1, borderColor: C.border,
  },
  heroShade: {
    ...StyleSheet.absoluteFill,
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
  heroChipText: { color: C.onPrimary, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
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
    minHeight: MIN_TOUCH_TARGET, paddingVertical: 11, paddingHorizontal: 17, alignSelf: "flex-start",
  },
  heroBtnText: { ...TYPE.button, color: C.onPrimary },
  heroGhostBtn: {
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: 8, alignItems: "center", justifyContent: "center",
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
    backgroundColor: C.isDark ? C.surfaceElevated : C.cardBg,
    borderWidth: 1, borderColor: C.border,
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
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)", borderRadius: MIN_TOUCH_TARGET / 2,
  },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontSize: 10, fontWeight: "700" },

  // CTA
  ctaBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.deepBlue, margin: 16, borderRadius: RADIUS.xl, padding: 20,
  },
  ctaTitle: { ...TYPE.h2, color: C.onPrimary },
  ctaIllustration: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
  },
  mentorBanner: {
    marginHorizontal: 16, marginTop: 22, borderRadius: RADIUS.lg, padding: 18,
    backgroundColor: C.isDark ? C.surfaceElevated : C.cardBg,
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.soft,
  },
  mentorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  mentorTitle: { color: C.text, fontSize: 17, fontWeight: "900" },
  mentorPrompt: {
    color: C.text, fontSize: 15, lineHeight: 22, padding: 14, borderRadius: 10,
    backgroundColor: C.isDark ? C.panelSecondary : C.lightGray,
    borderWidth: 1, borderColor: C.border,
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
  searchInput: { flex: 1, minHeight: MIN_TOUCH_TARGET, ...TYPE.body, color: C.text },
  searchClearButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderRadius: MIN_TOUCH_TARGET / 2 },
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
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.soft,
  },
  clThumb: {
    width: "100%", height: 205, backgroundColor: C.lightGray, overflow: "hidden",
  },
  clWishlistBtn: {
    position: "absolute", bottom: 12, right: 12,
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: MIN_TOUCH_TARGET / 2,
  },
  clLock: {
    position: "absolute", bottom: 12, left: 12,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10, padding: 5,
  },
  clInfo: { padding: 14, paddingTop: 12, backgroundColor: C.cardBg },
  clTitle: { ...TYPE.title, color: C.text, marginBottom: 8 },
  clMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  clMetaText: { flexShrink: 1, fontSize: 13, color: C.textMuted },
  clMetaDot: { fontSize: 13, color: C.textMuted },
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
    borderWidth: 1, borderColor: C.border,
    ...ELEVATION.hairline,
  },
  courseDescriptionCard: {
    backgroundColor: C.cardBg, borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    ...ELEVATION.hairline,
  },
  courseDescriptionTitle: { ...TYPE.title, color: C.text, marginBottom: 7 },
  courseDescriptionText: { ...TYPE.body, color: C.textSub },
  courseDescriptionTextFrame: { position: "relative" },
  courseDescriptionMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  courseDescriptionToggle: {
    minHeight: MIN_TOUCH_TARGET,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    marginBottom: -10,
    paddingRight: 8,
  },
  courseDescriptionToggleText: { ...TYPE.button, color: C.primary },
  courseNotesOverlay: {
    flex: 1,
    backgroundColor: "rgba(43,33,26,0.24)",
    justifyContent: "flex-end",
  },
  courseNotesSheet: {
    height: "78%",
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.surfaceWarm,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  courseNotesScroll: { flex: 1, minHeight: 0 },
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
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  courseResourceTitle: { flex: 1, ...TYPE.bodyMedium, color: C.text },
  videoRowTitle: { flex: 1, ...TYPE.bodyMedium, color: C.text },
  videoDownloadButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
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
    backgroundColor: C.cardBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  dlVideoRowError: { borderColor: "rgba(239,68,68,0.45)" },
  dlVideoRowMain: { flexDirection: "row", alignItems: "center", padding: 10, gap: 4 },
  dlVideoContent: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dlVideoThumb: {
    width: 90, height: 64, borderRadius: 10,
    backgroundColor: C.lightGray, overflow: "hidden",
  },
  dlVideoThumbOverlay: {
    borderRadius: 10, backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center", justifyContent: "center",
  },
  dlDeleteButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  dlErrorFooter: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: "rgba(239,68,68,0.22)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  dlErrorMessage: { flex: 1, color: C.textSub, fontSize: 12, lineHeight: 17 },
  dlRetryButton: {
    minWidth: 82, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 12, borderRadius: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: C.primary,
  },
  dlRetryButtonText: { color: C.onPrimary, fontSize: 13, fontWeight: "800" },
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
  profileAvatarLg: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  profileAvatarLgText: { color: C.onPrimary, fontSize: 32, fontWeight: "900" },
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
    alignSelf: "center", minHeight: 44, paddingHorizontal: 18, borderRadius: 8,
    backgroundColor: "transparent",
  },
  logoutText: { color: C.textSub, fontWeight: "500", fontSize: 13 },
  dangerZone: { marginTop: 20 },
  dangerZoneLabel: {
    ...TYPE.label, color: C.danger, textTransform: "uppercase", marginBottom: 8, paddingHorizontal: 2,
  },
  deleteAccountRow: {
    minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "transparent", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.border,
  },
  deleteAccountRowIcon: {
    width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  deleteAccountRowTitle: { color: C.textSub, fontSize: 12, fontWeight: "500" },
  deleteAccountRowSubtitle: { color: C.textSub, fontSize: 11, lineHeight: 15, marginTop: 2 },
  deleteAccountOverlay: {
    flex: 1, justifyContent: "center", paddingHorizontal: 18,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  deleteAccountDialog: {
    maxHeight: "90%", width: "100%", maxWidth: 430, alignSelf: "center",
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.borderStrong,
    overflow: "hidden",
  },
  deleteAccountContent: { padding: 20, paddingBottom: 22 },
  deleteAccountIcon: {
    width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center",
    alignSelf: "center", backgroundColor: "rgba(239,68,68,0.12)", marginBottom: 12,
  },
  deleteAccountTitle: { ...TYPE.h2, color: C.text, textAlign: "center" },
  deleteAccountSubtitle: {
    ...TYPE.body, color: C.textSub, textAlign: "center", lineHeight: 20, marginTop: 8,
  },
  deleteAccountWarningBox: {
    backgroundColor: "rgba(239,68,68,0.07)", borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.24)", padding: 12, marginTop: 16, gap: 9,
  },
  deleteAccountWarningRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  deleteAccountWarningText: { flex: 1, color: C.textSub, fontSize: 12, lineHeight: 17 },
  deleteAccountPlanNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 9,
    backgroundColor: C.panelSecondary, borderRadius: RADIUS.md,
    padding: 11, marginTop: 12, borderWidth: 1, borderColor: C.border,
  },
  deleteAccountPlanText: { flex: 1, color: C.textSub, fontSize: 12, lineHeight: 17 },
  deleteAccountIdentity: { color: C.textMuted, fontSize: 11, marginTop: 14, marginBottom: 3 },
  deleteAccountFieldLabel: {
    ...TYPE.label, color: C.text, marginTop: 12, marginBottom: 6,
  },
  deleteAccountInput: {
    ...TYPE.bodyMedium, minHeight: 48, color: C.text, backgroundColor: C.background,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.borderStrong,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  deleteAccountError: { color: C.danger, fontSize: 12, lineHeight: 17, marginTop: 10 },
  deleteAccountActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  deleteAccountCancelBtn: {
    flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceWarm,
    paddingHorizontal: 10,
  },
  deleteAccountCancelText: { ...TYPE.button, color: C.text },
  deleteAccountConfirmBtn: {
    flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    borderRadius: RADIUS.md, backgroundColor: C.danger, paddingHorizontal: 10,
  },
  deleteAccountConfirmBtnDisabled: { opacity: 0.38 },
  deleteAccountConfirmText: { ...TYPE.button, color: "#FFFFFF" },

  // Nex AI
  aiScreen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  aiTopSafe: {
    backgroundColor: "#050505",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    paddingTop: Platform.OS === "android" ? Math.max(ANDROID_STATUS_BAR_INSET + 18, 42) : 0,
  },
  aiTopHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  aiTopHeaderSpacer: {
    flex: 1,
  },
  aiProfileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#E7BC68",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  aiIdentityBar: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  aiIdentityMenu: {
    width: 32,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  aiIdentityAvatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  aiIdentityText: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  aiIdentityName: {
    color: "#F5F1E8",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  aiIdentityStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  aiIdentityStatus: {
    color: "#AFA79C",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
  aiIdentityAdd: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  aiHistoryOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  aiHistorySheet: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: "#0B0C0E",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  aiHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  aiHistoryEyebrow: {
    color: "#E7BC68",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  aiHistoryTitle: {
    color: "#F5F1E8",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    marginTop: 2,
  },
  aiHistoryClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14161A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  aiHistoryNewChat: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#E7BC68",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  aiHistoryNewChatText: {
    color: "#17130B",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  aiHistoryLabel: {
    color: "#827A70",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  aiHistoryList: {
    minHeight: 0,
  },
  aiHistoryListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  aiHistoryItem: {
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "#111418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  aiHistoryItemActive: {
    borderColor: "rgba(231,188,104,0.72)",
    backgroundColor: "#17130B",
  },
  aiHistoryItemTitle: {
    color: "#F5F1E8",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  aiHistoryItemMeta: {
    color: "#AFA79C",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    marginTop: 3,
  },
  aiHistoryEmpty: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "#111418",
    paddingHorizontal: 18,
  },
  aiHistoryEmptyText: {
    color: "#AFA79C",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
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
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18,
  },
  aiKeyboardArea: { flex: 1, minHeight: 0 },
  aiKeyboardAreaWithNav: { marginBottom: Platform.OS === "ios" ? 98 : 82 },
  aiMessageList: { flex: 1, minHeight: 0, overflow: "hidden" },
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
  aiTypingBubble: {
    minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8,
  },
  aiTypingText: { ...TYPE.caption, color: C.textSub, fontWeight: "700" },
  aiBubbleText: { ...TYPE.body, color: C.text },
  aiBubbleTextUser: { color: C.onPrimary, fontWeight: "600" },
  aiWelcomeScroll: {
    flex: 1,
    minHeight: 0,
  },
  aiWelcomeContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  aiWelcomeTitle: {
    color: "#FFFFFF",
    fontFamily: FONT.heading,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 22,
  },
  aiWelcomeSubtitle: {
    color: "#AFA79C",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 310,
    marginTop: 10,
    marginBottom: 22,
  },
  aiWelcomePrompts: {
    width: "100%",
    gap: 9,
  },
  aiSuggestions: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  aiSuggestion: {
    minHeight: 44,
    width: "100%",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#111418",
    borderWidth: 1,
    borderColor: "rgba(231,188,104,0.6)",
  },
  aiSuggestionText: { color: "#B9B2A8", fontSize: 13, lineHeight: 17, fontWeight: "800", textAlign: "center" },
  aiComposer: {
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 10,
    borderRadius: 18,
    backgroundColor: "#111418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  aiComposerStandalone: { paddingBottom: Platform.OS === "ios" ? 28 : 10 },
  aiComposerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  aiInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 92,
    color: "#F5F1E8",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 16,
    lineHeight: 21,
  },
  aiSend: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "#E7BC68",
    borderWidth: 1,
    borderColor: "#F2D49A",
    shadowColor: "#E7BC68",
    shadowOpacity: 0.26,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  aiSendDisabled: {
    opacity: 1,
    backgroundColor: "#E7BC68",
    borderColor: "#F2D49A",
    shadowOpacity: 0.2,
  },
  aiDisclaimer: {
    color: "#827A70",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },

  // Video Player
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  player: { width: "100%", flexGrow: 0, flexShrink: 0, position: "relative", overflow: "hidden", backgroundColor: "#000" },
  nativeVideoBalancedFill: { transform: [{ scale: 0.98 }] },
  suspendedVideoSurface: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  suspendedVideoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  reelsBackBtn: {
    position: "absolute", top: 52, left: 14,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8, zIndex: 20,
  },
  reelsTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    paddingTop: 6 + ANDROID_STATUS_BAR_INSET,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  reelsTopBtn: {
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center", justifyContent: "center",
  },
  reelsAiBtn: {
    position: "absolute", right: 10, top: 110,
    flexDirection: "row", alignItems: "center", gap: 4,
    minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: "center",
    paddingHorizontal: 10, borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.isDark ? C.primaryPressed : "rgba(23,23,23,0.86)",
    borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
    zIndex: 20,
  },
  reelsNotesBtn: {
    position: "absolute", right: 10, top: 166,
    flexDirection: "row", alignItems: "center", gap: 5,
    minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: "center",
    paddingHorizontal: 10, borderRadius: MIN_TOUCH_TARGET / 2,
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
  restartOverlay: { ...StyleSheet.absoluteFill, zIndex: 5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  pauseOverlay: { ...StyleSheet.absoluteFill, zIndex: 4, alignItems: "center", justifyContent: "center" },
  playerAiButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  descriptionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" },
  descriptionSheet: {
    backgroundColor: "rgba(14,14,14,0.97)", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    height: "78%", paddingTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  descriptionHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", alignSelf: "center", marginBottom: 12 },
  descriptionHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  descriptionTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 21 },
  descriptionClose: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  descriptionScroll: { flex: 1, minHeight: 0 },
  descriptionContent: { paddingHorizontal: 18, paddingBottom: 28, gap: 14 },
  descriptionBody: { color: "#F5F5F5", fontSize: 16, lineHeight: 25 },
  lessonNotesSheet: {
    backgroundColor: "rgba(14,14,14,0.97)", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    height: "78%", paddingTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
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
    minHeight: MIN_TOUCH_TARGET, paddingVertical: 10,
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
  courseAiClose: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, backgroundColor: C.surfaceWarm, alignItems: "center", justifyContent: "center" },
  courseAiMessages: { flex: 1 },
  courseAiContent: { padding: 16, paddingBottom: 20 },
  courseAiMessage: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  courseAiMessageUser: { justifyContent: "flex-end" },
  courseAiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  courseAiBubble: { flex: 1, backgroundColor: C.cardBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  courseAiBubbleUser: { flex: 0, maxWidth: "82%", backgroundColor: C.primary },
  courseAiBubbleText: { color: C.text, fontSize: 13, lineHeight: 19 },
  courseAiBubbleTextUser: { color: C.onPrimary, fontWeight: "600" },
  courseAiPrompt: { minHeight: MIN_TOUCH_TARGET, alignSelf: "flex-start", justifyContent: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.accentSoft, borderRadius: MIN_TOUCH_TARGET / 2, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  courseAiPromptText: { color: C.primaryDark, fontSize: 13, fontWeight: "700" },
  courseAiComposer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  courseAiInput: { flex: 1, minHeight: MIN_TOUCH_TARGET, maxHeight: 80, borderRadius: MIN_TOUCH_TARGET / 2, backgroundColor: C.cardBg, color: C.text, paddingHorizontal: 14, fontSize: 14, borderWidth: 1, borderColor: C.border },
  courseAiSend: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  lecturePickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "flex-end", paddingHorizontal: 14, paddingBottom: 16 },
  lecturePickerSheet: {
    maxHeight: "58%",
    minHeight: 360,
    backgroundColor: "rgba(22,20,22,0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(231,188,104,0.24)",
    overflow: "hidden",
    paddingTop: 10,
  },
  lecturePickerHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.62)", alignSelf: "center", marginBottom: 8 },
  lecturePickerHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  lecturePickerHeading: { color: "#fff", fontFamily: TYPE.title.fontFamily, fontSize: 25, lineHeight: 31, fontWeight: "900" },
  lecturePickerCourse: { color: "rgba(255,255,255,0.68)", fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  lecturePickerClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  lecturePickerTabs: { flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 14, marginTop: 2, marginBottom: 10 },
  lecturePickerTab: { minHeight: 32, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", paddingHorizontal: 8 },
  lecturePickerTabActive: { borderBottomColor: C.primary },
  lecturePickerTabText: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 16, fontWeight: "900" },
  lecturePickerTabTextActive: { color: "#fff" },
  lecturePickerList: { flex: 1 },
  lecturePickerContent: { paddingHorizontal: 14, paddingBottom: 18, gap: 8 },
  lecturePickerGridRow: { justifyContent: "space-between", marginBottom: 8 },
  lecturePickerTile: {
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 64,
  },
  lecturePickerTileActive: {
    transform: [{ translateY: -1 }],
  },
  lecturePickerThumb: {
    width: "100%",
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  lecturePickerCurrentBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
  },
  lecturePickerNumber: { color: "#fff", fontSize: 11, lineHeight: 15, fontWeight: "900", marginTop: 3, textAlign: "center" },
  lecturePickerNumberActive: { color: C.primary },
  webPlayerTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 24,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    paddingTop: 8 + ANDROID_STATUS_BAR_INSET,
    backgroundColor: "rgba(0,0,0,0.64)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(224,172,69,0.55)",
  },
  webPlayerTopBtn: {
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET,
    alignItems: "center", justifyContent: "center",
  },
  webPlayerLectureLabel: {
    color: C.primary,
    fontSize: 13,
    fontWeight: "900",
    maxWidth: 170,
  },
  webPlayerSideRail: {
    position: "absolute", right: 10, bottom: 178, zIndex: 22,
    alignItems: "center", gap: 10,
  },
  webPlayerRailBtn: {
    minWidth: 56,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  webPlayerRailText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  webPlayerMeta: {
    position: "absolute", left: 16, right: 82, bottom: 112, zIndex: 11,
  },
  webPlayerTitle: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  webPlayerDescription: {
    marginTop: 4,
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  muteButton: {
    position: "absolute", bottom: 18, left: 66,
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)", borderRadius: 6, zIndex: 14,
  },
  playPauseButton: {
    position: "absolute", bottom: 18, left: 14,
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.56)",
    alignItems: "center", justifyContent: "center", zIndex: 16,
  },
  speedButton: {
    position: "absolute", bottom: 18, left: 14,
    minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)", paddingHorizontal: 10, borderRadius: 6, zIndex: 14,
  },
  speedButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  speedPicker: {
    position: "absolute", bottom: 72, left: 14,
    backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 8, overflow: "hidden", zIndex: 20,
  },
  qualityPicker: {
    position: "absolute", bottom: 72, right: 14,
    backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 8, overflow: "hidden", zIndex: 20,
  },
  qualityButton: {
    position: "absolute", bottom: 18, right: 14,
    minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.56)", paddingHorizontal: 10, borderRadius: 6, zIndex: 14,
  },
  speedOption: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  speedOptionActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  speedOptionText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  playerSettingsPanel: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 94,
    maxHeight: "70%",
    zIndex: 24,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "rgba(20,22,27,0.93)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  playerSettingsScroll: { maxHeight: 360 },
  playerSettingsScrollContent: { paddingBottom: 2 },
  playerSettingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.22)",
  },
  playerSettingsTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  playerSettingsClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  playerSettingsSection: {
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.16)",
  },
  playerSettingsLabel: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700", marginBottom: 9 },
  playerSettingsOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  playerSettingsOption: {
    minHeight: 32,
    borderRadius: 7,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  playerSettingsOptionActive: {
    backgroundColor: "rgba(224,172,69,0.24)",
    borderColor: C.primary,
  },
  playerSettingsOptionText: { color: "rgba(255,255,255,0.86)", fontSize: 11, fontWeight: "800" },
  playerSettingsOptionTextActive: { color: "#fff" },
  playerSettingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    padding: 2,
    alignItems: "flex-start",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  playerSwitchActive: { alignItems: "flex-end", backgroundColor: "rgba(224,172,69,0.86)", borderColor: C.primary },
  playerSwitchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },
  playerSwitchThumbActive: { backgroundColor: "#fff" },
  playerSettingsButton: {
    position: "absolute", bottom: 18, right: 66,
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    zIndex: 16,
  },
  playerSettingsButtonActive: {
    borderColor: C.primary,
    borderWidth: 2,
    backgroundColor: "rgba(224,172,69,0.18)",
  },
  playerExpandButton: {
    position: "absolute", bottom: 18, right: 14,
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    zIndex: 16,
  },
  timeDisplay: { position: "absolute", bottom: 82, left: 0, right: 0, alignItems: "center", zIndex: 12 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  timeline: { position: "absolute", bottom: 50, left: 20, right: 20, height: MIN_TOUCH_TARGET, justifyContent: "center", zIndex: 13 },
  timelineTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.78)", borderRadius: 3, overflow: "hidden" },
  timelineFill:  { height: "100%", backgroundColor: "#ff0033", borderRadius: 3 },
  timelineThumb: { position: "absolute", top: "50%", width: 14, height: 14, borderRadius: 7, backgroundColor: "#ff0033", marginTop: -7, marginLeft: -7 },
  playerControls: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center",
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
    width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderRadius: MIN_TOUCH_TARGET / 2,
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
    color: C.onPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1,
  },
  upgradeEarningBadge: {
    position: "absolute", top: 52, left: 16, zIndex: 2,
    backgroundColor: "rgba(197,139,42,0.12)", borderRadius: 6,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(197,139,42,0.28)",
  },
  upgradeEarningBadgeText: {
    color: C.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.4,
  },
  upgradeBannerIcon: {
    position: "absolute", bottom: 16, right: 20, zIndex: 2,
  },
  upgradeTitle: {
    ...TYPE.h2, color: C.text, marginBottom: 2,
  },
  upgradeOfferTitle: {
    fontFamily: FONT.heading, fontSize: 28, lineHeight: 34, fontWeight: "900",
    letterSpacing: -0.4, marginBottom: 6,
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
  upgradeBestValueText: { color: C.onPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
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
  upgradeBtnText: { ...TYPE.button, color: C.onPrimary, fontSize: 17 },
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
