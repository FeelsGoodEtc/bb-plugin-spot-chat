import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { chatsTag, defaultIcon, defaultsTag, iconSchema, iconTag, modelSelectionSchema, rpcContract } from "./rpc";
import { defaultShortcut, openCommandBinding } from "./shortcut";

const run = promisify(execFile);
// The prebuilt native window ships in macos/. The server runs from dist/ when
// installed and from the plugin root under `bb plugin dev`, so try both.
const appCandidates = ["../macos/Spot Chat.app", "./macos/Spot Chat.app"]
  .map((relative) => fileURLToPath(new URL(relative, import.meta.url)));
const missingAppMessage = "The Separate Window app (macos/Spot Chat.app) is missing from this plugin install. "
  + "Choose Settings → Spot Chat → Open Spot Chat in → Inside BB, or rebuild it with `sh macos/build.sh` "
  + "(needs the Xcode Command Line Tools) and reinstall the plugin.";
const pluginId = "spot-chat";
const dayMs = 24 * 60 * 60 * 1000;
const defaultsKey = "model-defaults";
const iconKey = "icon";

export default function spotChat(bb: BbPluginApi) {
  const settings = bb.settings.define({
    openIn: {
      type: "select",
      label: "Open Spot Chat in",
      options: ["separate-window", "inside-bb"],
      experimental_optionLabels: {
        "separate-window": "Separate Window",
        "inside-bb": "Inside BB",
      },
      default: "inside-bb",
    },
  });

  async function listChats() {
    const chats = [];
    const limit = 200;
    for (let offset = 0; ; offset += limit) {
      const page = await bb.sdk.threads.list({ originPluginId: pluginId, includeHidden: true, hasParent: false, limit, offset });
      chats.push(...page.filter((thread) => thread.originPluginId === pluginId && !thread.archivedAt && !thread.deletedAt));
      if (page.length < limit) break;
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  bb.rpc.register(rpcContract, {
    async getIcon() {
      const stored = await bb.storage.kv.get<unknown>(iconKey);
      return { icon: iconSchema.safeParse(stored).data ?? defaultIcon };
    },
    async saveIcon(icon) {
      await bb.storage.kv.set(iconKey, icon);
      bb.rpc.experimental_invalidate([iconTag]);
      return { icon };
    },
    async getDefaults() {
      const stored = await bb.storage.kv.get<unknown>(defaultsKey);
      return { selection: modelSelectionSchema.safeParse(stored).data ?? null };
    },
    async saveDefaults(selection) {
      if (selection === null) {
        await bb.storage.kv.delete(defaultsKey);
      } else {
        await bb.storage.kv.set(defaultsKey, selection);
      }
      bb.rpc.experimental_invalidate([defaultsTag]);
      return { selection };
    },
    async getBbDefault() {
      const [projects, providers, config] = await Promise.all([
        bb.sdk.projects.list({ includePersonal: true }),
        bb.sdk.providers.list(),
        bb.sdk.system.config(),
      ]);
      const personal = projects.find(({ kind }) => kind === "personal");
      const remembered = personal
        ? await bb.sdk.projects.defaultExecutionOptions({ projectId: personal.id })
        : null;
      const available = providers.filter(({ available }) => available);
      const provider = available.find(({ id }) => id === remembered?.providerId)
        ?? available.find(({ id }) => id === config.generalSettings.defaultProviderId)
        ?? available[0];
      if (!provider) return { selection: null };

      const { models } = await bb.sdk.providers.models({
        providerId: provider.id,
        projectId: personal?.id,
      });
      const previous = remembered?.providerId === provider.id
        ? models.find(({ model, id }) => model === remembered.model || id === remembered.model)
        : undefined;
      const model = previous ?? models.find(({ isDefault }) => isDefault) ?? models[0];
      if (!model) return { selection: null };
      return {
        selection: {
          providerId: provider.id,
          model: model.model,
          reasoningLevel: previous && remembered ? remembered.reasoningLevel : model.defaultReasoningEffort,
          ...(previous && remembered ? { serviceTier: remembered.serviceTier } : {}),
        },
      };
    },
    async getShortcut(platform) {
      const { keybindingOverrides } = await bb.sdk.system.config();
      const overrides = keybindingOverrides.filter(({ command }) => command === openCommandBinding);
      const override = overrides.find((entry) => entry.platform === platform)
        ?? overrides.find((entry) => entry.platform === undefined);
      return { shortcut: override ? override.shortcut : defaultShortcut };
    },
    async listChats() {
      const chats = await listChats();
      return {
        chats: chats.map(({ id, title, titleFallback, createdAt, updatedAt, status }) => ({
          id,
          title: title ?? titleFallback ?? null,
          createdAt,
          updatedAt,
          status,
        })),
      };
    },
    chatsChanged() {
      bb.rpc.experimental_invalidate([chatsTag]);
      return null;
    },
    async deleteChats(request) {
      const chats = await listChats();
      const cutoff = request.kind === "older-than" ? Date.now() - request.days * dayMs : 0;
      const wanted = request.kind === "ids" ? new Set(request.threadIds) : null;
      const targets = chats.filter((chat) => {
        if (wanted) return wanted.has(chat.id);
        if (request.kind === "older-than") return chat.updatedAt < cutoff;
        return true;
      });
      let deleted = 0;
      let failed = 0;
      for (const chat of targets) {
        try {
          await bb.sdk.threads.delete({ threadId: chat.id, childThreadsConfirmed: true });
          deleted += 1;
        } catch (cause) {
          failed += 1;
          console.warn(`Spot Chat could not delete ${chat.id}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      bb.rpc.experimental_invalidate([chatsTag]);
      return { deleted, failed };
    },
    async launch({ separateWindowAvailable, anchor }) {
      const { openIn } = await settings.get();
      // Browsers, the mobile app, and clients on other machines cannot see a
      // window opened on the server's Mac, so they always get the in-app panel.
      if (openIn === "inside-bb" || !separateWindowAvailable || process.platform !== "darwin") {
        return { mode: "inside-bb" } as const;
      }

      const url = new URL("/plugins/spot-chat/window", bb.server.loopbackBaseUrl);
      const appPath = appCandidates.find((candidate) => existsSync(candidate));
      if (!appPath) throw new Error(missingAppMessage);
      const args = ["-n", "-a", appPath, "--args", url.href];
      if (anchor) args.push([anchor.x, anchor.y, anchor.width, anchor.height].map((value) => Math.round(value)).join(","));
      await run("/usr/bin/open", args);
      return { mode: "separate-window" } as const;
    },
  });
}
