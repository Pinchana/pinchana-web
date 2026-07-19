import {describe, expect, test} from "bun:test";
import {createSentryClientInitializer} from "./sentry-client";

function runtime() {
  let client: {id: string} | undefined;
  let enabled = true;
  let initCalls = 0;

  return {
    adapter: {
      getClient: () => client,
      isEnabled: () => enabled,
      init: () => {
        initCalls += 1;
        client = {id: "client"};
      },
    },
    setClient: (value: {id: string} | undefined) => { client = value; },
    setEnabled: (value: boolean) => { enabled = value; },
    initCalls: () => initCalls,
  };
}

describe("Sentry client initialization", () => {
  test("stays optional when no DSN is configured", () => {
    const fake = runtime();
    const initialize = createSentryClientInitializer(fake.adapter, undefined, {});

    expect(initialize()).toEqual({status: "unconfigured"});
    expect(fake.initCalls()).toBe(0);
  });

  test("initializes once and reuses the active client", () => {
    const fake = runtime();
    const initialize = createSentryClientInitializer(fake.adapter, "https://dsn", {});

    expect(initialize().status).toBe("ready");
    expect(initialize().status).toBe("ready");
    expect(fake.initCalls()).toBe(1);
  });

  test("reports an existing disabled client without reinitializing it", () => {
    const fake = runtime();
    fake.setClient({id: "disabled"});
    fake.setEnabled(false);
    const initialize = createSentryClientInitializer(fake.adapter, "https://dsn", {});

    expect(initialize()).toEqual({status: "disabled"});
    expect(fake.initCalls()).toBe(0);
  });

  test("surfaces initialization failures without retrying them", () => {
    let initCalls = 0;
    const error = new Error("invalid DSN");
    const initialize = createSentryClientInitializer({
      getClient: () => undefined,
      isEnabled: () => false,
      init: () => {
        initCalls += 1;
        throw error;
      },
    }, "invalid", {});

    expect(initialize()).toEqual({status: "initialization_failed", error});
    expect(initialize()).toEqual({status: "disabled"});
    expect(initCalls).toBe(1);
  });
});
