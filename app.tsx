import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_NewThreadComposer as NewThreadComposer,
  experimental_ProviderModelPicker as ProviderModelPicker,
  experimental_useRpcMutation as useRpcMutation,
  experimental_useRpcQuery as useRpcQuery,
  ThreadChat,
  useBbNavigate,
  useRpc,
  useSdk,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { ChatList, chatTitle, useSpotChats } from "./chats";
import { rpcContract, type ModelSelection } from "./rpc";
import { IconSettings, SpotChatIconGlyph } from "./icon-picker";
import { FloatingPanel } from "./floating-panel";
import "./app.css";

const launchRequests = new EventTarget();
const activeThreadChanges = new EventTarget();
const threadStorageKey = "spot-chat:active-thread";
const newDraftKey = () => `spot-chat-${crypto.randomUUID()}`;
let nativeDraftKey = newDraftKey();
let activeThreadId: string | null = null;
let nativeSnapshot: { threadId: string | null; draftKey: string } | undefined;

function readStoredThread() {
  try {
    return sessionStorage.getItem(threadStorageKey) ?? activeThreadId;
  } catch {
    return activeThreadId;
  }
}

function readNativeChat() {
  const threadId = readStoredThread();
  if (nativeSnapshot?.threadId !== threadId || nativeSnapshot.draftKey !== nativeDraftKey) {
    nativeSnapshot = { threadId, draftKey: nativeDraftKey };
  }
  return nativeSnapshot;
}

function subscribeToActiveThread(listener: () => void) {
  activeThreadChanges.addEventListener("change", listener);
  return () => activeThreadChanges.removeEventListener("change", listener);
}

