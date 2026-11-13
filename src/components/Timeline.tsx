import { useRef, useState, type PointerEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Image,
  LockKeyhole,
  Minus,
  Music2,
  Plus,
  Scissors,
  Trash2,
  Type,
  Video,
  Volume2,
  VolumeX,
  UnlockKeyhole,
} from "lucide-react";
import type { VideoDocument, VideoLayer } from "../shared/types";
import { IconButton } from "./ui";
import { selectionFor, useMarquee, usePointerGesture } from "./selection";

export const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.floor((seconds % 1) * 100)).padStart(2, "0")}`;

const layerIcons = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music2,
  shape: Plus,
};

export default function Timeline({
  document,
  time,
  selected,
  onSelect,
  onSeek,
  onChange,
  onLayersChange,
  disabled = false,
  onDuplicate,
  onDelete,
  onSplit,
}: {
  document: VideoDocument;
  time: number;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onLayersChange: (patches: Record<string, Partial<VideoLayer>>) => void;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onChange: (id: string, patch: Partial<VideoLayer>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const ruler = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<Record<string, Partial<VideoLayer>>>({});
  const pointerGesture = usePointerGesture();
  const { start: marqueeStart, marquee } = useMarquee(
    selected,
    onSelect,
    disabled,
  );
  const pixels = 44 * zoom;
  function seekAt(clientX: number) {
    if (disabled || !ruler.current) return;
    onSeek(
      Math.max(
        0,
        Math.min(
          document.duration - 1 / document.fps,
          (clientX - ruler.current.getBoundingClientRect().left) / pixels,
        ),
      ),
    );
  }
  function scrub(event: PointerEvent<HTMLElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAt(event.clientX);
    pointerGesture(
      (e) => seekAt(e.clientX),
      () => {},
    );
  }
  const timelineWidth = Math.max(640, document.duration * pixels + 80);
  const tracks = [...new Set(document.layers.map((layer) => layer.track))].sort(
    (a, b) => b - a,
  );
  const selection =
    selected.length === 1
      ? document.layers.find((layer) => layer.id === selected[0])
      : undefined;
  const editableSelection = document.layers.some(
    (layer) => selected.includes(layer.id) && !layer.locked,
  );
  function gesture(
    event: PointerEvent,
    layer: VideoLayer,
    mode: "move" | "left" | "right",
  ) {
    if (disabled || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids =
      mode !== "move" ? [layer.id] : selectionFor(layer.id, selected, additive);
    onSelect(ids);
    if (layer.locked || additive) return;
    const layers = document.layers.filter(
      (item) => ids.includes(item.id) && !item.locked,
    );
    const start = event.clientX,
      startY = event.clientY;
    let patches: Record<string, Partial<VideoLayer>> = {};
    pointerGesture(
      (e) => {
        if (Math.hypot(e.clientX - start, e.clientY - startY) < 3) return;
        const delta =
          Math.round(((e.clientX - start) / pixels) * document.fps) /
          document.fps;
        if (mode === "move") {
          const shift = Math.max(
            -Math.min(...layers.map((item) => item.start)),
            Math.min(
              Math.min(
                ...layers.map(
                  (item) => document.duration - item.start - item.duration,
                ),
              ),
              delta,
            ),
          );
          const vertical = Math.max(
            -Math.min(...layers.map((item) => item.track)),
            Math.min(
              1000 - Math.max(...layers.map((item) => item.track)),
              -Math.round((e.clientY - startY) / 43),
            ),
          );
          patches = Object.fromEntries(
            layers.map((item) => [
              item.id,
              { start: item.start + shift, track: item.track + vertical },
            ]),
          );
        } else if (mode === "right") {
          patches = {
            [layer.id]: {
              duration: Math.max(
                1 / document.fps,
                Math.min(
                  document.duration - layer.start,
                  layer.duration + delta,
                ),
              ),
            },
          };
        } else {
          const change = Math.max(
            -(layer.type === "audio" || layer.type === "video"
              ? Math.min(layer.start, layer.trimStart || 0)
              : layer.start),
            Math.min(layer.duration - 1 / document.fps, delta),
          );
          patches = {
            [layer.id]: {
              start: layer.start + change,
              duration: layer.duration - change,
              trimStart: (layer.trimStart || 0) + change,
            },
          };
        }
        setDrag(patches);
      },
      (cancelled) => {
        setDrag({});
        if (!cancelled && Object.keys(patches).length) onLayersChange(patches);
        else if (!cancelled) onSelect([layer.id]);
      },
    );
  }

  return (
    <section className="timeline-panel" aria-label="Timeline">
      <div className="timeline-toolbar">
        <div className="timeline-tools">
          <IconButton
            label="Split at playhead (S)"
            disabled={
              disabled ||
              !selection ||
              time <= selection.start ||
              time >= selection.start + selection.duration ||
              selection.locked
            }
            onClick={onSplit}
          >
            <Scissors size={16} />
          </IconButton>
          <IconButton
            label="Duplicate element"
            disabled={disabled || !editableSelection}
            onClick={onDuplicate}
          >
            <Copy size={15} />
          </IconButton>
          <IconButton
            label="Delete element (Delete)"
            disabled={disabled || !editableSelection}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </IconButton>
          <span className="toolbar-divider" />
          <span className="muted">
            {document.layers.length}{" "}
            {document.layers.length === 1 ? "element" : "elements"}
          </span>
        </div>
        <div className="timeline-tools">
          <IconButton
            label="Zoom out timeline"
            onClick={() => setZoom((v) => Math.max(0.4, v - 0.2))}
          >
            <Minus size={14} />
          </IconButton>
          <label className="sr-only" htmlFor="timeline-zoom">
            Timeline zoom
          </label>
          <input
            id="timeline-zoom"
            type="range"
            min="0.4"
            max="3"
            step="0.2"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <IconButton
            label="Zoom in timeline"
            onClick={() => setZoom((v) => Math.min(3, v + 0.2))}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="timeline-scroll">
        <div
          className="timeline-inner"
          style={{ minWidth: timelineWidth + 148 }}
        >
          <div className="timeline-ruler">
            <div className="track-label ruler-label">Layers</div>
            <div
              className="ruler"
              ref={ruler}
              style={{ width: timelineWidth }}
              onPointerDown={scrub}
            >
              {Array.from(
                {
                  length:
                    Math.ceil(document.duration / (zoom < 0.7 ? 5 : 2)) + 1,
                },
                (_, i) => {
                  const second = i * (zoom < 0.7 ? 5 : 2);
                  return (
                    <span key={i} style={{ left: second * pixels }}>
                      {String(Math.floor(second / 60)).padStart(2, "0")}:
                      {String(second % 60).padStart(2, "0")}
                    </span>
                  );
                },
              )}
            </div>
          </div>
          <div
            className="timeline-tracks"
            onPointerDown={marqueeStart}
            onPointerDownCapture={(event) => {
              press.current =
                event.button === 0
                  ? { x: event.clientX, y: event.clientY, moved: false }
                  : null;
            }}
            onPointerMoveCapture={(event) => {
              if (
                press.current &&
                Math.hypot(
                  event.clientX - press.current.x,
                  event.clientY - press.current.y,
                ) > 3
              )
                press.current.moved = true;
            }}
            onPointerCancel={() => {
              press.current = null;
            }}
            onPointerUpCapture={(event) => {
              const start = press.current;
              press.current = null;
              if (
                !start ||
                start.moved ||
                Math.hypot(event.clientX - start.x, event.clientY - start.y) >
                  3 ||
                (event.target as HTMLElement).closest(
                  "button,.track-label,.trim-handle",
                ) ||
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey
              )
                return;
              seekAt(event.clientX);
            }}
          >
            {!tracks.length && (
              <div className="timeline-empty">
                <div className="track-label">Your timeline</div>
                <span>
                  Media and text appear here. Add an element or ask the
                  assistant to start.
                </span>
              </div>
            )}
            {tracks.map((track) => {
              const layers = document.layers.filter(
                (layer) => layer.track === track,
              );
              const first = layers[0];
              const Icon = layerIcons[first.type];
              return (
                <div className="timeline-row" key={track}>
                  <div className="track-label">
                    <Icon size={14} />
                    <span>
                      {first.type === "audio"
                        ? "Audio"
                        : `Layer ${tracks.indexOf(track) + 1}`}
                    </span>
                    <IconButton
                      label={`${first.hidden ? "Show" : "Hide"} layer ${track}`}
                      onClick={() =>
                        layers.forEach((layer) =>
                          onChange(layer.id, { hidden: !first.hidden }),
                        )
                      }
                    >
                      {first.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </IconButton>
                  </div>
                  <div className="track-lane" style={{ width: timelineWidth }}>
                    {layers.map((original) => {
                      const layer = { ...original, ...drag[original.id] };
                      const ClipIcon = layerIcons[layer.type];
                      return (
                        <div
                          key={layer.id}
                          data-selection-id={layer.id}
                          aria-pressed={selected.includes(layer.id)}
                          className={`timeline-clip ${layer.type} ${selected.includes(layer.id) ? "selected" : ""} ${layer.hidden ? "is-hidden" : ""}`}
                          style={{
                            left: layer.start * pixels,
                            width: Math.max(8, layer.duration * pixels),
                          }}
                          onPointerDown={(e) => gesture(e, original, "move")}
                          onClick={(e) => e.stopPropagation()}
                          role="button"
                          tabIndex={0}
                          aria-label={`${layer.name}, starts ${layer.start.toFixed(1)} seconds, duration ${layer.duration.toFixed(1)} seconds`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelect(
                                e.shiftKey || e.ctrlKey || e.metaKey
                                  ? selectionFor(layer.id, selected, true)
                                  : [layer.id],
                              );
                              onSeek(layer.start);
                            }
                          }}
                        >
                          <span
                            className="trim-handle left"
                            aria-hidden="true"
                            onPointerDown={(e) => gesture(e, original, "left")}
                          />
                          <ClipIcon size={13} />
                          <span>{layer.name}</span>
                          {layer.locked && <LockKeyhole size={11} />}
                          <span
                            className="trim-handle right"
                            aria-hidden="true"
                            onPointerDown={(e) => gesture(e, original, "right")}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="playhead" style={{ left: 148 + time * pixels }}>
            <button
              type="button"
              className="playhead-handle"
              aria-label="Playback position"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={document.duration - 1 / document.fps}
              aria-valuenow={time}
              aria-valuetext={formatTime(time)}
              disabled={disabled}
              onPointerDown={scrub}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? document.duration - 1 / document.fps
                      : time +
                        ((event.key === "ArrowLeft" ? -1 : 1) *
                          (event.shiftKey ? 10 : 1)) /
                          document.fps;
                onSeek(
                  Math.max(
                    0,
                    Math.min(document.duration - 1 / document.fps, next),
                  ),
                );
              }}
            />
          </div>
        </div>
      </div>
      {marquee}
      <footer className="timeline-footer">
        <span>
          Drag empty space to select · Shift-click to add · drag clips to move
        </span>
        <span>
          {document.fps} fps <span className="separator">·</span>{" "}
          {formatTime(document.duration)}
        </span>
      </footer>
    </section>
  );
}
