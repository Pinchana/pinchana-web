import * as Sentry from "@sentry/nextjs";
import {sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./app/lib/sentry-sanitization";

const monitoringEnabled = process.env.NEXT_PUBLIC_SENTRY_MONITORING_ENABLED === "true";
const dsn = monitoringEnabled ? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() : undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
  });
}
