import {describe, expect, test} from "bun:test";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {parse} from "@formatjs/icu-messageformat-parser";
import {APPROVED_LEGAL_LOCALES, SUPPORTED_LOCALES} from "./config";
import {loadAppMessages, loadLegalMessages} from "./messages";

type CatalogEntry = {
  source: string;
  translation: string;
};

type FlatCatalog = Map<string, CatalogEntry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && !Array.isArray(value) && typeof value === "object");
}

function flatten(value: unknown, prefix = "", output: FlatCatalog = new Map()): FlatCatalog {
  if (!isRecord(value)) {
    throw new Error(`Catalog value at ${prefix || "<root>"} must be an object`);
  }

  const keys = Object.keys(value).sort();
  if (keys.length === 2
    && keys[0] === "source"
    && keys[1] === "translation"
    && typeof value.source === "string"
    && typeof value.translation === "string") {
    output.set(prefix, {source: value.source, translation: value.translation});
    return output;
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
    for (const [key, entry] of catalog) {
      const sourceEntry = source.get(key);
      expect(sourceEntry, `${filename}:${key} must exist in en.json`).toBeDefined();
      expect(entry.source.trim(), `${filename}:${key}:source`).not.toBe("");
      expect(entry.translation.trim(), `${filename}:${key}:translation`).not.toBe("");
      expect(() => parse(entry.source), `${filename}:${key}:source`).not.toThrow();
      expect(() => parse(entry.translation), `${filename}:${key}:translation`).not.toThrow();
      expect(entry.source, `${filename}:${key}:source must match en.json`).toBe(sourceEntry?.source);
      expect(argumentsFor(entry.translation), `${filename}:${key}:translation`).toEqual(argumentsFor(entry.source));
      if (locale === "en") {
        expect(entry.translation, `${filename}:${key}:translation`).toBe(entry.source);
      }
    }
    if (activeLocales.includes(locale)) {
      expect([...catalog.keys()].sort(), `${filename} must be complete before activation`).toEqual([...source.keys()].sort());
    }
  }
}

describe("translation catalogs", () => {
  test("catalog leaves use explicit source and translation strings", () => {
    expect(() => flatten({message: {source: "Hello"}})).toThrow();
    expect(() => flatten({message: {source: "Hello", translation: "Hello", note: "extra"}})).toThrow();
    expect(() => flatten({message: {source: "Hello", translation: 3}})).toThrow();
  });

  test("ICU arguments and rich-text tags are included in parity checks", () => {
    expect(argumentsFor("Hello, {name}. Read <link>{count, plural, one {this} other {these}}</link>."))
      .toEqual(["count", "link", "name"]);
  });

  test("catalog loaders expose translated strings without metadata", async () => {
    const [englishApp, ukrainianApp, ukrainianLegal] = await Promise.all([
      loadAppMessages("en"),
      loadAppMessages("uk"),
      loadLegalMessages("uk"),
    ]);

    expect(englishApp.language.pickerLabel).toBe("Change language");
    expect(ukrainianApp.language.pickerLabel).toBe("Змінити мову");
    expect(englishApp.settings.about.source).toBe("Source code");
    expect(ukrainianLegal.shared.documents).toBe("Правові документи");
  });

  test("application catalogs have valid ICU and complete active locales", async () => {
    await validateDirectory("app", SUPPORTED_LOCALES.map(({code}) => code));
  });

  test("legal catalogs have valid ICU and separately approved locales", async () => {
    await validateDirectory("legal", APPROVED_LEGAL_LOCALES);
  });
});
