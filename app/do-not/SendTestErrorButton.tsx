"use client";

import * as Sentry from "@sentry/nextjs";
import {useState} from "react";
import {ensureSentryClient, sentryClientBuildInfo} from "../lib/sentry-client";
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
      <dl className="sentry-build-info">
        <div><dt>Monitoring</dt><dd>{sentryClientBuildInfo.monitoringEnabled ? "Enabled" : "Disabled"}</dd></div>
        <div><dt>Browser endpoint</dt><dd><code>{sentryClientBuildInfo.tunnelRoute || "None"}</code></dd></div>
        <div><dt>Environment</dt><dd>{sentryClientBuildInfo.environment}</dd></div>
        <div><dt>Release</dt><dd><code>{sentryClientBuildInfo.release}</code></dd></div>
      </dl>
      <button
        type="button"
        onClick={sendTestError}
        disabled={sending || !sentryClientBuildInfo.monitoringEnabled}
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
      ) : state.status === "network_error" ? (
        <p role="alert">
          The browser POST to <code>{state.endpoint}</code> failed before an HTTP response:
          {` ${state.errorName}: ${state.message}`} Event ID: <code>{state.eventId}</code>
        </p>
      ) : state.status === "rate_limited" ? (
        <p role="alert">
          Sentry delivery through <code>{state.endpoint}</code> was rate limited
          {state.rateLimits ? ` (${state.rateLimits})` : ""}.
          {state.retryAfter ? ` Retry after ${state.retryAfter} seconds.` : ""}
          {" "}Event ID: <code>{state.eventId}</code>
        </p>
      ) : state.status === "queue_overflow" ? (
        <p role="alert">The local Sentry transport queue was full before <code>{state.endpoint}</code> could send the event. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "send_error" ? (
        <p role="alert">The Sentry SDK discarded the event after a send error at <code>{state.endpoint}</code>. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "unknown_no_response" ? (
        <p role="alert">The Sentry transport returned no HTTP result or known drop reason{state.endpoint ? <> for <code>{state.endpoint}</code></> : null}. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "dropped" ? (
        <p role="alert">The event was dropped locally before an envelope was created. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "timeout" ? (
        <p role="alert">The Sentry transport timed out without confirming delivery. Event ID: <code>{state.eventId}</code></p>
      ) : state.status === "capture_failed" ? (
        <p role="alert">Capturing the test event failed locally. Event ID: <code>{state.eventId}</code></p>
      ) : (
        <p>
          {sentryClientBuildInfo.monitoringEnabled
            ? "This creates one synthetic client error. Nothing is sent until you press the button."
            : "This build has Sentry monitoring turned off, so no test event can be sent."}
        </p>
      )}
    </div>
  );
}
