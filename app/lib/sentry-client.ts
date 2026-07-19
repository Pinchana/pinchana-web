"use client";

import * as Sentry from "@sentry/nextjs";
import {isAnonymousAnalyticsEnabled} from "./privacy-preferences";
import {sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./sentry-sanitization";
import {makeInspectableFetchTransport} from "./sentry-transport-diagnostics";

export type SentryClientReadiness<TClient> =
  | {status: "ready"; client: TClient}
  | {status: "unconfigured"}
  | {status: "disabled"}
  | {status: "initialization_failed"; error: unknown};

type SentryRuntime<TClient, TOptions> = {
  getClient: () => TClient | undefined;
  isEnabled: () => boolean;
  init: (options: TOptions) => unknown;
};

export function createSentryClientInitializer<TClient, TOptions>(
  runtime: SentryRuntime<TClient, TOptions>,
  dsn: string | undefined,
  options: TOptions,
): () => SentryClientReadiness<TClient> {
  let initializationAttempted = false;

  return () => {
    const existingClient = runtime.getClient();
    if (existingClient) {
      return runtime.isEnabled()
        ? {status: "ready", client: existingClient}
        : {status: "disabled"};
    }

    if (!dsn) return {status: "unconfigured"};
    if (initializationAttempted) return {status: "disabled"};

    initializationAttempted = true;
    try {
      runtime.init(options);
    } catch (error) {
      return {status: "initialization_failed", error};
    }

    const initializedClient = runtime.getClient();
    if (!initializedClient || !runtime.isEnabled()) return {status: "disabled"};
    return {status: "ready", client: initializedClient};
  };
}

const monitoringEnabled = process.env.NEXT_PUBLIC_SENTRY_MONITORING_ENABLED === "true";
const dsn = monitoringEnabled ? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() : undefined;

export const sentryClientBuildInfo = Object.freeze({
  monitoringEnabled,
  tunnelRoute: process.env.NEXT_PUBLIC_SENTRY_TUNNEL_ROUTE || undefined,
  release: process.env.NEXT_PUBLIC_PINCHANA_WEB_COMMIT || "development",
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
});

const initializeSentryClient = createSentryClientInitializer(
  Sentry,
  dsn,
  {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: sentryClientBuildInfo.release,
    sendDefaultPii: false,
    transport: makeInspectableFetchTransport,
    tracesSampler: () => isAnonymousAnalyticsEnabled()
      ? (process.env.NODE_ENV === "development" ? 1 : 0.1)
      : 0,
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
  },
);

export function ensureSentryClient() {
  return initializeSentryClient();
}
