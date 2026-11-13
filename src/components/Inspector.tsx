import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LockKeyhole,
  SlidersHorizontal,
  UnlockKeyhole,
} from "lucide-react";
import type { VideoDocument, VideoLayer } from "../shared/types";
import { IconButton, Select, Tabs } from "./ui";

function NumberField({
  label,
  value,
  min = -10000,
  max = 10000,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const number = Number(draft);
            if (draft && Number.isFinite(number))
              onChange(Math.max(min, Math.min(max, number)));
            else setDraft(String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onChange(draft);
          }}
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onChange(draft);
          }}
        />
      )}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <div>
        <input
          type="color"
          value={/^#[a-f\d]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{value.toUpperCase()}</span>
      </div>
    </label>
  );
}

export default function Inspector({
  document,
  selected,
  onLayerChange,
  onDocumentChange,
}: {
  document: VideoDocument;
  selected?: VideoLayer;
  onLayerChange: (id: string, patch: Partial<VideoLayer>) => void;
  onDocumentChange: (document: VideoDocument) => void;
}) {
  const [tab, setTab] = useState<"element" | "project">("element");
  const layer = selected;
  const patch = (data: Partial<VideoLayer>) =>
    layer && onLayerChange(layer.id, data);
  const updateFormat = (value: string) => {
    const [width, height] = value.split("x").map(Number);
    const sx = width / document.width,
      sy = height / document.height;
    onDocumentChange({
      ...document,
      width,
      height,
      layers: document.layers.map((item) => ({
        ...item,
        x: Math.round(item.x * sx),
        y: Math.round(item.y * sy),
        width: Math.round(item.width * sx),
        height: Math.round(item.height * sy),
        fontSize: item.fontSize
          ? Math.round(item.fontSize * Math.min(sx, sy))
          : undefined,
      })),
    });
  };
  return (
    <aside className="inspector" aria-label="Properties">
      <Tabs
        tabs={[
          { id: "element", label: "Edit" },
          { id: "project", label: "Video" },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === "project" ? (
          <div className="inspector-scroll">
            <div className="inspector-section">
              <h3>Video settings</h3>
              <label className="field">
                <span>Format</span>
                <Select
                  label="Video format"
                  value={`${document.width}x${document.height}`}
                  onChange={updateFormat}
                  options={[
                    { value: "1080x1920", label: "Portrait · 9:16" },
                    { value: "1920x1080", label: "Landscape · 16:9" },
                    { value: "1080x1080", label: "Square · 1:1" },
                    ...(!["1080x1920", "1920x1080", "1080x1080"].includes(
                      `${document.width}x${document.height}`,
                    )
                      ? [
                          {
                            value: `${document.width}x${document.height}`,
                            label: `${document.width} × ${document.height}`,
                          },
                        ]
                      : []),
                  ]}
                />
              </label>
              <NumberField
                label="Duration"
                value={document.duration}
                min={Math.max(
                  1,
                  ...document.layers.map((item) => item.start + item.duration),
                )}
                max={3600}
                step={0.1}
                suffix="sec"
                onChange={(duration) =>
                  onDocumentChange({ ...document, duration })
                }
              />
              <label className="field">
                <span>Frame rate</span>
                <Select
                  label="Frame rate"
                  value={String(document.fps)}
                  onChange={(fps) =>
                    onDocumentChange({ ...document, fps: Number(fps) })
                  }
                  options={[24, 25, 30, 60].map((fps) => ({
                    value: String(fps),
                    label: `${fps} fps`,
                  }))}
                />
              </label>
              <ColorField
                label="Background"
                value={document.background}
                onChange={(background) =>
                  onDocumentChange({ ...document, background })
                }
              />
            </div>
            <div className="inspector-tip">
              These settings apply to the preview and your exported video.
            </div>
          </div>
        ) : layer ? (
          <div className="inspector-scroll" key={layer.id}>
            <div className="selection-heading">
              <div>
                <span className="eyebrow">{layer.type}</span>
                <strong>{layer.name}</strong>
              </div>
              <IconButton
                label={layer.locked ? "Unlock element" : "Lock element"}
                onClick={() => patch({ locked: !layer.locked })}
              >
                {layer.locked ? (
                  <LockKeyhole size={15} />
                ) : (
                  <UnlockKeyhole size={15} />
                )}
              </IconButton>
              <IconButton
                label={layer.hidden ? "Show element" : "Hide element"}
                onClick={() => patch({ hidden: !layer.hidden })}
              >
                {layer.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </div>
            <fieldset disabled={layer.locked} className="inspector-fieldset">
              <div className="inspector-section">
                <TextField
                  label="Name"
                  value={layer.name}
                  onChange={(name) => patch({ name: name || layer.name })}
                />
                {layer.type === "text" && (
                  <>
                    <TextField
                      label="Text"
                      value={layer.text || ""}
                      onChange={(text) => patch({ text })}
                      multiline
                    />
                    <label className="field">
                      <span>Font</span>
                      <Select
                        label="Font family"
                        value={layer.fontFamily || "Montserrat"}
                        options={["Montserrat", "Space Mono"].map((font) => ({
                          value: font,
                          label: font,
                        }))}
                        onChange={(fontFamily) => patch({ fontFamily })}
                      />
                    </label>
                    <div className="field-grid">
                      <NumberField
                        label="Size"
                        value={layer.fontSize || 64}
                        min={8}
                        max={500}
                        suffix="px"
                        onChange={(fontSize) => patch({ fontSize })}
                      />
                      <label className="field">
                        <span>Weight</span>
                        <Select
                          label="Font weight"
                          value={String(layer.fontWeight || 600)}
                          options={[
                            { value: "400", label: "Regular" },
                            { value: "600", label: "Semibold" },
                            { value: "700", label: "Bold" },
                            { value: "900", label: "Heavy" },
                          ]}
                          onChange={(fontWeight) =>
                            patch({ fontWeight: Number(fontWeight) })
                          }
                        />
                      </label>
                    </div>
                    <ColorField
                      label="Text color"
                      value={layer.color || "#ffffff"}
                      onChange={(color) => patch({ color })}
                    />
                  </>
                )}
                {layer.type === "shape" && (
                  <ColorField
                    label="Fill"
                    value={layer.background || "#4d7dff"}
                    onChange={(background) => patch({ background })}
                  />
                )}
              </div>
              {layer.type !== "audio" && (
                <div className="inspector-section">
                  <h3>Transform</h3>
                  <div className="field-grid">
                    <NumberField
                      label="Position X"
                      value={layer.x}
                      suffix="px"
                      onChange={(x) => patch({ x })}
                    />
                    <NumberField
                      label="Position Y"
                      value={layer.y}
                      suffix="px"
                      onChange={(y) => patch({ y })}
                    />
                    <NumberField
                      label="Width"
                      value={layer.width}
                      min={1}
                      max={10000}
                      suffix="px"
                      onChange={(width) => patch({ width })}
                    />
                    <NumberField
                      label="Height"
                      value={layer.height}
                      min={1}
                      max={10000}
                      suffix="px"
                      onChange={(height) => patch({ height })}
                    />
                    <NumberField
                      label="Rotation"
                      value={layer.rotation}
                      min={-360}
                      max={360}
                      suffix="°"
                      onChange={(rotation) => patch({ rotation })}
                    />
                    <NumberField
                      label="Opacity"
                      value={Math.round(layer.opacity * 100)}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(opacity) => patch({ opacity: opacity / 100 })}
                    />
                  </div>
                  {layer.type === "shape" && (
                    <NumberField
                      label="Corner radius"
                      value={layer.borderRadius || 0}
                      min={0}
                      max={1000}
                      suffix="px"
                      onChange={(borderRadius) => patch({ borderRadius })}
                    />
                  )}
                  <div className="layer-order">
                    <span>Layer order</span>
                    <IconButton
                      label="Move layer back"
                      onClick={() =>
                        patch({ track: Math.max(0, layer.track - 1) })
                      }
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label="Move layer forward"
                      onClick={() => patch({ track: layer.track + 1 })}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                  </div>
                </div>
              )}
              <div className="inspector-section">
                <h3>Timing</h3>
                <div className="field-grid">
                  <NumberField
                    label="Start"
                    value={layer.start}
                    min={0}
                    max={document.duration - layer.duration}
                    step={0.1}
                    suffix="s"
                    onChange={(start) => patch({ start })}
                  />
                  <NumberField
                    label="Duration"
                    value={layer.duration}
                    min={1 / document.fps}
                    max={document.duration - layer.start}
                    step={0.1}
                    suffix="s"
                    onChange={(duration) => patch({ duration })}
                  />
                </div>
                {(layer.type === "audio" || layer.type === "video") && (
                  <NumberField
                    label="Source start"
                    value={layer.trimStart || 0}
                    min={0}
                    step={0.1}
                    suffix="s"
                    onChange={(trimStart) => patch({ trimStart })}
                  />
                )}
                <div className="field-grid">
                  <NumberField
                    label="Fade in"
                    value={layer.fadeIn || 0}
                    min={0}
                    max={layer.duration / 2}
                    step={0.1}
                    suffix="s"
                    onChange={(fadeIn) => patch({ fadeIn })}
                  />
                  <NumberField
                    label="Fade out"
                    value={layer.fadeOut || 0}
                    min={0}
                    max={layer.duration / 2}
                    step={0.1}
                    suffix="s"
                    onChange={(fadeOut) => patch({ fadeOut })}
                  />
                </div>
              </div>
              {(layer.type === "audio" || layer.type === "video") && (
                <div className="inspector-section">
                  <h3>Audio</h3>
                  <NumberField
                    label="Volume"
                    value={Math.round((layer.volume ?? 1) * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(volume) => patch({ volume: volume / 100 })}
                  />
                </div>
              )}
            </fieldset>
          </div>
        ) : (
          <div className="inspector-empty">
            <span className="empty-tool">
              <SlidersHorizontal size={23} />
            </span>
            <h3>A little fine-tuning.</h3>
            <p>Select an element on the canvas or timeline to make it yours.</p>
            <button
              type="button"
              className="text-button"
              onClick={() => setTab("project")}
            >
              Video settings
            </button>
          </div>
        )}
      </Tabs>
    </aside>
  );
}
