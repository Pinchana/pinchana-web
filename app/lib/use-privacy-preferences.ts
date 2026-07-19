"use client";

import {useCallback, useEffect, useState} from "react";
import {
  PRIVACY_PREFERENCES_EVENT,
  PRIVACY_PREFERENCES_STORAGE_KEY,
  PrivacyPreferences,
  readPrivacyPreferences,
  writePrivacyPreferences,
} from "./privacy-preferences";

export function usePrivacyPreferences() {
  const [preferences, setPreferences] = useState<PrivacyPreferences | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPreferences(readPrivacyPreferences());
      setReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === PRIVACY_PREFERENCES_STORAGE_KEY || event.key === null) refresh();
    };
    const onLocalChange = (event: Event) => {
      const next = (event as CustomEvent<PrivacyPreferences>).detail;
      setPreferences(next ?? readPrivacyPreferences());
      setReady(true);
    };

    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PRIVACY_PREFERENCES_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PRIVACY_PREFERENCES_EVENT, onLocalChange);
    };
  }, []);

  const saveAnonymousAnalytics = useCallback((enabled: boolean) => {
    setPreferences(writePrivacyPreferences(enabled));
    setReady(true);
  }, []);

  return {
    ready,
    acknowledged: preferences !== null,
    anonymousAnalytics: preferences?.anonymousAnalytics ?? false,
    saveAnonymousAnalytics,
  };
}
