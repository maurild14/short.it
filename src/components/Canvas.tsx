import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Maximize2, MousePointer2, Plus, Type } from "lucide-react";
import type { Project, VideoDocument, VideoLayer } from "../shared/types";
import { assetUrl } from "../api";
import { Button, IconButton } from "./ui";
import { selectionFor, useMarquee, usePointerGesture } from "./selection";
import FullscreenButton from "./FullscreenButton";

export function MediaLayer({
  projectId,
  layer,
  time,
  playing,
}: {
  projectId: string;
  layer: VideoLayer;
  time: number;
  playing: boolean;
}) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const active =
    time >= layer.start && time < layer.start + layer.duration && !layer.hidden;
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    const target = Math.max(0, time - layer.start + (layer.trimStart || 0));
    if (active && Math.abs(element.currentTime - target) > 0.18)
      element.currentTime = target;
    const local = time - layer.start;
    const envelope = Math.min(
      layer.fadeIn ? Math.max(0, local / layer.fadeIn) : 1,
      layer.fadeOut ? Math.max(0, (layer.duration - local) / layer.fadeOut) : 1,
      1,
    );
    element.volume = Math.min(1, Math.max(0, (layer.volume ?? 1) * envelope));
    if (active && playing) element.play().catch(() => {});
    else element.pause();
  }, [
    time,
    playing,
    active,
    layer.start,
    layer.trimStart,
    layer.volume,
    layer.fadeIn,
    layer.fadeOut,
    layer.duration,
  ]);
  const src = layer.assetId ? assetUrl(projectId, layer.assetId) : undefined;
  if (layer.type === "image")
    return <img src={src} alt={layer.name} draggable={false} />;
  if (layer.type === "video")
    return <video ref={media} src={src} playsInline preload="auto" />;
  if (layer.type === "audio")
    return <audio ref={media} src={src} preload="auto" />;
  if (layer.type === "text") return <span>{layer.text}</span>;
  return null;
}

export function layerStyle(layer: VideoLayer, time: number): CSSProperties {
  const localTime = time - layer.start;
  const fade = Math.min(
    layer.fadeIn ? Math.max(0, localTime / layer.fadeIn) : 1,
    layer.fadeOut
      ? Math.max(0, (layer.duration - localTime) / layer.fadeOut)
      : 1,
    1,
  );
  return {
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    transform: `rotate(${layer.rotation}deg)`,
    opacity: layer.opacity * fade,
    color: layer.color || "#ffffff",
    background: layer.background || "transparent",
    borderRadius: layer.borderRadius || 0,
    fontSize: layer.fontSize || 64,
    fontFamily: layer.fontFamily || "Montserrat",
    fontWeight: layer.fontWeight || 600,
    zIndex: layer.track,
  };
}

export function MiniPreview({
  project,
  className = "",
}: {
  project: Project;
  className?: string;
}) {
  const first = project.document.layers
    .filter((layer) => layer.type !== "audio" && !layer.hidden)
    .sort((a, b) => a.start - b.start)[0];
  return (
    <div
      className={`mini-preview ${className}`}
      style={{ background: project.document.background }}
    >
      {first ? (
        first.type === "image" || first.type === "video" ? (
          <img
            src={
              first.type === "image" && first.assetId
                ? assetUrl(project.id, first.assetId)
                : undefined
            }
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span style={{ color: first.color }}>{first.text || first.name}</span>
        )
      ) : (
        <span className="mini-empty">
          <MousePointer2 size={22} />
        </span>
      )}
      <div className="preview-badge">
        {project.document.width === project.document.height
          ? "1:1"
          : project.document.width > project.document.height
            ? "16:9"
            : "9:16"}
      </div>
    </div>
  );
}

