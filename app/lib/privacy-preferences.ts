export const PRIVACY_PREFERENCES_VERSION = 1 as const;
export const PRIVACY_PREFERENCES_STORAGE_KEY = "pinchana-privacy-preferences";
export const LEGACY_COOKIE_CONSENT_STORAGE_KEY = "pinchana_cookie_consent";
export const PRIVACY_PREFERENCES_EVENT = "pinchana:privacy-preferences";

export type PrivacyPreferences = {
  version: typeof PRIVACY_PREFERENCES_VERSION;
  anonymousAnalytics: boolean;
  acknowledgedAt: string;
};

type PrivacyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function parsePrivacyPreferences(value: string | null): PrivacyPreferences | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PrivacyPreferences>;
    if (
      parsed.version !== PRIVACY_PREFERENCES_VERSION
      || typeof parsed.anonymousAnalytics !== "boolean"
      || typeof parsed.acknowledgedAt !== "string"
      || !parsed.acknowledgedAt
      || Number.isNaN(Date.parse(parsed.acknowledgedAt))
    ) return null;
    return parsed as PrivacyPreferences;
  } catch {
    return null;
  }
}

function browserStorage(): PrivacyStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPrivacyPreferences(storage: PrivacyStorage | null = browserStorage()): PrivacyPreferences | null {
  if (!storage) return null;
  try {
    return parsePrivacyPreferences(storage.getItem(PRIVACY_PREFERENCES_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function isAnonymousAnalyticsEnabled(storage: PrivacyStorage | null = browserStorage()): boolean {
  return readPrivacyPreferences(storage)?.anonymousAnalytics ?? false;
}

export function writePrivacyPreferences(
  anonymousAnalytics: boolean,
  storage: PrivacyStorage | null = browserStorage(),
  now: Date = new Date(),
): PrivacyPreferences {
  const preferences: PrivacyPreferences = {
    version: PRIVACY_PREFERENCES_VERSION,
    anonymousAnalytics,
    acknowledgedAt: now.toISOString(),
  };

  if (storage) {
    try {
      storage.setItem(PRIVACY_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      storage.removeItem(LEGACY_COOKIE_CONSENT_STORAGE_KEY);
    } catch {
      // Storage may be unavailable in hardened browsers. The in-memory choice still applies.
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRIVACY_PREFERENCES_EVENT, {detail: preferences}));
  }
  return preferences;
}
