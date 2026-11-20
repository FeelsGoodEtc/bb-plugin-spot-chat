import { useEffect, useRef, useState } from "react";
import {
  experimental_Icon as Icon,
  experimental_useRpcMutation as useRpcMutation,
  experimental_useRpcQuery as useRpcQuery,
} from "@get-bb/plugin-sdk/app";
import { rpcContract, type ChatSummary, type DeleteChatsRequest } from "./rpc";

const dayMs = 24 * 60 * 60 * 1000;
const ageOptions = [7, 30, 90] as const;
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * dayMs],
  ["month", 30 * dayMs],
  ["week", 7 * dayMs],
  ["day", dayMs],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

function formatAge(timestamp: number) {
  const delta = timestamp - Date.now();
  for (const [unit, size] of units) {
    if (Math.abs(delta) >= size) return relativeTime.format(Math.round(delta / size), unit);
  }
  return "just now";
}

export function chatTitle(chat: Pick<ChatSummary, "id" | "title">) {
  return chat.title?.trim() || "Untitled chat";
}

export function useSpotChats() {
  const query = useRpcQuery({ contract: rpcContract, method: "listChats", input: null });
  const { refetch } = query;
  useEffect(() => {
    // Titles arrive after the first turn; keep the list fresh while it is on screen.
    const timer = window.setInterval(() => void refetch(), 15_000);
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch]);
  return query;
}

/** A button that asks for a second click before running a destructive action. */
function ConfirmButton({ label, confirmLabel, disabled, onConfirm, className, icon }: {
  label: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
  icon?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function click() {
    if (armed) {
      window.clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), 4000);
  }

  return (
    <button
      type="button"
      className={`${className ?? "spot-chat-button"}${armed ? " spot-chat-button-danger" : ""}`}
      disabled={disabled}
      onClick={click}
      onBlur={() => setArmed(false)}
      aria-label={armed ? confirmLabel : label}
      title={armed ? confirmLabel : label}
    >
      {icon && !armed ? <Icon name={icon} aria-hidden="true" /> : armed ? confirmLabel : label}
    </button>
  );
}

export function ChatList({ activeId, onOpen }: { activeId?: string | null; onOpen: (threadId: string) => void }) {
  const { data, error, refetch } = useSpotChats();
  const { mutate, isPending, error: deleteError } = useRpcMutation({ contract: rpcContract, method: "deleteChats" });
  const [days, setDays] = useState<number>(30);
  const [notice, setNotice] = useState("");
  const chats = data?.chats ?? [];
  const cutoff = Date.now() - days * dayMs;
  const olderCount = chats.filter((chat) => chat.updatedAt < cutoff).length;

  async function remove(request: DeleteChatsRequest) {
    setNotice("");
    try {
      const { deleted, failed } = await mutate(request);
      await refetch();
      setNotice(failed
        ? `Deleted ${deleted} chat${deleted === 1 ? "" : "s"}. ${failed} could not be deleted.`
        : `Deleted ${deleted} chat${deleted === 1 ? "" : "s"}.`);
    } catch {
      // The mutation exposes the error below.
    }
  }

  if (!data) {
    return error ? (
      <p className="spot-chat-list-status" role="alert">
        Could not load Spot Chat conversations. <button type="button" onClick={() => void refetch()}>Retry</button>
      </p>
    ) : (
      <p className="spot-chat-list-status" role="status">Loading conversations…</p>
    );
  }

  return (
    <div className="spot-chat-list">
      <div className="spot-chat-cleanup">
        <label>
          <span>Older than</span>
          <select value={days} onChange={(event) => setDays(Number(event.currentTarget.value))} disabled={isPending}>
            {ageOptions.map((option) => <option key={option} value={option}>{option} days</option>)}
          </select>
        </label>
        <ConfirmButton
          label={`Delete ${olderCount}`}
          confirmLabel={`Confirm delete ${olderCount}`}
          disabled={isPending || olderCount === 0}
          onConfirm={() => void remove({ kind: "older-than", days })}
        />
        <ConfirmButton
          label="Delete all"
          confirmLabel={`Confirm delete all ${chats.length}`}
          disabled={isPending || chats.length === 0}
          onConfirm={() => void remove({ kind: "all" })}
        />
      </div>
      {(notice || deleteError) && (
        <p className="spot-chat-list-status" role={deleteError ? "alert" : "status"}>
          {deleteError ? `Could not delete. ${deleteError.message}` : notice}
        </p>
      )}
      {chats.length === 0 ? (
        <p className="spot-chat-list-status">No Spot Chat conversations yet.</p>
      ) : (
        <ul className="spot-chat-rows">
          {chats.map((chat) => (
            <li key={chat.id} className={chat.id === activeId ? "spot-chat-row spot-chat-row-active" : "spot-chat-row"}>
              <button type="button" className="spot-chat-row-open" onClick={() => onOpen(chat.id)}>
                <span className="spot-chat-row-title">{chatTitle(chat)}</span>
                <span className="spot-chat-row-meta">
                  {chat.status === "active" || chat.status === "starting" ? "Working · " : ""}
                  {formatAge(chat.updatedAt)}
                </span>
              </button>
              <ConfirmButton
                className="spot-chat-row-delete"
                icon="Trash2"
                label="Delete chat"
                confirmLabel="Delete"
                disabled={isPending}
                onConfirm={() => void remove({ kind: "ids", threadIds: [chat.id] })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
