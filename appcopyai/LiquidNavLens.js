import React, { useMemo } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function LiquidTabCapsule({ position, itemWidth, navMagnify, stretch, dark, hidden, compact }) {
  const radius = compact ? 17 : 22;
  const motion = useMemo(() => ({
    translateX: Animated.multiply(position, itemWidth),
    scaleX: Animated.multiply(
      navMagnify.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28], extrapolate: "clamp" }),
      stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055], extrapolate: "clamp" }),
    ),
    scaleY: navMagnify.interpolate({ inputRange: [0, 1], outputRange: [1, 1.34], extrapolate: "clamp" }),
    surface: navMagnify.interpolate({
      inputRange: [0, 1],
      outputRange: dark ? ["#17130C", "#3A2D16"] : ["#F1E3C4", "#FFF7E8"],
      extrapolate: "clamp",
    }),
  }), [position, itemWidth, navMagnify, stretch, dark]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.lens, {
        top: 1,
        height: compact ? 34 : 44,
        borderRadius: radius,
        left: 2,
        width: Math.max(0, itemWidth - 4),
        opacity: hidden || itemWidth <= 0 ? 0 : 1,
        transform: [{ translateX: motion.translateX }, { scaleX: motion.scaleX }, { scaleY: motion.scaleY }],
        backgroundColor: motion.surface,
      }]}
    >
      <View style={[styles.clip, { borderRadius: radius }]}>
        <Animated.View style={[styles.bevel, { opacity: navMagnify }]}>
          {/* All edge lighting stays inside this single rounded mask. */}
          <View style={[styles.edge, { borderRadius: radius, borderColor: dark ? "rgba(231,188,104,0.58)" : "rgba(175,116,26,0.40)" }]} />
          <View style={[styles.innerEdge, { borderRadius: radius - 1, borderColor: dark ? "rgba(0,0,0,0.55)" : "rgba(30,32,38,0.16)" }]} />
          <View style={[styles.curvedReflection, { backgroundColor: dark ? "rgba(255,220,145,0.10)" : "rgba(255,255,255,0.48)" }]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export function LensTabVisual({ tab, index, position, expansion, previewSlot, activeColor, inactiveColor, compact }) {
  const animated = useMemo(() => {
    const proximity = position.interpolate({
      inputRange: [index - 1, index - 0.2, index + 0.2, index + 1],
      outputRange: [0, 1, 1, 0], extrapolate: "clamp",
    });
    return {
      scale: Animated.add(1, Animated.multiply(Animated.multiply(proximity, expansion), 0.16)),
    };
  }, [index, position, expansion]);
  // Commit tint once per crossed tab. Fabric text color updates are unreliable
  // through the native animated driver; motion and magnification stay native.
  const color = previewSlot === index ? activeColor : inactiveColor;
  return (
    <Animated.View pointerEvents="none" style={[styles.item, { transform: [{ scale: animated.scale }] }]}>
      <Ionicons name={`${tab.icon}-outline`} size={compact ? 18 : 21} color={color} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.18}
        style={[styles.label, { color, fontSize: compact ? 8.5 : 10.5 }]}
      >{tab.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lens: {
    position: "absolute", zIndex: 1,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.14,
  },
  clip: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  bevel: { ...StyleSheet.absoluteFillObject },
  edge: { ...StyleSheet.absoluteFillObject, borderWidth: StyleSheet.hairlineWidth },
  innerEdge: { position: "absolute", left: 1, right: 1, top: 1, bottom: 1, borderWidth: StyleSheet.hairlineWidth },
  curvedReflection: { position: "absolute", left: 4, right: 4, top: 2, height: "45%", borderRadius: 10 },
  item: { alignItems: "center", justifyContent: "center", gap: 3, width: "100%" },
  label: { lineHeight: 12, textAlign: "center", includeFontPadding: false },
});
