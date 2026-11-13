import { useEffect, useRef, useState } from "react";
import { Expand, Shrink } from "lucide-react";
import { IconButton } from "./ui";
import "./fullscreen.css";

export default function FullscreenButton() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = native || expanded;

  useEffect(() => {
    const changed = () =>
      setNative(
        document.fullscreenElement ===
          anchor.current?.closest(".preview-panel"),
      );
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const panel = anchor.current?.closest<HTMLElement>(".preview-panel");
    if (!panel) return;
    panel.classList.add("preview-expanded");
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let current: HTMLElement = panel;
    while (current.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      current = current.parentElement;
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key === "Tab") {
        const focusable = [
          ...panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select, input, [tabindex="0"]',
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      panel.classList.remove("preview-expanded");
      for (const { element, inert } of siblings) element.inert = inert;
      document.removeEventListener("keydown", key);
      anchor.current?.querySelector("button")?.focus();
    };
  }, [expanded]);

  async function toggle() {
    const panel = anchor.current?.closest<HTMLElement>(".preview-panel");
    if (!panel) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (!panel.requestFullscreen) throw new Error("Fullscreen unavailable");
      await panel.requestFullscreen();
    } catch {
      // Embedded browsers may deny native fullscreen; expand inside the window.
      if (panel.isConnected) setExpanded(true);
    }
  }

  return (
    <span ref={anchor} className="fullscreen-control">
      <IconButton
        label={active ? "Exit fullscreen preview" : "Fullscreen preview"}
        aria-pressed={active}
        onClick={() => void toggle()}
      >
        {active ? <Shrink size={15} /> : <Expand size={15} />}
      </IconButton>
    </span>
  );
}
