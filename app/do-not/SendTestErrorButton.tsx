"use client";

import * as Sentry from "@sentry/nextjs";
import {useState} from "react";

type SendState =
  | {status: "idle"}
  | {status: "sending"}
  | {status: "sent"; eventId: string}
  | {status: "failed"};

export default function SendTestErrorButton({configured}: {configured: boolean}) {
  const [state, setState] = useState<SendState>({status: "idle"});

  async function sendTestError() {
    setState({status: "sending"});

    const error = new Error("Pinchana Sentry verification test");
    error.name = "SentryVerificationError";

    const eventId = Sentry.captureException(error, {
      level: "error",
      tags: {
        pinchana_operation: "sentry_verification",
        sentry_test_endpoint: "do-not",
      },
    });
    const delivered = await Sentry.flush(5_000);

    setState(delivered ? {status: "sent", eventId} : {status: "failed"});
  }

  const sending = state.status === "sending";

  return (
    <div>
      <button
        type="button"
        onClick={sendTestError}
        disabled={!configured || sending}
      >
        {sending ? "Sending…" : "Send test error"}
      </button>

      {!configured ? (
        <p role="status">Sentry is not configured for this deployment.</p>
      ) : state.status === "sent" ? (
        <p role="status">
          Delivered. Event ID: <code>{state.eventId}</code>
        </p>
      ) : state.status === "failed" ? (
        <p role="alert">Sentry did not confirm delivery. Check the DSN and browser network log.</p>
      ) : (
        <p>This creates one synthetic client error. Nothing is sent until you press the button.</p>
      )}
    </div>
  );
}
