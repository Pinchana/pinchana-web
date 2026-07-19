import * as Sentry from "@sentry/nextjs";
import {isAnonymousAnalyticsEnabled} from "./app/lib/privacy-preferences";
import {sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./app/lib/sentry-sanitization";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampler: () => isAnonymousAnalyticsEnabled()
    ? (process.env.NODE_ENV === "development" ? 1 : 0.1)
    : 0,
  beforeSend: (event) => sanitizeSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
