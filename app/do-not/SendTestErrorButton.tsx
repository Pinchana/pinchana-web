"use client";

import * as Sentry from "@sentry/nextjs";
import {useState} from "react";
import {ensureSentryClient} from "../lib/sentry-client";
import {type SentryVerificationResult, verifySentryDelivery} from "../lib/sentry-verification";

type SendState =
  | {status: "idle"}
  | {status: "sending"}
  | {status: "unconfigured"}
  | {status: "disabled"}
  | {status: "initialization_failed"}
  | SentryVerificationResult;

function createEventId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export default function SendTestErrorButton() {
  const [state, setState] = useState<SendState>({status: "idle"});

  async function sendTestError() {
    setState({status: "sending"});

    const readiness = ensureSentryClient();
    if (readiness.status !== "ready") {
      setState(readiness.status === "initialization_failed"
        ? {status: "initialization_failed"}
        : {status: readiness.status});
      return;
    }

    const error = new Error("Pinchana Sentry verification test");
    error.name = "SentryVerificationError";
    const eventId = createEventId();

    const result = await verifySentryDelivery(readiness.client, eventId, () => {
      Sentry.withScope((scope) => {
        scope.setLevel("error");
        scope.setTags({
          pinchana_operation: "sentry_verification",
          sentry_test_endpoint: "do-not",
        });
        Sentry.captureException(error, {event_id: eventId});
      });
    });

    setState(result);
  }

  const sending = state.status === "sending";

  return (
    <div>
      <button
        type="button"
        onClick={sendTestError}
        disabled={sending}
      >
        {sending ? "Sending…" : "Send test error"}
      </button>

      {state.status === "unconfigured" ? (
        <p role="status">Sentry is not configured for this deployment.</p>
      ) : state.status === "disabled" ? (
        <p role="alert">Sentry initialized without an enabled browser transport.</p>
      ) : state.status === "initialization_failed" ? (
        <p role="alert">Sentry initialization failed. Check this deployment’s DSN and browser bundle.</p>
      ) : state.status === "accepted" ? (
        <p role="status">
          Accepted by Sentry (HTTP {state.statusCode}). Event ID: <code>{state.eventId}</code>
        </p>
      ) : state.status === "rejected" ? (
        <p role="alert">Sentry rejected the event with HTTP {state.statusCode}. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "not_sent" ? (
        <p role="alert">
          The SDK did not receive an HTTP response{state.rateLimits ? ` (rate limit: ${state.rateLimits})` : ""}.
          {state.retryAfter ? ` Retry after ${state.retryAfter} seconds.` : ""}
          {" "}Event ID: <code>{state.eventId}</code>
        </p>
      ) : state.status === "dropped" ? (
        <p role="alert">The event was dropped locally before an envelope was created. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "timeout" ? (
        <p role="alert">The Sentry transport timed out without confirming delivery. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "capture_failed" ? (
        <p role="alert">Capturing the test event failed locally. Event ID: <code>{state.eventId}</code></p>
      ) : (
        <p>This creates one synthetic client error. Nothing is sent until you press the button.</p>
      )}
    </div>
  );
}
