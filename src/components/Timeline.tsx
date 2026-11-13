import { useState, type PointerEvent } from "react";
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
  onDuplicate,
  onDelete,
  onSplit,
}: {
  document: VideoDocument;
  time: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (time: number) => void;
  onChange: (id: string, patch: Partial<VideoLayer>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{
    id: string;
    start: number;
    duration: number;
    trimStart?: number;
  } | null>(null);
  const pixels = 44 * zoom;
  const timelineWidth = Math.max(640, document.duration * pixels + 80);
  const tracks = [...new Set(document.layers.map((layer) => layer.track))].sort(
    (a, b) => b - a,
  );
  const selection = document.layers.find((layer) => layer.id === selected);
  function gesture(
    event: PointerEvent,
    layer: VideoLayer,
    mode: "move" | "left" | "right",
  ) {
    if (layer.locked || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(layer.id);
    const start = event.clientX,
      startY = event.clientY;
    let patch: Partial<VideoLayer> = {};
    const move = (e: globalThis.PointerEvent) => {
      const delta =
        Math.round(((e.clientX - start) / pixels) * document.fps) /
        document.fps;
      if (mode === "move")
        patch = {
          start: Math.max(
            0,
            Math.min(document.duration - layer.duration, layer.start + delta),
          ),
          track: Math.max(
            0,
            Math.min(1000, layer.track - Math.round((e.clientY - startY) / 43)),
          ),
        };
      else if (mode === "right")
        patch = {
          duration: Math.max(
            1 / document.fps,
            Math.min(document.duration - layer.start, layer.duration + delta),
          ),
        };
      else {
        const change = Math.max(
          -(layer.type === "audio" || layer.type === "video"
            ? Math.min(layer.start, layer.trimStart || 0)
            : layer.start),
          Math.min(layer.duration - 1 / document.fps, delta),
        );
        patch = {
          start: layer.start + change,
          duration: layer.duration - change,
          trimStart: (layer.trimStart || 0) + change,
        };
      }
      setDrag({
        id: layer.id,
        start: patch.start ?? layer.start,
        duration: patch.duration ?? layer.duration,
        trimStart: patch.trimStart,
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (Object.keys(patch).length) onChange(layer.id, patch);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  return (
    <section className="timeline-panel" aria-label="Timeline">
      <div className="timeline-toolbar">
        <div className="timeline-tools">
          <IconButton
            label="Split at playhead (S)"
            disabled={
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
            disabled={!selection}
            onClick={onDuplicate}
          >
            <Copy size={15} />
          </IconButton>
          <IconButton
            label="Delete element (Delete)"
            disabled={!selection || selection.locked}
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
              style={{ width: timelineWidth }}
              onPointerDown={(event) => {
                const target = event.currentTarget;
                const seek = (e: globalThis.PointerEvent | PointerEvent) =>
                  onSeek(
                    Math.max(
                      0,
                      Math.min(
                        document.duration - 1 / document.fps,
                        (e.clientX - target.getBoundingClientRect().left) /
                          pixels,
                      ),
                    ),
                  );
                seek(event);
                const move = (e: globalThis.PointerEvent) => seek(e);
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up, { once: true });
              }}
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
          <div className="timeline-tracks">
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
                  <div
                    className="track-lane"
                    style={{ width: timelineWidth }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        onSelect(null);
                        onSeek(
                          Math.min(
                            document.duration,
                            (e.clientX -
                              e.currentTarget.getBoundingClientRect().left) /
                              pixels,
                          ),
                        );
                      }
                    }}
                  >
                    {layers.map((original) => {
                      const layer =
                        drag?.id === original.id
                          ? { ...original, ...drag }
                          : original;
                      const ClipIcon = layerIcons[layer.type];
                      return (
                        <div
                          key={layer.id}
                          className={`timeline-clip ${layer.type} ${selected === layer.id ? "selected" : ""} ${layer.hidden ? "is-hidden" : ""}`}
                          style={{
                            left: layer.start * pixels,
                            width: Math.max(8, layer.duration * pixels),
                          }}
                          onPointerDown={(e) => gesture(e, original, "move")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(layer.id);
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${layer.name}, starts ${layer.start.toFixed(1)} seconds, duration ${layer.duration.toFixed(1)} seconds`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect(layer.id);
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
            <span />
          </div>
        </div>
      </div>
      <footer className="timeline-footer">
        <span>Drag edges to trim · drag clips to move</span>
        <span>
          {document.fps} fps <span className="separator">·</span>{" "}
          {formatTime(document.duration)}
        </span>
      </footer>
    </section>
  );
}
