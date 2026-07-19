import type * as Sentry from "@sentry/nextjs";

type SentryClient = NonNullable<ReturnType<typeof Sentry.getClient>>;
type TransportResponse = {
  statusCode?: number;
  headers?: Record<string, string | null>;
};

export type SentryVerificationResult =
  | {status: "accepted"; eventId: string; statusCode: number}
  | {status: "rejected"; eventId: string; statusCode: number}
  | {status: "not_sent"; eventId: string; rateLimits?: string; retryAfter?: string}
  | {status: "dropped"; eventId: string}
  | {status: "timeout"; eventId: string}
  | {status: "capture_failed"; eventId: string; error: unknown};

function classifyResponse(eventId: string, response: TransportResponse): SentryVerificationResult {
  const statusCode = response.statusCode;
  if (typeof statusCode === "number") {
    return statusCode >= 200 && statusCode < 300
      ? {status: "accepted", eventId, statusCode}
      : {status: "rejected", eventId, statusCode};
  }

  const rateLimits = response.headers?.["x-sentry-rate-limits"] ?? undefined;
  const retryAfter = response.headers?.["retry-after"] ?? undefined;
  return {status: "not_sent", eventId, rateLimits, retryAfter};
}

export function verifySentryDelivery(
  client: SentryClient,
  eventId: string,
  capture: () => void,
  timeoutMs = 5_000,
): Promise<SentryVerificationResult> {
  return new Promise((resolve) => {
    let eventProcessed = false;
    let envelopeCreated = false;
    let settled = false;
    const cleanups: Array<() => void> = [];

    const finish = (result: SentryVerificationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanups.forEach((cleanup) => cleanup());
      resolve(result);
    };

    cleanups.push(client.on("beforeSendEvent", (event) => {
      if (event.event_id === eventId) eventProcessed = true;
    }));
    cleanups.push(client.on("beforeEnvelope", (envelope) => {
      if (envelope[0].event_id === eventId) envelopeCreated = true;
    }));
    cleanups.push(client.on(
      "afterSendEvent",
      (event, response) => {
        if (event.event_id === eventId) finish(classifyResponse(eventId, response));
      },
    ));

    const timeout = setTimeout(() => {
      finish(eventProcessed || envelopeCreated
        ? {status: "timeout", eventId}
        : {status: "dropped", eventId});
    }, timeoutMs);

    try {
      capture();
    } catch (error) {
      finish({status: "capture_failed", eventId, error});
    }
  });
}
