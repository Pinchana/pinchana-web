"use client";

import type { ReactNode } from "react";

export type SettingsSwitchVariant = "list" | "card";

type SettingsSwitchProps = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  variant?: SettingsSwitchVariant;
  onChange: (checked: boolean) => void;
};

export default function SettingsSwitch({
  id,
  label,
  description,
  checked,
  disabled = false,
  variant = "list",
  onChange,
}: SettingsSwitchProps) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <label
      className="settings-toggle"
      htmlFor={id}
      data-disabled={disabled}
      data-variant={variant}
    >
      {description ? (
        <span className="settings-control-copy">
          <strong>{label}</strong>
          <small id={descriptionId}>{description}</small>
        </span>
      ) : (
        <strong className="settings-toggle-label">{label}</strong>
      )}
      <span className="setting-switch">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}
