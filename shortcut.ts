import { z } from "zod";

/** Spot Chat's default "open" shortcut: Command–Option–S on macOS. */
export const defaultShortcut = { key: "s", mod: true, alt: true } as const;
/** The keybinding id BB uses for the plugin's "open" command. */
export const openCommandBinding = "plugin:spot-chat/open";

export const shortcutSchema = z.object({
  key: z.string(),
  mod: z.boolean().optional(),
  meta: z.boolean().optional(),
  control: z.boolean().optional(),
  alt: z.boolean().optional(),
  shift: z.boolean().optional(),
});
export type Shortcut = z.infer<typeof shortcutSchema>;
export const platformSchema = z.enum(["mac", "windows", "linux"]);
export type Platform = z.infer<typeof platformSchema>;

export function currentPlatform(): Platform {
  const name = navigator.platform || navigator.userAgent;
  if (/Mac|iPhone|iPad/u.test(name)) return "mac";
  if (/Win/u.test(name)) return "windows";
  return "linux";
}

function physicalKey(code: string) {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  return null;
}

/**
 * Whether `event` is `shortcut` on the physical keyboard while BB itself will
 * not see it.
 *
 * BB reads the typed character (`event.key`) and only falls back to the
 * physical key when Option is held and the character is not a Latin letter or
 * digit. Some layouts, such as macOS Russian, turn Command–Option–S into "z",
 * so BB sees Command–Option–Z and the editor runs Undo. Spot Chat handles
 * exactly that gap and leaves every press BB recognises to BB.
 */
export function missedByBb(event: KeyboardEvent, shortcut: Shortcut, platform: Platform) {
  if (event.isComposing || event.repeat) return false;
  const wanted = shortcut.key.toLowerCase();
  const physical = physicalKey(event.code);
  if (physical === null || physical !== wanted) return false;

  const typed = event.key.toLowerCase();
  const bbSees = event.altKey && !/^[a-z0-9]$/u.test(typed) ? physical : typed;
  if (bbSees === wanted) return false;

  const mod = Boolean(shortcut.mod);
  const meta = Boolean(shortcut.meta) || (mod && platform === "mac");
  const control = Boolean(shortcut.control) || (mod && platform !== "mac");
  return event.metaKey === meta
    && event.ctrlKey === control
    && event.altKey === Boolean(shortcut.alt)
    && event.shiftKey === Boolean(shortcut.shift);
}
