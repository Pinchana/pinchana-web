import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsSwitch from "./SettingsSwitch";

describe("SettingsSwitch", () => {
  test("renders the reusable card switch with an associated label", () => {
    const markup = renderToStaticMarkup(
      <SettingsSwitch
        id="twitter-gif"
        label="Convert looping videos"
        checked
        variant="card"
        onChange={() => {}}
      />,
    );

    expect(markup).toContain('data-variant="card"');
    expect(markup).toContain('for="twitter-gif"');
    expect(markup).toContain('id="twitter-gif"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Convert looping videos");
  });

  test("connects list descriptions and disabled state to the checkbox", () => {
    const markup = renderToStaticMarkup(
      <SettingsSwitch
        id="better-audio"
        label="Prefer better audio"
        description="Use a separate audio stream when available."
        checked={false}
        disabled
        onChange={() => {}}
      />,
    );

    expect(markup).toContain('data-variant="list"');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain('aria-describedby="better-audio-description"');
    expect(markup).toContain('id="better-audio-description"');
    expect(markup).toContain("disabled");
  });
});
