import { useEffect, useMemo, useRef, useState } from "react";
import {
  experimental_Icon as Icon,
  experimental_useRpcMutation as useRpcMutation,
  experimental_useRpcQuery as useRpcQuery,
} from "@get-bb/plugin-sdk/app";
import { bbIconNames } from "./icons.generated";
import { defaultIcon, rpcContract, type SpotChatIcon } from "./rpc";

export function useSpotChatIcon(): SpotChatIcon {
  const { data } = useRpcQuery({ contract: rpcContract, pluginId: "spot-chat", method: "getIcon", input: null });
  return data?.icon ?? defaultIcon;
}

/** The icon chosen in Settings → Spot Chat → Icon. */
export function SpotChatIconGlyph({ className }: { className?: string }) {
  return <Icon name={useSpotChatIcon()} className={className} aria-hidden="true" />;
}

const spacedName = (name: string) => name.replace(/([a-z])([A-Z0-9])/g, "$1 $2");

export function IconSettings() {
  const current = useSpotChatIcon();
  const { mutate, isPending, error } = useRpcMutation({ contract: rpcContract, method: "saveIcon" });
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const icons = useMemo(() => {
    const needle = filter.trim().toLowerCase().replace(/\s+/g, "");
    return needle ? bbIconNames.filter((name) => name.toLowerCase().includes(needle)) : bbIconNames;
  }, [filter]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function choose(icon: SpotChatIcon) {
    setOpen(false);
    setFilter("");
    try {
      await mutate(icon);
    } catch {
      // The mutation exposes the error below.
    }
  }

  return (
    <div className="spot-chat-settings-card spot-chat-icon-settings" ref={root}>
      <div className="spot-chat-setting-row">
        <div className="spot-chat-setting-text">
          <p className="spot-chat-setting-label">Spot Chat icon</p>
          <p className="spot-chat-setting-description">
            Shown on the sidebar footer button, in the navigation rail, and in the Spot Chat window and panel.
          </p>
        </div>
        <div className="spot-chat-setting-controls">
          <button
            type="button"
            className="spot-chat-icon-current"
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={isPending}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={current} aria-hidden="true" />
            <span>{spacedName(current)}</span>
            <Icon name="ChevronDown" aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div
          className="spot-chat-icon-popover"
          role="dialog"
          aria-label="Choose Spot Chat icon"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <input
            ref={search}
            type="search"
            placeholder={`Search ${bbIconNames.length} icons`}
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          <div className="spot-chat-icon-grid" role="listbox" aria-label="BB icons">
            {icons.map((name) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={name === current}
                aria-label={spacedName(name)}
                title={spacedName(name)}
                className={name === current ? "spot-chat-icon-option spot-chat-icon-option-active" : "spot-chat-icon-option"}
                onClick={() => void choose(name)}
              >
                <Icon name={name} aria-hidden="true" />
              </button>
            ))}
            {icons.length === 0 && <p>No icons match.</p>}
          </div>
        </div>
      )}
      {error && <p role="alert">Could not save the icon. {error.message}</p>}
    </div>
  );
}
