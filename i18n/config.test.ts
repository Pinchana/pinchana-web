import {describe, expect, test} from "bun:test";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeDirection,
  resolveLocale,
} from "./config";
import {resolveLegalLocale} from "./legal";

describe("locale resolution", () => {
  test("prefers a supported cookie over the browser header", () => {
    expect(resolveLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(resolveLocale("uk", "en-GB,en;q=0.9")).toBe("uk");
  });

  test("uses browser language and safely falls back", () => {
    expect(resolveLocale(undefined, "en-GB,en;q=0.8")).toBe("en");
    expect(resolveLocale(undefined, "uk-UA,uk;q=0.9,en;q=0.7")).toBe("uk");
    expect(resolveLocale(undefined, "@@invalid@@")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined, undefined)).toBe(DEFAULT_LOCALE);
  });

  test("rejects unsupported locale cookies", () => {
    expect(isSupportedLocale("uk")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
    expect(resolveLocale("de", "en")).toBe("en");
  });

  test("keeps direction and legal approval explicit", () => {
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("uk")).toBe("ltr");
    expect(resolveLegalLocale("en")).toBe("en");
    expect(resolveLegalLocale("uk")).toBe("uk");
    expect(resolveLegalLocale("de")).toBe("en");
  });
});
