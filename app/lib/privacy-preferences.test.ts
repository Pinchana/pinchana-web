import {describe, expect, test} from "bun:test";
import {
  LEGACY_COOKIE_CONSENT_STORAGE_KEY,
  PRIVACY_PREFERENCES_STORAGE_KEY,
  isAnonymousAnalyticsEnabled,
  parsePrivacyPreferences,
  readPrivacyPreferences,
  writePrivacyPreferences,
} from "./privacy-preferences";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

describe("privacy preferences", () => {
  test("defaults anonymous analytics to off and rejects stale records", () => {
    expect(parsePrivacyPreferences(null)).toBeNull();
    expect(parsePrivacyPreferences('{"version":0,"anonymousAnalytics":true,"acknowledgedAt":"2026-01-01T00:00:00.000Z"}')).toBeNull();
    expect(isAnonymousAnalyticsEnabled(memoryStorage())).toBe(false);
  });

  test("writes a versioned choice and removes the legacy acknowledgement", () => {
    const storage = memoryStorage({[LEGACY_COOKIE_CONSENT_STORAGE_KEY]: "true"});
    const preferences = writePrivacyPreferences(true, storage, new Date("2026-07-19T10:00:00.000Z"));

    expect(preferences).toEqual({
      version: 1,
      anonymousAnalytics: true,
      acknowledgedAt: "2026-07-19T10:00:00.000Z",
    });
    expect(storage.values.has(LEGACY_COOKIE_CONSENT_STORAGE_KEY)).toBe(false);
    expect(readPrivacyPreferences(storage)).toEqual(preferences);
    expect(storage.values.has(PRIVACY_PREFERENCES_STORAGE_KEY)).toBe(true);
  });

  test("does not treat the old consent flag as a current privacy choice", () => {
    const storage = memoryStorage({[LEGACY_COOKIE_CONSENT_STORAGE_KEY]: "true"});
    expect(readPrivacyPreferences(storage)).toBeNull();
  });
});
