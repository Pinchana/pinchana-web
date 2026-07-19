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
  const configuredDsn = environment.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

  if (enabled && !configuredDsn) {
    throw new Error("SENTRY_MONITORING_ENABLED=true requires NEXT_PUBLIC_SENTRY_DSN at build time.");
  }

  return {
    enabled,
    dsn: enabled ? configuredDsn : undefined,
    tunnelRoute: enabled ? "/monitoring" : undefined,
  };
}