export default function Canvas({
  project,
  time,
  playing,
  selected,
  onSelect,
  onLayersChange,
  disabled = false,
  onAddText,
}: {
  project: Project;
  time: number;
  playing: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onLayersChange: (patches: Record<string, Partial<VideoLayer>>) => void;
  disabled?: boolean;
  onAddText: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Record<string, Partial<VideoLayer>>>({});
  const pointerGesture = usePointerGesture();
  const { start: marqueeStart, marquee } = useMarquee(
    selected,
    onSelect,
    disabled,
  );
  const document = project.document;
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) =>
      setScale(
        Math.max(
          0.01,
          Math.min(
            (entry.contentRect.width - 70) / document.width,
            (entry.contentRect.height - 48) / document.height,
            1,
          ),
        ),
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [document.width, document.height]);

  function gesture(event: PointerEvent, layer: VideoLayer, resize = false) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = resize
      ? [layer.id]
      : selectionFor(layer.id, selected, additive);
    onSelect(ids);
    if (layer.locked || additive) return;
    const layers = document.layers.filter(
      (item) => ids.includes(item.id) && !item.locked && item.type !== "audio",
    );
    const startX = event.clientX,
      startY = event.clientY;
    const factor = Math.max(0.01, scale * zoom);
    let patches: Record<string, Partial<VideoLayer>> = {};
    pointerGesture(
      (e) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 3) return;
        const dx = (e.clientX - startX) / factor,
          dy = (e.clientY - startY) / factor;
        patches = Object.fromEntries(
          layers.map((item) => [
            item.id,
            resize
              ? {
                  width: Math.max(24, Math.round(item.width + dx)),
                  height: Math.max(24, Math.round(item.height + dy)),
                }
              : { x: Math.round(item.x + dx), y: Math.round(item.y + dy) },
          ]),
        );
        setDrag(patches);
      },
      (cancelled) => {
        setDrag({});
        if (!cancelled && Object.keys(patches).length) onLayersChange(patches);
        else if (!cancelled) onSelect([layer.id]);
      },
    );
  }

  const visible = document.layers.filter(
    (layer) =>
      layer.type !== "audio" &&
      !layer.hidden &&
      time >= layer.start &&
      time < layer.start + layer.duration,
  );
  return (
    <section className="preview-panel" aria-label="Video preview">
      <header className="panel-heading">
        <span>Preview</span>
        <span className="muted">
          {document.width} × {document.height}
        </span>
      </header>
      <div
        className="canvas-viewport"
        ref={viewport}
        onPointerDown={marqueeStart}
      >
        <div
          className="canvas-size"
          style={{
            width: document.width * scale * zoom,
            height: document.height * scale * zoom,
          }}
        >
          <div
            className="canvas-stage"
            style={{
              width: document.width,
              height: document.height,
              transform: `scale(${scale * zoom})`,
              background: document.background,
            }}
          >
            {visible.map((original) => {
              const layer = { ...original, ...drag[original.id] };
              return (
                <div
                  key={layer.id}
                  data-selection-id={layer.id}
                  className={`canvas-layer ${layer.type} ${selected.includes(layer.id) ? "selected" : ""} ${layer.locked ? "locked" : ""}`}
                  style={layerStyle(layer, time)}
                  onPointerDown={(e) => gesture(e, layer)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="layer-content">
                    <MediaLayer
                      projectId={project.id}
                      layer={layer}
                      time={time}
                      playing={playing}
                    />
                  </div>
                  {selected.includes(layer.id) && !layer.locked && (
                    <>
                      <span
                        className="selection-label"
                        style={{
                          fontSize: 11 / (scale * zoom),
                          transform: `translateY(-${7 / (scale * zoom)}px)`,
                        }}
                      >
                        {layer.name}
                      </span>
                      {selected.length === 1 && (
                        <button
                          type="button"
                          className="resize-handle"
                          aria-label={`Resize ${layer.name}`}
                          style={{
                            width: 9 / (scale * zoom),
                            height: 9 / (scale * zoom),
                            right: -4 / (scale * zoom),
                            bottom: -4 / (scale * zoom),
                          }}
                          onPointerDown={(e) => gesture(e, layer, true)}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {!document.layers.length && (
              <div className="canvas-placeholder">
                <span>
                  your next
                  <br />
                  great video.
                </span>
                <div className="canvas-placeholder-line" />
                <small>Start with an idea.</small>
              </div>
            )}
          </div>
        </div>
        {!document.layers.length && (
          <div className="canvas-empty-action">
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onAddText();
              }}
            >
              <Plus size={14} /> Add your first text
            </Button>
          </div>
        )}
      </div>
      {marquee}
      {document.layers
        .filter((layer) => layer.type === "audio")
        .map((layer) => (
          <MediaLayer
            key={layer.id}
            projectId={project.id}
            layer={layer}
            time={time}
            playing={playing}
          />
        ))}
      <footer className="preview-footer">
        <span>
          <MousePointer2 size={13} />{" "}
          {selected.length > 1
            ? `${selected.length} selected · drag to move together`
            : selected.length
              ? "Drag to move · corner to resize"
              : "Drag empty space to select elements"}
        </span>
        <div>
          <label className="sr-only" htmlFor="preview-zoom">
            Preview zoom
          </label>
          <select
            id="preview-zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={1}>Fit</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
          <FullscreenButton />
          <IconButton label="Fit canvas" onClick={() => setZoom(1)}>
            <Maximize2 size={14} />
          </IconButton>
        </div>
      </footer>
    </section>
  );
}
