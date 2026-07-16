import {describe, expect, test} from "bun:test";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {parse} from "@formatjs/icu-messageformat-parser";
import {APPROVED_LEGAL_LOCALES, SUPPORTED_LOCALES} from "./config";

type FlatCatalog = Map<string, string>;

function flatten(value: unknown, prefix = "", output: FlatCatalog = new Map()): FlatCatalog {
  if (typeof value === "string") {
    output.set(prefix, value);
    return output;
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Catalog value at ${prefix || "<root>"} must be an object or string`);
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

async function readCatalog(path: string): Promise<FlatCatalog> {
  return flatten(JSON.parse(await readFile(path, "utf8")));
}

function argumentsFor(message: string): string[] {
  const names = new Set<string>();
  const visit = (elements: ReturnType<typeof parse>) => {
    for (const element of elements) {
      if ("value" in element && typeof element.value === "string" && element.type !== 0) names.add(element.value);
      if ("options" in element) {
        for (const option of Object.values(element.options)) visit(option.value);
      }
      if ("children" in element) visit(element.children);
    }
  };
  visit(parse(message));
  return [...names].sort();
}

async function validateDirectory(kind: "app" | "legal", activeLocales: readonly string[]) {
  const directory = join(process.cwd(), "messages", kind);
  const source = await readCatalog(join(directory, "en.json"));
  expect(source.size).toBeGreaterThan(0);

  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".json")) continue;
    const locale = filename.slice(0, -5);
    const catalog = await readCatalog(join(directory, filename));
    for (const [key, value] of catalog) {
      expect(value.trim(), `${filename}:${key}`).not.toBe("");
      expect(() => parse(value), `${filename}:${key}`).not.toThrow();
      if (locale !== "en" && source.has(key)) {
        expect(argumentsFor(value), `${filename}:${key}`).toEqual(argumentsFor(source.get(key)!));
      }
    }
    if (activeLocales.includes(locale)) {
      expect([...catalog.keys()].sort(), `${filename} must be complete before activation`).toEqual([...source.keys()].sort());
    }
  }
}

describe("translation catalogs", () => {
  test("application catalogs have valid ICU and complete active locales", async () => {
    await validateDirectory("app", SUPPORTED_LOCALES.map(({code}) => code));
  });

  test("legal catalogs have valid ICU and separately approved locales", async () => {
    await validateDirectory("legal", APPROVED_LEGAL_LOCALES);
  });
});
