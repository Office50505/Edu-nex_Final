import { useEffect, useState } from "react";

export function useEduNexRuntimeReady() {
  const [ready, setReady] = useState(() => Boolean(window.EduNex?.request));

  useEffect(() => {
    if (window.EduNex?.request) {
      setReady(true);
      return undefined;
    }

    const handleReady = () => setReady(Boolean(window.EduNex?.request));
    window.addEventListener("edunex:page-ready", handleReady);
    return () => window.removeEventListener("edunex:page-ready", handleReady);
  }, []);

  return ready;
}
