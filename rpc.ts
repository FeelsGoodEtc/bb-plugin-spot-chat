import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { bbIconNames } from "./icons.generated";

const selectionId = z.string().min(1).max(1024);
export const modelSelectionSchema = z.object({
  providerId: selectionId,
  model: selectionId,
  reasoningLevel: selectionId,
  serviceTier: selectionId.optional(),
});
export type ModelSelection = z.infer<typeof modelSelectionSchema>;

export const defaultsTag = "spot-chat-defaults";
const defaultsResult = z.object({ selection: modelSelectionSchema.nullable() });
export const iconTag = "spot-chat-icon";
export const defaultIcon = "NewTab";
export const iconSchema = z.enum(bbIconNames);
export type SpotChatIcon = z.infer<typeof iconSchema>;
export const chatsTag = "spot-chat-chats";
export const chatSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: z.string(),
});
export type ChatSummary = z.infer<typeof chatSummarySchema>;
export const deleteChatsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ids"), threadIds: z.array(z.string().min(1)).min(1).max(200) }),
  z.object({ kind: z.literal("older-than"), days: z.number().int().min(1).max(3650) }),
  z.object({ kind: z.literal("all") }),
]);
export type DeleteChatsRequest = z.infer<typeof deleteChatsSchema>;

export const rpcContract = defineRpcContract({
  launch: {
    /** Whether this client can show a native window on the BB server's Mac. */
    input: z.object({ separateWindowAvailable: z.boolean() }),
    output: z.object({ mode: z.enum(["inside-bb", "separate-window"]) }),
  },
  listChats: { input: z.null(), output: z.object({ chats: z.array(chatSummarySchema) }), tags: () => [chatsTag] },
  chatsChanged: { input: z.null(), output: z.null() },
  deleteChats: { input: deleteChatsSchema, output: z.object({ deleted: z.number(), failed: z.number() }) },
  getIcon: {
    input: z.null(),
    output: z.object({ icon: iconSchema }),
    tags: () => [iconTag],
  },
  saveIcon: { input: iconSchema, output: z.object({ icon: iconSchema }) },
  getDefaults: { input: z.null(), output: defaultsResult, tags: () => [defaultsTag] },
  saveDefaults: { input: modelSelectionSchema.nullable(), output: defaultsResult },
  getBbDefault: { input: z.null(), output: defaultsResult },
});
