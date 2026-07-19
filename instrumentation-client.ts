import * as Sentry from "@sentry/nextjs";
import {ensureSentryClient} from "./app/lib/sentry-client";

ensureSentryClient();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
