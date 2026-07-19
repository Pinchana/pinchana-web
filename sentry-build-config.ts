export type SentryBuildConfig = {
  enabled: boolean;
  dsn: string | undefined;
  tunnelRoute: true | undefined;
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
    // Let the SDK generate a fresh, opaque route for every build. Predictable
    // names such as `/monitoring` are commonly blocked before fetch reaches
    // the network, even though they point to the application's own origin.
    tunnelRoute: enabled ? true : undefined,
  };
}
