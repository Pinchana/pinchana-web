import {describe, expect, test} from "bun:test";
import type * as Sentry from "@sentry/nextjs";
import {verifySentryDelivery} from "./sentry-verification";

type Hook = "beforeSendEvent" | "beforeEnvelope" | "afterSendEvent";
type SentryClient = NonNullable<ReturnType<typeof Sentry.getClient>>;

function fakeClient() {
  const hooks = new Map<Hook, Set<(...args: never[]) => void>>();
  let cleanupCount = 0;

  const client = {
    on(hook: Hook, callback: (...args: never[]) => void) {
      const callbacks = hooks.get(hook) ?? new Set();
      callbacks.add(callback);
      hooks.set(hook, callbacks);
      return () => {
        callbacks.delete(callback);
        cleanupCount += 1;
      };
    },
  } as unknown as SentryClient;

  return {
    client,
    emit(hook: Hook, ...args: unknown[]) {
      hooks.get(hook)?.forEach((callback) => callback(...args as never[]));
    },
    cleanupCount: () => cleanupCount,
  };
}

const event = (eventId: string) => ({event_id: eventId});
const envelope = (eventId: string) => [{event_id: eventId}, []];

describe("Sentry delivery verification", () => {
  test("only accepts a 2xx transport response and removes all hooks", async () => {
    const fake = fakeClient();
    const result = await verifySentryDelivery(fake.client, "accepted", () => {
      fake.emit("beforeSendEvent", event("accepted"));
      fake.emit("beforeEnvelope", envelope("accepted"));
      fake.emit("afterSendEvent", event("accepted"), {statusCode: 200});
    });

    expect(result).toEqual({status: "accepted", eventId: "accepted", statusCode: 200});
    expect(fake.cleanupCount()).toBe(3);
  });

  test("surfaces HTTP rejection", async () => {
    const fake = fakeClient();
    const result = await verifySentryDelivery(fake.client, "rejected", () => {
      fake.emit("afterSendEvent", event("rejected"), {statusCode: 403});
    });

    expect(result).toEqual({status: "rejected", eventId: "rejected", statusCode: 403});
  });

  test("surfaces SDK rate limits and network failures without a status", async () => {
    const fake = fakeClient();
    const result = await verifySentryDelivery(fake.client, "limited", () => {
      fake.emit("afterSendEvent", event("limited"), {
        headers: {"x-sentry-rate-limits": "60:error:organization", "retry-after": "60"},
      });
    });

    expect(result).toEqual({
      status: "not_sent",
      eventId: "limited",
      rateLimits: "60:error:organization",
      retryAfter: "60",
    });
  });

  test("distinguishes a local drop from a transport timeout", async () => {
    const droppedClient = fakeClient();
    const dropped = await verifySentryDelivery(droppedClient.client, "dropped", () => {}, 1);
    expect(dropped).toEqual({status: "dropped", eventId: "dropped"});

    const timeoutClient = fakeClient();
    const timedOut = await verifySentryDelivery(timeoutClient.client, "timeout", () => {
      timeoutClient.emit("beforeSendEvent", event("timeout"));
      timeoutClient.emit("beforeEnvelope", envelope("timeout"));
    }, 1);
    expect(timedOut).toEqual({status: "timeout", eventId: "timeout"});
  });

  test("reports a synchronous capture failure and removes hooks", async () => {
    const fake = fakeClient();
    const error = new Error("capture failed");
    const result = await verifySentryDelivery(fake.client, "failed", () => { throw error; });

    expect(result).toEqual({status: "capture_failed", eventId: "failed", error});
    expect(fake.cleanupCount()).toBe(3);
  });
});
