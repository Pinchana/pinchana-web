"use client";

import * as Sentry from "@sentry/nextjs";

type DiagnosticTag = string | number | boolean | undefined;

export function reportClientError(
  reason: unknown,
  operation: string,
  tags: Record<string, DiagnosticTag> = {},
): void {
  const error = new Error(`Pinchana ${operation.replaceAll("_", " ")} failed`);
  error.name = reason instanceof Error ? reason.name : "OperationalError";
  if (reason instanceof Error && reason.stack) {
    const [, ...frames] = reason.stack.split("\n");
    error.stack = [`${error.name}: ${error.message}`, ...frames].join("\n");
  }

  Sentry.captureException(error, {
    tags: {
      pinchana_operation: operation,
      ...Object.fromEntries(Object.entries(tags).filter(([, value]) => value !== undefined)),
    },
  });
}