function setNativeThread(threadId: string | null) {
  activeThreadId = threadId;
  if (threadId === null) nativeDraftKey = newDraftKey();
  try {
    if (threadId) sessionStorage.setItem(threadStorageKey, threadId);
    else sessionStorage.removeItem(threadStorageKey);
  } catch {
    // Keep the conversation in this document even if browser storage is unavailable.
  }
  activeThreadChanges.dispatchEvent(new Event("change"));
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Separate Window opens a native macOS window on the BB server's Mac, so only
 * offer it to clients that sit on that Mac: the BB desktop app on macOS (which
 * exposes `window.bbDesktop`) or a Spot Chat window itself, both loaded over
 * loopback. Browsers and the mobile app always get the in-app panel.
 */
function canOpenSeparateWindow() {
  if (!loopbackHosts.has(window.location.hostname)) return false;
  if (window.location.pathname.startsWith("/plugins/spot-chat/window")) return true;
  const desktop = (window as { bbDesktop?: { platform?: string } }).bbDesktop;
  return desktop !== undefined && (desktop.platform === undefined || desktop.platform === "macos");
}

function requestChat() {
  launchRequests.dispatchEvent(new Event("open"));
}

const spotChatIconName = "spot-chat/icon";

function WindowLauncher() {
  const rpc = useRpc<typeof rpcContract>();
  const [error, setError] = useState("");
  const [floatingDraftKey, setFloatingDraftKey] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const panelOpen = useRef(false);
  panelOpen.current = floatingDraftKey !== null;

  useEffect(() => {
    let disposed = false;
    function openChat() {
      // Pressing the button or shortcut again closes an open in-app panel.
      if (panelOpen.current) {
        closeChatRef.current();
        return;
      }
      const focused = document.activeElement;
      setError("");
      void rpc.call("launch", { separateWindowAvailable: canOpenSeparateWindow() }).then(({ mode }) => {
        if (disposed || mode !== "inside-bb") return;
        if (focused instanceof HTMLElement && !focused.closest(".spot-chat-floating")) opener.current = focused;
        setFloatingDraftKey(newDraftKey());
      }).catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    }

    launchRequests.addEventListener("open", openChat);
    return () => {
      disposed = true;
      launchRequests.removeEventListener("open", openChat);
    };
  }, [rpc]);

  function closeChat() {
    setFloatingDraftKey(null);
    opener.current?.focus({ preventScroll: true });
    opener.current = null;
  }
  const closeChatRef = useRef(closeChat);
  closeChatRef.current = closeChat;

  return (
    <>
      {floatingDraftKey && (
        <FloatingPanel key={floatingDraftKey}>
          <FloatingChat initialDraftKey={floatingDraftKey} onClose={closeChat} />
        </FloatingPanel>
      )}
      {error && (
        <div className="spot-chat-launch-error" role="alert">
          <span>Spot Chat could not open. {error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError("")}>×</button>
        </div>
      )}
    </>
  );
}

function useSpotChatDefaults(enabled = true) {
  return useRpcQuery({ contract: rpcContract, method: "getDefaults", input: null, enabled });
}

function DefaultsEditor({ saved, refresh }: {
  saved: ModelSelection | null;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ModelSelection>();
  const inherited = useRpcQuery({
    contract: rpcContract,
    method: "getBbDefault",
    input: null,
    enabled: saved === null,
  });
  const { mutate, isPending, error } = useRpcMutation({ contract: rpcContract, method: "saveDefaults" });
  const selection = draft ?? saved ?? inherited.data?.selection;

  async function save(next: ModelSelection | null) {
    try {
      await mutate(next);
      await refresh();
      setDraft(undefined);
    } catch {
      // The mutation exposes the failure and the draft stays available to retry.
    }
  }

  return (
    <div className="spot-chat-defaults">
      <div className="spot-chat-setting-row">
        <div className="spot-chat-setting-text">
          <p className="spot-chat-setting-label">Model for new chats</p>
          <p className="spot-chat-setting-description">
            {saved ? "Used for new Spot Chat conversations." : "Using the BB default for chats without a project."}
          </p>
        </div>
        <div className="spot-chat-setting-controls">
          {selection ? (
            <>
              <ProviderModelPicker value={selection} onChange={setDraft} disabled={isPending} />
              <button
                className="spot-chat-defaults-button"
                type="button"
                disabled={isPending || (saved !== null && draft === undefined)}
                onClick={() => void save(selection)}
              >
                Save default
              </button>
              {saved && (
                <button className="spot-chat-defaults-button" type="button" disabled={isPending} onClick={() => void save(null)}>
                  Use BB default
                </button>
              )}
            </>
          ) : inherited.error ? (
            <p role="alert">Could not load the BB default. <button type="button" onClick={() => void inherited.refetch()}>Retry</button></p>
          ) : (
            <p role="status">{inherited.data ? "No available model found." : "Loading the BB default…"}</p>
          )}
        </div>
      </div>
      {error && <p role="alert">Could not save the Spot Chat default. {error.message}</p>}
    </div>
  );
}

function DefaultsLoading({ error, refetch }: ReturnType<typeof useSpotChatDefaults>) {
  return error ? (
    <p role="alert">Could not load Spot Chat defaults. <button type="button" onClick={() => void refetch()}>Retry</button></p>
  ) : (
    <p role="status">Loading Spot Chat defaults…</p>
  );
}

function SpotChatSettings() {
  const defaults = useSpotChatDefaults();
  return (
    <div className="spot-chat-settings-card">
      {defaults.data
        ? <DefaultsEditor saved={defaults.data.selection} refresh={defaults.refetch} />
        : <DefaultsLoading {...defaults} />}
    </div>
  );
}

function SpotChatWindow() {
  const { threadId, draftKey } = useSyncExternalStore(subscribeToActiveThread, readNativeChat);
  return (
    <main className="spot-chat-window">
      <SpotChatShell
        threadId={threadId}
        draftKey={draftKey}
        onOpenThread={setNativeThread}
        onNewChat={() => setNativeThread(null)}
      />
    </main>
  );
}

function FloatingChat({ initialDraftKey, onClose }: { initialDraftKey: string; onClose: () => void }) {
  const [chat, setChat] = useState<{ threadId: string | null; draftKey: string }>({ threadId: null, draftKey: initialDraftKey });
  return (
    <SpotChatShell
      threadId={chat.threadId}
      draftKey={chat.draftKey}
      onOpenThread={(threadId) => setChat((current) => ({ ...current, threadId }))}
      onNewChat={() => setChat({ threadId: null, draftKey: newDraftKey() })}
      onClose={onClose}
    />
  );
}

function CurrentChatTitle({ threadId }: { threadId: string | null }) {
  const { data } = useSpotChats();
  if (!threadId) return <>New chat</>;
  const chat = data?.chats.find(({ id }) => id === threadId);
  return <>{chat ? chatTitle(chat) : "Spot Chat"}</>;
}

function SpotChatShell({ threadId, draftKey, onOpenThread, onNewChat, onClose }: {
  threadId: string | null;
  draftKey: string;
  onOpenThread: (threadId: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
}) {
  const [showingChats, setShowingChats] = useState(false);
  return (
    <div className="spot-chat-shell">
      <header className="spot-chat-toolbar">
        <span className="spot-chat-brand" title="Spot Chat">
          <SpotChatIconGlyph />
        </span>
        <span className="spot-chat-toolbar-title">
          {showingChats ? "Conversations" : <CurrentChatTitle threadId={threadId} />}
        </span>
        <button
          type="button"
          className={showingChats ? "spot-chat-tool spot-chat-tool-active" : "spot-chat-tool"}
          aria-pressed={showingChats}
          aria-label={showingChats ? "Back to the current chat" : "Past Spot Chats"}
          data-tooltip={showingChats ? "Back to the current chat" : "Past Spot Chats"}
          onClick={() => setShowingChats((open) => !open)}
        >
          <Icon name="Clock" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="spot-chat-tool"
          aria-label="Start a new Spot Chat"
          data-tooltip="Start a new Spot Chat"
          onClick={() => {
            setShowingChats(false);
            onNewChat();
          }}
        >
          <Icon name="MessageSquarePlus" aria-hidden="true" />
        </button>
        {onClose && (
          <button type="button" className="spot-chat-tool" aria-label="Close Spot Chat" data-tooltip="Close Spot Chat" onClick={onClose}>
            <Icon name="X" aria-hidden="true" />
          </button>
        )}
      </header>
      {showingChats ? (
        <div className="spot-chat-list-scroll">
          <ChatList
            activeId={threadId}
            onOpen={(id) => {
              setShowingChats(false);
              onOpenThread(id);
            }}
          />
        </div>
      ) : (
        <Conversation key={threadId ?? draftKey} threadId={threadId} draftKey={draftKey} onThreadCreated={onOpenThread} />
      )}
    </div>
  );
}

function SpotChatsPanel({ subPath }: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const threadId = subPath ? decodeURIComponent(subPath.split("/")[0] ?? "") : null;
  if (threadId) {
    return (
      <div className="spot-chat-panel spot-chat-panel-thread">
        <div className="spot-chat-panel-bar">
          <button type="button" className="spot-chat-button" onClick={() => navigate.toPluginPanel("chats")}>
            <Icon name="ChevronLeft" aria-hidden="true" /> All Spot Chats
          </button>
          <button type="button" className="spot-chat-button" onClick={() => navigate.toThread(threadId)}>
            Open as thread
          </button>
        </div>
        <ThreadChat threadId={threadId} layout="contained" variant="compact" className="spot-chat-thread" />
      </div>
    );
  }
  return (
    <div className="spot-chat-panel">
      <p className="spot-chat-panel-hint">
        Spot Chat conversations are hidden from the sidebar thread list. Open one to continue it, or clean up old chats.
      </p>
      <ChatList onOpen={(id) => navigate.toPluginPanel("chats", { subPath: id })} />
    </div>
  );
}

function Conversation({ threadId, draftKey, onThreadCreated }: {
  threadId: string | null;
  draftKey: string;
  onThreadCreated: (threadId: string) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const [editingDefaults, setEditingDefaults] = useState(false);
  const defaults = useSpotChatDefaults(!threadId);
  const selection = defaults.data?.selection;

  return (
    <div className={threadId ? "spot-chat-conversation" : "spot-chat-conversation spot-chat-conversation-draft"}>
      {threadId ? (
        <ThreadChat threadId={threadId} layout="contained" variant="compact" className="spot-chat-thread" />
      ) : (
        <div className="spot-chat-compose">
          {defaults.data ? (
            <>
              <details className="spot-chat-defaults-disclosure" onToggle={(event) => setEditingDefaults(event.currentTarget.open)}>
                <summary>Spot Chat defaults</summary>
                {editingDefaults && <DefaultsEditor saved={defaults.data.selection} refresh={defaults.refetch} />}
              </details>
              <NewThreadComposer
                className="spot-chat-new-composer"
                draftKey={draftKey}
                focusRequest={1}
                defaultProviderId={selection?.providerId}
                defaultModel={selection?.model}
                defaultReasoningLevel={selection?.reasoningLevel}
                defaultServiceTier={selection?.serviceTier}
                onSubmit={async (request) => {
                  const thread = await sdk.threads.spawn({ ...request, visibility: "hidden" });
                  onThreadCreated(thread.id);
                  void rpc.call("chatsChanged").catch(() => undefined);
                }}
              />
            </>
          ) : (
            <DefaultsLoading {...defaults} />
          )}
        </div>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.experimental_icons.register({ name: spotChatIconName, component: SpotChatIconGlyph });
  app.slots.experimental_appOverlay({ id: "launcher", component: WindowLauncher });
  app.slots.settingsSection({ id: "icon", title: "Icon", component: IconSettings });
  app.slots.settingsSection({ id: "defaults", title: "Default model", component: SpotChatSettings });
  app.slots.navPanel({
    id: "chats",
    path: "chats",
    title: "Spot Chats",
    icon: spotChatIconName,
    component: SpotChatsPanel,
  });
  app.slots.navPanel({
    id: "window",
    path: "window",
    title: "Spot Chat",
    icon: spotChatIconName,
    component: SpotChatWindow,
    experimental_hideFromNavigation: true,
  });
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "open",
    label: "Spot Chat",
    icon: spotChatIconName,
    onActivate: requestChat,
  });
  app.commands.register({
    id: "open",
    title: "Spot Chat: new window",
    defaultShortcut: { key: "k", mod: true, alt: true },
    run: requestChat,
  });
});
