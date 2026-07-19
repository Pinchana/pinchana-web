import type * as Sentry from "@sentry/nextjs";
import {
  observeSentryTransportEvent,
  type SentryTransportDiagnostic,
} from "./sentry-transport-diagnostics";

type SentryClient = NonNullable<ReturnType<typeof Sentry.getClient>>;
type TransportResponse = {
  statusCode?: number;
  headers?: Record<string, string | null>;
};

const TUNNEL_ENDPOINT = "first-party Sentry tunnel";

export type SentryVerificationResult =
  | {status: "accepted"; eventId: string; statusCode: number}
  | {status: "rejected"; eventId: string; statusCode: number}
  | {status: "network_error"; eventId: string; endpoint: string; errorName: string; message: string}
  | {status: "rate_limited"; eventId: string; endpoint: string; rateLimits?: string; retryAfter?: string}
  | {status: "queue_overflow"; eventId: string; endpoint: string}
  | {status: "send_error"; eventId: string; endpoint: string}
  | {status: "unknown_no_response"; eventId: string; endpoint?: string}
  | {status: "dropped"; eventId: string}
  | {status: "timeout"; eventId: string}
  | {status: "capture_failed"; eventId: string; error: unknown};

function classifyResponse(eventId: string, response: TransportResponse): SentryVerificationResult {
  const statusCode = response.statusCode;
  if (typeof statusCode === "number") {
    if (statusCode === 429) {
      return {status: "rate_limited", eventId, endpoint: TUNNEL_ENDPOINT};
    }
    return statusCode >= 200 && statusCode < 300
      ? {status: "accepted", eventId, statusCode}
      : {status: "rejected", eventId, statusCode};
  }

  const rateLimits = response.headers?.["x-sentry-rate-limits"] ?? undefined;
  const retryAfter = response.headers?.["retry-after"] ?? undefined;
  if (rateLimits || retryAfter) {
    return {status: "rate_limited", eventId, endpoint: TUNNEL_ENDPOINT, rateLimits, retryAfter};
  }
  return {status: "unknown_no_response", eventId};
}

function classifyDiagnostic(
  eventId: string,
  diagnostic: SentryTransportDiagnostic,
): SentryVerificationResult {
  switch (diagnostic.status) {
    case "http_response":
      return classifyResponse(eventId, {statusCode: diagnostic.statusCode});
    case "network_error":
      return {
        status: "network_error",
        eventId,
        endpoint: diagnostic.endpoint,
        errorName: diagnostic.errorName,
        message: diagnostic.message,
      };
    case "rate_limited":
      return {status: "rate_limited", eventId, endpoint: diagnostic.endpoint};
    case "queue_overflow":
      return {status: "queue_overflow", eventId, endpoint: diagnostic.endpoint};
    case "send_error":
      return {status: "send_error", eventId, endpoint: diagnostic.endpoint};
    case "empty_response":
      return {status: "unknown_no_response", eventId, endpoint: diagnostic.endpoint};
  }
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
    cleanups.push(observeSentryTransportEvent(eventId, (diagnostic) => {
      finish(classifyDiagnostic(eventId, diagnostic));
    }));

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
