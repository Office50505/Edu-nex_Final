import { Platform, UIManager, requireNativeComponent } from "react-native";

// Older iOS and Android keep the existing, tested custom navigation.
export const hasNativeLiquidTabs = Platform.OS === "ios"
  && Number.parseInt(Platform.Version, 10) >= 26
  && Boolean(UIManager.getViewManagerConfig("SkillomateNativeTabBar"));

export const NativeBottomNav = hasNativeLiquidTabs
  ? requireNativeComponent("SkillomateNativeTabBar")
  : null;
