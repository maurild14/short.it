import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import "./editor-layout.css";

type Panel = "chat" | "inspector" | "timeline";
type Sizes = Record<Panel, number>;
const defaults: Sizes = { chat: 335, inspector: 236, timeline: 230 };
const storageKey = "short-it-panel-sizes";
const clamp = (value: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, value)));

export function useEditorLayout() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);
  const drag = useRef<{
    panel: Panel;
    pointer: number;
    start: number;
    size: number;
  } | null>(null);
  const [available, setAvailable] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 60,
  });
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [sizes, setSizes] = useState<Sizes>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return Object.fromEntries(
        Object.entries(defaults).map(([key, fallback]) => [
          key,
          typeof saved?.[key] === "number" && Number.isFinite(saved[key])
            ? saved[key]
            : fallback,
        ]),
      ) as Sizes;
    } catch {
      return defaults;
    }
  });
  const chatMax = Math.max(
    240,
    Math.min(600, available.width - 65 - 16 - 240 - 180),
  );
  const chat = chatCollapsed ? 0 : clamp(sizes.chat, 240, chatMax);
  const inspectorMax = Math.max(
    180,
    Math.min(420, available.width - 65 - 16 - chat - 240),
  );
  const inspector = clamp(sizes.inspector, 180, inspectorMax);
  const timelineMax = Math.max(130, available.height - 280);
  const timeline = clamp(sizes.timeline, 130, timelineMax);
  const values = { chat, inspector, timeline };
  const bounds = {
    chat: [240, chatMax],
    inspector: [180, inspectorMax],
    timeline: [130, timelineMax],
  };

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setAvailable({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sizes));
    } catch {
      /* Resizing still works when browser storage is unavailable. */
    }
  }, [sizes]);

  const update = (panel: Panel, value: number) => {
    const [min, max] = bounds[panel];
    setSizes((current) => ({ ...current, [panel]: clamp(value, min, max) }));
  };
  function splitter(panel: Panel) {
    const vertical = panel !== "timeline";
    const label =
      panel === "chat"
        ? "Resize assistant panel"
        : panel === "inspector"
          ? "Resize properties panel"
          : "Resize timeline";
    const finish = (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    };
    return (
      <div
        className={`panel-splitter ${panel}-splitter`}
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={vertical ? "vertical" : "horizontal"}
        aria-valuemin={bounds[panel][0]}
        aria-valuemax={bounds[panel][1]}
        aria-valuenow={values[panel]}
        aria-valuetext={`${values[panel]} pixels`}
        title={`${label} · drag or use arrow keys · double-click to reset`}
        onDoubleClick={() => update(panel, defaults[panel])}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            panel,
            pointer: event.pointerId,
            start: vertical ? event.clientX : event.clientY,
            size: values[panel],
          };
        }}
        onPointerMove={(event) => {
          const origin = drag.current;
          if (
            !origin ||
            origin.panel !== panel ||
            origin.pointer !== event.pointerId
          )
            return;
          const delta =
            (vertical ? event.clientX : event.clientY) - origin.start;
          update(panel, origin.size + (panel === "chat" ? delta : -delta));
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const negative = vertical ? "ArrowLeft" : "ArrowUp";
          const positive = vertical ? "ArrowRight" : "ArrowDown";
          if (![negative, positive, "Home", "End", "Enter"].includes(event.key))
            return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Home") update(panel, bounds[panel][0]);
          else if (event.key === "End") update(panel, bounds[panel][1]);
          else if (event.key === "Enter") update(panel, defaults[panel]);
          else
            update(
              panel,
              values[panel] +
                (event.key === positive ? 1 : -1) *
                  (panel === "chat" ? 1 : -1) *
                  (event.shiftKey ? 40 : 10),
            );
        }}
      >
        <span aria-hidden="true" />
      </div>
    );
  }

  return {
    ref,
    style: {
      "--chat-width": `${chat}px`,
      "--inspector-width": `${inspector}px`,
      "--timeline-height": `${timeline}px`,
    } as CSSProperties,
    chatCollapsed,
    toggleChat: () => setChatCollapsed((value) => !value),
    openChat: () => setChatCollapsed(false),
    reset: () => {
      setSizes(defaults);
      setChatCollapsed(false);
    },
    splitter,
  };
}
