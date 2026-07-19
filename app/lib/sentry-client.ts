"use client";

import * as Sentry from "@sentry/nextjs";
import {isAnonymousAnalyticsEnabled} from "./privacy-preferences";
import {sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./sentry-sanitization";

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

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

const initializeSentryClient = createSentryClientInitializer(
  Sentry,
  dsn,
  {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    sendDefaultPii: false,
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
