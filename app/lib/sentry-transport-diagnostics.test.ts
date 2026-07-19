import {describe, expect, test} from "bun:test";
import type {makeFetchTransport} from "@sentry/browser";
import {
  createInspectableTransportFactory,
  observeSentryTransportEvent,
  type SentryTransportDiagnostic,
} from "./sentry-transport-diagnostics";

type BrowserTransportFactory = typeof makeFetchTransport;
type Transport = ReturnType<BrowserTransportFactory>;
type Envelope = Parameters<Transport["send"]>[0];

const envelope = (eventId: string) => [{event_id: eventId}, []] as unknown as Envelope;

function collect(eventId: string) {
  const diagnostics: SentryTransportDiagnostic[] = [];
  const cleanup = observeSentryTransportEvent(eventId, (diagnostic) => diagnostics.push(diagnostic));
  return {diagnostics, cleanup};
}

describe("inspectable Sentry transport", () => {
  test("reports an HTTP response against the safe endpoint path", async () => {
    const base = (() => ({
      send: async () => ({statusCode: 202}),
      flush: async () => true,
    })) as BrowserTransportFactory;
    const transport = createInspectableTransportFactory(base)({
      url: "https://pinchana.cc/monitoring?o=secret&p=secret",
      recordDroppedEvent: () => {},
    });
    const observed = collect("accepted");

    await transport.send(envelope("accepted"));

    expect(observed.diagnostics).toEqual([
      {status: "http_response", statusCode: 202, endpoint: "/monitoring"},
    ]);
    observed.cleanup();
  });

  test("reports the browser network error and preserves the rejection", async () => {
    const base = (() => ({
      send: async () => {
        throw new TypeError("Failed https://secret.example/1 via /monitoring?o=secret&p=secret");
      },
      flush: async () => true,
    })) as BrowserTransportFactory;
    const transport = createInspectableTransportFactory(base)({
      url: "/monitoring",
      recordDroppedEvent: () => {},
    });
    const observed = collect("network");

    await expect(transport.send(envelope("network"))).rejects.toThrow("Failed https://secret.example/1");
    expect(observed.diagnostics).toEqual([{
      status: "network_error",
      errorName: "TypeError",
      message: "Failed [redacted-url] via [redacted-url]",
      endpoint: "/monitoring",
    }]);
    observed.cleanup();
  });

  test("distinguishes SDK rate limits and queue overflow from an empty response", async () => {
    for (const [reason, expectedStatus] of [
      ["ratelimit_backoff", "rate_limited"],
      ["queue_overflow", "queue_overflow"],
    ] as const) {
      const base = ((options) => ({
        send: async () => {
          options.recordDroppedEvent(reason, "error");
          return {};
        },
        flush: async () => true,
      })) as BrowserTransportFactory;
      const transport = createInspectableTransportFactory(base)({
        url: "/monitoring",
        recordDroppedEvent: () => {},
      });
      const observed = collect(reason);

      await transport.send(envelope(reason));

      expect(observed.diagnostics).toEqual([{status: expectedStatus, endpoint: "/monitoring"}]);
      observed.cleanup();
    }
  });
});
