/**
 * MidiDeviceSelector - UI for selecting MIDI input device
 */

import type { MidiDeviceInfo } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface MidiDeviceSelectorProps {
  devices: MidiDeviceInfo[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
  onRefresh: () => void;
  locale?: Locale;
}

export function MidiDeviceSelector({
  devices,
  selectedId,
  onSelect,
  onRefresh,
  locale = "ja",
}: MidiDeviceSelectorProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "#f5f5f5",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 500, color: "#555", whiteSpace: "nowrap" }}>
        {t(locale, "midiInput")}
      </span>
      {devices.length === 0 ? (
        <span style={{ color: "#999", fontStyle: "italic" }}>
          {t(locale, "noMidiDevices")}
        </span>
      ) : (
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          style={{
            flex: 1,
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid #ccc",
            fontSize: 13,
            background: "#fff",
          }}
        >
          <option value="">{t(locale, "selectDevice")}</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.manufacturer})
            </option>
          ))}
        </select>
      )}
      <button
        onClick={onRefresh}
        style={{
          padding: "4px 12px",
          borderRadius: 4,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          fontSize: 12,
        }}
        title={t(locale, "refresh")}
      >
        {t(locale, "refresh")}
      </button>
    </div>
  );
}
