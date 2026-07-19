import {describe, expect, test} from "bun:test";
import {resolveSentryBuildConfig} from "./sentry-build-config";

describe("Sentry build configuration", () => {
  test("is disabled by default", () => {
    expect(resolveSentryBuildConfig({})).toEqual({
      enabled: false,
      dsn: undefined,
      tunnelRoute: undefined,
    });
  });

  test("enables an automatically randomized same-origin tunnel when a DSN is present", () => {
    expect(resolveSentryBuildConfig({
      SENTRY_MONITORING_ENABLED: "true",
      NEXT_PUBLIC_SENTRY_DSN: " https://public@example.com/1 ",
    })).toEqual({
      enabled: true,
      dsn: "https://public@example.com/1",
      tunnelRoute: true,
    });
  });

  test("rejects enabled builds without a DSN", () => {
    expect(() => resolveSentryBuildConfig({SENTRY_MONITORING_ENABLED: "true"}))
      .toThrow("requires NEXT_PUBLIC_SENTRY_DSN");
  });

  test("ignores a DSN in an explicitly disabled build", () => {
    expect(resolveSentryBuildConfig({
      SENTRY_MONITORING_ENABLED: "false",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.com/1",
    })).toEqual({
      enabled: false,
      dsn: undefined,
      tunnelRoute: undefined,
    });
  });

  test("rejects ambiguous boolean values", () => {
    expect(() => resolveSentryBuildConfig({SENTRY_MONITORING_ENABLED: "yes"}))
      .toThrow("must be either 'true' or 'false'");
  });
});
