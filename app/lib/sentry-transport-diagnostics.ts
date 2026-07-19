"use client";

import {makeFetchTransport} from "@sentry/browser";

type BrowserTransportFactory = typeof makeFetchTransport;
type BrowserTransportOptions = Parameters<BrowserTransportFactory>[0];
type BrowserTransport = ReturnType<BrowserTransportFactory>;
type Envelope = Parameters<BrowserTransport["send"]>[0];

export type SentryTransportDiagnostic =
  | {status: "http_response"; statusCode: number; endpoint: string}
  | {status: "network_error"; errorName: string; message: string; endpoint: string}
  | {status: "rate_limited"; endpoint: string}
  | {status: "queue_overflow"; endpoint: string}
  | {status: "send_error"; endpoint: string}
  | {status: "empty_response"; endpoint: string};

type DiagnosticListener = (diagnostic: SentryTransportDiagnostic) => void;
type DropDiagnostic = Extract<
  SentryTransportDiagnostic,
  {status: "rate_limited" | "queue_overflow" | "send_error"}
>;

const listeners = new Map<string, Set<DiagnosticListener>>();

export function observeSentryTransportEvent(eventId: string, listener: DiagnosticListener): () => void {
  const eventListeners = listeners.get(eventId) ?? new Set<DiagnosticListener>();
  eventListeners.add(listener);
  listeners.set(eventId, eventListeners);

  return () => {
    eventListeners.delete(listener);
    if (eventListeners.size === 0) listeners.delete(eventId);
  };
}

function publish(eventId: string, diagnostic: SentryTransportDiagnostic): void {
  listeners.get(eventId)?.forEach((listener) => listener(diagnostic));
}

function envelopeEventId(envelope: Envelope): string | undefined {
  const header = envelope[0] as {event_id?: unknown};
  return typeof header.event_id === "string" ? header.event_id : undefined;
}

function safeEndpoint(url: string): string {
  try {
    const base = typeof location === "undefined" ? "http://localhost" : location.origin;
    return new URL(url, base).pathname;
  } catch {
    return "unknown";
  }
}

function safeError(error: unknown): {errorName: string; message: string} {
  const errorName = error instanceof Error ? error.name : "Error";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage
    .replaceAll(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replaceAll(/\/[^\s)]*\?[^\s)]+/g, "[redacted-url]")
    .replaceAll(/(sentry_key|dsn)=[^&\s]+/gi, "$1=[redacted]")
    .slice(0, 180);
  return {errorName, message: message || "The browser request failed."};
}

function dropDiagnostic(reason: string, endpoint: string): DropDiagnostic | undefined {
  if (reason === "ratelimit_backoff") return {status: "rate_limited", endpoint};
  if (reason === "queue_overflow" || reason === "buffer_overflow") {
    return {status: "queue_overflow", endpoint};
  }
  if (reason === "send_error") return {status: "send_error", endpoint};
  return undefined;
}

export function createInspectableTransportFactory(
  baseFactory: BrowserTransportFactory = makeFetchTransport,
): BrowserTransportFactory {
  return (options: BrowserTransportOptions, nativeFetch?: Parameters<BrowserTransportFactory>[1]) => {
    const endpoint = safeEndpoint(options.url);
    const pending = new Map<string, {drop?: DropDiagnostic}>();
    const originalRecordDroppedEvent = options.recordDroppedEvent;
    const transport = baseFactory({
      ...options,
      recordDroppedEvent: (reason, category, count) => {
        originalRecordDroppedEvent(reason, category, count);
        const diagnostic = dropDiagnostic(reason, endpoint);
        if (diagnostic) pending.forEach((context) => { context.drop ??= diagnostic; });
      },
    }, nativeFetch);

    return {
      ...transport,
      send(envelope: Envelope) {
        const eventId = envelopeEventId(envelope);
        const context: {drop?: DropDiagnostic} = {};
        if (eventId) pending.set(eventId, context);

        let request: PromiseLike<Awaited<ReturnType<BrowserTransport["send"]>>>;
        try {
          request = transport.send(envelope);
        } catch (error) {
          if (eventId) {
            const details = safeError(error);
            publish(eventId, {status: "network_error", endpoint, ...details});
            pending.delete(eventId);
          }
          throw error;
        }

        return Promise.resolve(request).then(
          (response) => {
            if (eventId) {
              if (typeof response.statusCode === "number") {
                publish(eventId, {status: "http_response", statusCode: response.statusCode, endpoint});
              } else if (context.drop) {
                publish(eventId, context.drop);
              } else {
                publish(eventId, {status: "empty_response", endpoint});
              }
            }
            return response;
          },
          (error) => {
            if (eventId) {
              const details = safeError(error);
              publish(eventId, {status: "network_error", endpoint, ...details});
            }
            throw error;
          },
        ).finally(() => {
          if (eventId) pending.delete(eventId);
        });
      },
    };
  };
}

export const makeInspectableFetchTransport = createInspectableTransportFactory();
