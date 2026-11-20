# Spot Chat

The Spot Chat button in BB's left sidebar and Command–Option–K open a fresh BB
composer. Choose the mode under **Settings → Spot Chat → Open Spot Chat in**.
The shortcut is configurable under **Settings → Keyboard → Spot Chat: new window**.
Choose Spot Chat's icon under **Settings → Spot Chat → Icon** from BB's built-in
icon set. It appears on the sidebar footer button, in the navigation rail, and in
the Spot Chat window and panel header.

- **Separate Window** (default) opens a resizable macOS window on the display
  beneath the mouse pointer, at the right with room above it for the BB title bar.
  It restores its last resized
  dimensions or starts at one third of the display's available width.
- **Inside BB** opens a floating panel. Pressing the button or shortcut again
  closes it. It appears at the right below BB's title bar. It starts above
  the underlying composer, when present. Resize it from the left edge, bottom
  edge, or bottom-left corner. The panel saves its own size in that BB client.

Each launch gets a blank draft. Sending the first message creates a hidden BB
thread, using the project, environment and model chosen in the composer. Hidden
threads stay out of the sidebar thread list.

Find past conversations in two places:

- **Spot Chats** (the chosen icon) in BB's navigation rail lists every Spot Chat
  conversation. Open one to continue it there, or choose **Open as thread**.
- The clock button in the Spot Chat header shows the same list inside the
  window. Picking a conversation continues it in that window; the new-chat button
  starts a blank draft.

Both lists delete a single conversation (trash icon, click twice), every
conversation older than 7, 30 or 90 days, or all of them. Each delete asks for a
second click.

Spot Chat starts with BB's execution default for chats without a project. Choose
a provider and model in **Settings → Spot Chat → Default model** or open
**Spot Chat defaults** above the composer and select **Save default**. The
composer's own model picker changes the current conversation. **Use BB default**
clears the saved Spot Chat preference.

**Separate Window** loads the loopback BB server using WebKit. It is only used
from the BB desktop app on the Mac that runs the BB server. Web browsers, the
mobile app, and desktop apps connected to another machine always open
**Inside BB**, whatever the setting says. The Inside BB panel remembers its size
separately in each browser or app.

## Local build

Install the Xcode Command Line Tools, then run these commands from the plugin
directory.

```sh
npm ci
node scripts/extract-icons.mjs   # refresh BB's icon list after BB updates
sh macos/build.sh
npm exec -- tsc --noEmit
bb plugin build
bb plugin install .
```
