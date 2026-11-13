import { useEffect, useRef, useState, type PointerEvent } from "react";
import "./selection.css";

export function selectionFor(
  id: string,
  selected: string[],
  additive: boolean,
) {
  return additive
    ? selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id]
    : selected.includes(id)
      ? selected
      : [id];
}

export function usePointerGesture() {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return (
    move: (event: globalThis.PointerEvent) => void,
    finish: (cancelled: boolean) => void,
  ) => {
    cleanup.current();
    const end = (event: Event) => {
      cleanup.current();
      finish(event.type !== "pointerup");
    };
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
  };
}

export function useMarquee(
  selected: string[],
  onSelect: (ids: string[]) => void,
  disabled = false,
) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const gesture = usePointerGesture();
  const start = (event: PointerEvent<HTMLElement>) => {
    if (
      disabled ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "button,[data-selection-id],.track-label,.ruler",
      )
    )
      return;
    event.preventDefault();
    const root = event.currentTarget;
    const x = event.clientX,
      y = event.clientY;
    const base =
      event.shiftKey || event.ctrlKey || event.metaKey ? selected : [];
    onSelect(base);
    gesture(
      (e) => {
        const left = Math.min(x, e.clientX),
          top = Math.min(y, e.clientY);
        const right = Math.max(x, e.clientX),
          bottom = Math.max(y, e.clientY);
        setBox({ left, top, width: right - left, height: bottom - top });
        const hits = [
          ...root.querySelectorAll<HTMLElement>("[data-selection-id]"),
        ]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.right >= left &&
              rect.left <= right &&
              rect.bottom >= top &&
              rect.top <= bottom
            );
          })
          .map((element) => element.dataset.selectionId!);
        onSelect([...new Set([...base, ...hits])]);
      },
      (cancelled) => {
        setBox(null);
        if (cancelled) onSelect(selected);
      },
    );
  };
  return {
    start,
    marquee: box ? (
      <div className="selection-marquee" style={box} aria-hidden="true" />
    ) : null,
  };
}
