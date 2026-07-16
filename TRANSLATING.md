# Translating Pinchana Web

Pinchana Web uses the public, self-hosted Weblate instance at [translate.pinchana.cc](https://translate.pinchana.cc/projects/pinchana/) for community translations. The contribution link appears in **Settings → General → Interface** when a deployment sets `NEXT_PUBLIC_TRANSLATION_URL`.

English is the source language. Community translations are licensed under `AGPL-3.0-only`, the same license as the interface. Do not translate product names, service names, codecs, cookie identifiers, URLs, filenames, build revisions, or raw errors returned by an upstream API.

## Catalogs

- `messages/app/en.json` contains interface, accessibility, notification, metadata, and web-owned API copy.
- `messages/legal/en.json` contains the Privacy Policy and Terms of Use. Legal translations are reviewed and activated separately from interface translations.
- Messages use nested JSON keys and ICU MessageFormat. Keep every placeholder and rich-text tag from the English source unchanged.

A translation file may be committed while incomplete, but it is not exposed in the language selector until its locale is added to `SUPPORTED_LOCALES` in `i18n/config.ts`. A legal translation also requires separate approval in `APPROVED_LEGAL_LOCALES`. Until then, legal pages fall back to the authoritative English text. English and Ukrainian are currently active for both the interface and legal pages.

Run the catalog checks before submitting a translation:

```bash
bun run test
```

## Weblate project setup

The self-hosted deployment is prepared in the sibling `weblate-docker` checkout. Create one public project with two components connected to GitHub:

| Component | File mask | Source file | Component flags |
| --- | --- | --- | --- |
| Application | `messages/app/*.json` | `messages/app/en.json` | `icu-message-format` |
| Legal | `messages/legal/*.json` | `messages/legal/en.json` | `icu-message-format` |

Use English as the source language and Ukrainian as the first translation. Use nested JSON as the file format, `main` as the repository branch, and a dedicated Weblate push branch. Weblate must open pull requests; it must not push directly to `main`. Enable review and configure Weblate to commit only approved translations. Set the translation license to `AGPL-3.0-only`.

Maintainers review catalog checks, terminology, layout, accessibility labels, placeholder parity, and legal accuracy before merging. Activating a locale is a separate maintainer change after its application catalog is complete. Activating its legal catalog requires another explicit review.

## Adding a locale

1. Complete and review `messages/app/<locale>.json` in Weblate.
2. Add a static importer in `i18n/messages.ts`.
3. Add the locale label and text direction to `SUPPORTED_LOCALES`.
4. If the legal catalog received separate approval, add its importer and add the locale to `APPROVED_LEGAL_LOCALES`.
5. Run `bun run test`, `bun run lint`, and `bun run build`.

Do not activate a partially translated application catalog. Legal pages deliberately display English with a fallback notice when the interface locale has no approved legal translation. The `?legal=en` query always opens the English legal text without changing the interface-language cookie.
