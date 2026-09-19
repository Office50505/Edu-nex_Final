import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export function usePresenceHeartbeat(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;

    const ping = () => {
      if (stopped) return;
      const token = window.EduNex?.getAccessToken?.();
      if (!token || !window.EduNex?.authRequest) return;
      window.EduNex.authRequest("/api/sessions/ping", {
        method: "PATCH",
        body: JSON.stringify({ platform: "web" }),
      }).catch(() => {});
    };

    ping();
    const interval = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", ping);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", ping);
    };
  }, [enabled]);
}
