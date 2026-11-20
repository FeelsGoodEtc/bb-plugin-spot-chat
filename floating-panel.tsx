import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type Size = { width: number; height: number };
type Edge = "left" | "bottom" | "corner";
type Drag = { pointerId: number; x: number; y: number; size: Size; preferredSize: Size };

const sizeKey = "spot-chat:inside-bb-size";
const inset = 12;
const minWidth = 280;
const minHeight = 144;
const minInitialHeight = 220;
const handles: { edge: Edge; label: string }[] = [
  { edge: "left", label: "Resize Spot Chat width" },
  { edge: "bottom", label: "Resize Spot Chat height" },
  { edge: "corner", label: "Resize Spot Chat" },
];

function fitDimension(value: number, minimum: number, available: number) {
  return Math.max(1, Math.min(Math.max(value, minimum), available));
}

function fitSize({ width, height }: Size, top: number): Size {
  return {
    width: fitDimension(width, minWidth, window.innerWidth - 2 * inset),
    height: fitDimension(height, minHeight, window.innerHeight - top - inset),
  };
}

function readSize(): Size | null {
  try {
    const stored = JSON.parse(localStorage.getItem(sizeKey) ?? "null");
    if (Number.isFinite(stored?.width) && stored.width > 0
      && Number.isFinite(stored?.height) && stored.height > 0) {
      return { width: stored.width, height: stored.height };
    }
  } catch {
    // Fall back to the current viewport when storage is unavailable.
  }
  return null;
}

function initialSize(top: number): Size {
  const { width } = fitSize({ width: Math.max(400, Math.round(window.innerWidth / 3)), height: 0 }, top);
  const left = window.innerWidth - inset - width;
  let bottom = window.innerHeight;
  for (const shell of Array.from(document.querySelectorAll("[data-promptbox-shell]"))) {
    if (shell.closest(".spot-chat-floating")) continue;
    const bounds = shell.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0 && bounds.top >= top + minInitialHeight + inset
      && bounds.left < window.innerWidth - inset && bounds.right > left) {
      bottom = Math.min(bottom, bounds.top);
    }
  }
  return { width, height: Math.max(1, Math.floor(bottom - top - inset)) };
}

function rememberSize(size: Size) {
  try {
    localStorage.setItem(sizeKey, JSON.stringify(size));
  } catch {
    // Resizing still works when storage is unavailable.
  }
}

export function FloatingPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState(readSize);
  useLayoutEffect(() => {
    if (panel.current) {
      const top = panel.current.getBoundingClientRect().top;
      setSize((stored) => stored ?? initialSize(top));
    }
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || drag.current || !size || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      size: { width, height },
      preferredSize: size,
    };
  }

  function dragSize(event: PointerEvent<HTMLButtonElement>, edge: Edge, finish = false) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId || !panel.current) return;
    const width = edge === "bottom" ? start.size.width : start.size.width + start.x - event.clientX;
    const height = edge === "left" ? start.size.height : start.size.height + event.clientY - start.y;
    const fitted = fitSize({ width, height }, panel.current.getBoundingClientRect().top);
    const next = {
      width: width === start.size.width || fitted.width === start.size.width ? start.preferredSize.width : fitted.width,
      height: height === start.size.height || fitted.height === start.size.height ? start.preferredSize.height : fitted.height,
    };
    setSize(next);
    if (finish) {
      drag.current = null;
      if (next.width !== start.preferredSize.width || next.height !== start.preferredSize.height) rememberSize(next);
    }
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (start?.pointerId !== event.pointerId) return;
    drag.current = null;
    setSize(start.preferredSize);
  }

  function keyboardResize(event: KeyboardEvent<HTMLButtonElement>, edge: Edge) {
    const widthDelta = edge === "bottom" ? 0 : ({ ArrowLeft: 16, ArrowRight: -16 }[event.key] ?? 0);
    const heightDelta = edge === "left" ? 0 : ({ ArrowDown: 16, ArrowUp: -16 }[event.key] ?? 0);
    if ((widthDelta === 0 && heightDelta === 0) || !size || !panel.current) return;
    event.preventDefault();
    const { width, height, top } = panel.current.getBoundingClientRect();
    const fitted = fitSize({ width: width + widthDelta, height: height + heightDelta }, top);
    const next = { width: widthDelta ? fitted.width : size.width, height: heightDelta ? fitted.height : size.height };
    setSize(next);
    rememberSize(next);
  }

  return (
    <section
      ref={panel}
      role="dialog"
      aria-label="Spot Chat"
      className="spot-chat-floating"
      style={{ ...size, "--spot-chat-inset": `${inset}px` } as CSSProperties}
    >
      {size && children}
      {handles.map(({ edge, label }) => (
        <button
          key={edge}
          type="button"
          className={`spot-chat-resize spot-chat-resize-${edge}`}
          aria-label={label}
          onPointerDown={startDrag}
          onPointerMove={(event) => dragSize(event, edge)}
          onPointerUp={(event) => dragSize(event, edge, true)}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onKeyDown={(event) => keyboardResize(event, edge)}
        />
      ))}
    </section>
  );
}
