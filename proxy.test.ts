import { expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

test("production CSP permits WebAssembly without enabling JavaScript eval", () => {
  const response = proxy(new NextRequest("https://pinchana.cc/"));
  const csp = response.headers.get("Content-Security-Policy");
  const scriptSrc = csp
    ?.split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .find(([directive]) => directive === "script-src");

  expect(scriptSrc).not.toContain("'self'");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).toContain("'wasm-unsafe-eval'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
});
