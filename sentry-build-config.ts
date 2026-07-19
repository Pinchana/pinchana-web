export type SentryBuildConfig = {
  enabled: boolean;
  dsn: string | undefined;
  tunnelRoute: "/monitoring" | undefined;
};

type SentryEnvironment = NodeJS.ProcessEnv;

export function resolveSentryBuildConfig(environment: SentryEnvironment): SentryBuildConfig {
  const configuredMode = environment.SENTRY_MONITORING_ENABLED?.trim().toLowerCase();
  if (configuredMode && configuredMode !== "true" && configuredMode !== "false") {
    throw new Error("SENTRY_MONITORING_ENABLED must be either 'true' or 'false'.");
  }

  const enabled = configuredMode === "true";
  const dsn = environment.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

  if (enabled && !dsn) {
    throw new Error("SENTRY_MONITORING_ENABLED=true requires NEXT_PUBLIC_SENTRY_DSN at build time.");
  }

  if (!enabled && dsn) {
    throw new Error(
      "NEXT_PUBLIC_SENTRY_DSN is set while Sentry monitoring is disabled. " +
      "Set SENTRY_MONITORING_ENABLED=true or remove the DSN.",
    );
  }

  return {
    enabled,
    dsn,
    tunnelRoute: enabled ? "/monitoring" : undefined,
  };
}
