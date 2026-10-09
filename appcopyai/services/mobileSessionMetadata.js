import Constants from "expo-constants";
import { Platform } from "react-native";

function compact(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export function mobileSessionMetadata() {
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const appConfig = Constants.expoConfig || {};
  const platformConfig = appConfig[platform] || {};
  const deviceModel = Platform.constants?.Model || Platform.constants?.model || "";

  return {
    platform,
    deviceName: compact(Constants.deviceName || deviceModel || `${platform} device`),
    deviceModel: compact(deviceModel),
    osVersion: compact(Platform.Version, 80),
    appVersion: compact(Constants.nativeAppVersion || appConfig.version, 80),
    appBuild: compact(Constants.nativeBuildVersion || platformConfig.buildNumber || platformConfig.versionCode, 80),
  };
}
