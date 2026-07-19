import * as Sentry from "@sentry/nextjs";
import {sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./app/lib/sentry-sanitization";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: (event) => sanitizeSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
});
