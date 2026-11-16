import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  ExternalLink,
  FileAudio,
  Film,
  Folder,
  FolderOpen,
  Home,
  Image,
  LayoutGrid,
  Link,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings2,
  Shapes,
  SkipBack,
  Sparkles,
  Type,
  Trash2,
  Undo2,
  Upload,
  Video,
  X,
} from "lucide-react";
import type {
  Asset,
  Job,
  Project,
  ProjectFolder,
  Reference,
  VideoDocument,
  VideoLayer,
} from "./shared/types";
import { api, assetUrl, type EngineStatus } from "./api";
import { MAX_LAYERS } from "./shared/types";
import { useProject } from "./useProject";
import { useEditorLayout } from "./components/EditorLayout";
import Canvas, { MiniPreview } from "./components/Canvas";
import Timeline, { formatTime } from "./components/Timeline";
import Inspector from "./components/Inspector";
import Chat from "./components/Chat";
import {
  LibraryDialog,
  ProjectActions,
  type LibraryAction,
} from "./components/ProjectLibrary";
import {
  Button,
  Dialog,
  Dropzone,
  IconButton,
  Select,
  Status,
  Tabs,
} from "./components/ui";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(date),
  );
const statusLabels: Record<Reference["status"], string> = {
  queued: "Waiting",
  downloading: "Downloading video",
  extracting: "Reading frames",
  transcribing: "Transcribing audio",
  ready: "Ready to use",
  error: "Needs attention",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo ${compact ? "compact" : ""}`}>
      <span className="logo-symbol" aria-hidden="true">
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          short<span className="logo-dot">.</span>it
        </span>
      )}
    </span>
  );
}

function NewProject({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, urls: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [urls, setUrls] = useState([""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title="A new beginning."
      description="Give your video a name. The rest starts with an idea."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onCreate(
              name.trim() || "Untitled video",
              urls.filter((url) => url.trim()),
            );
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Project name</span>
          <input
            autoFocus
            value={name}
            maxLength={100}
            placeholder="Something worth watching"
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="new-reference-label">
          <span>
            Reference videos <span className="muted">optional</span>
          </span>
          <small>{urls.filter(Boolean).length} / 5</small>
        </div>
        <div className="reference-inputs">
          {urls.map((url, index) => (
            <div className="reference-input" key={index}>
              <Link size={15} />
              <label className="sr-only" htmlFor={`new-ref-${index}`}>
                Reference video {index + 1}
              </label>
              <input
                id={`new-ref-${index}`}
                type="url"
                placeholder="Paste a TikTok, Reel, or YouTube link"
                value={url}
                onChange={(e) =>
                  setUrls((items) =>
                    items.map((item, i) =>
                      i === index ? e.target.value : item,
                    ),
                  )
                }
                disabled={busy}
              />
              {urls.length > 1 && (
                <IconButton
                  label={`Remove reference ${index + 1}`}
                  onClick={() =>
                    setUrls((items) => items.filter((_, i) => i !== index))
                  }
                  disabled={busy}
                >
                  <X size={14} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        {urls.length < 5 && (
          <button
            type="button"
            className="text-button add-reference"
            disabled={busy}
            onClick={() => setUrls((items) => [...items, ""])}
          >
            <Plus size={13} /> Add another reference
          </button>
        )}
        <p className="field-hint">
          We’ll study the pacing, visuals, and audio. You can add these later,
          too.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Creating project…" : "Create project"}
            <ArrowRight size={15} />
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function Connections({
  engines,
  onRefresh,
  onClose,
}: {
  engines: EngineStatus[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Your assistants"
      description="Use the tools you’re already signed in to on this computer."
      onClose={onClose}
    >
      <div className="engine-list">
        {engines.map((engine) => (
          <div className="engine-card" key={engine.id}>
            <div className="engine-icon">
              {engine.id === "codex" ? (
                <Shapes size={22} />
              ) : (
                <Sparkles size={22} />
              )}
            </div>
            <div>
              <h3>{engine.label}</h3>
              <span className={engine.available ? "connection-ready" : "muted"}>
                {engine.available ? (
                  <>
                    <Check size={12} /> Connected
                  </>
                ) : (
                  "Not connected"
                )}
              </span>
              {engine.reason && <p>{engine.reason}</p>}
              <small>
                {engine.capabilities.webSearch
                  ? "Web search available"
                  : "Web search depends on your setup"}{" "}
                · Image tools depend on your assistant setup
              </small>
            </div>
          </div>
        ))}
      </div>
      {!engines.length && (
        <p className="muted">
          Couldn’t check your assistants. Make sure the local server is running.
        </p>
      )}
      <div className="connection-help">
        <h3>Connect an assistant</h3>
        <p>
          Install the Codex CLI or Claude Code, open a terminal, and sign in.
          Then refresh here. No API key is needed in short.it.
        </p>
        <div className="external-links">
          <a
            href="https://developers.openai.com/codex/cli"
            target="_blank"
            rel="noreferrer"
          >
            Set up Codex <ExternalLink size={12} />
          </a>
          <a
            href="https://code.claude.com/docs/en/quickstart"
            target="_blank"
            rel="noreferrer"
          >
            Set up Claude <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <footer className="dialog-actions">
        <Button onClick={onRefresh}>
          <RefreshCw size={14} />
          Check again
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Dialog>
  );
}

function ReferencePanel({
  project,
  onAdd,
  onRetry,
}: {
  project: Project;
  onAdd: (url: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Reference | null>(null);
  return (
    <div className="library-panel">
      <div className="library-intro">
        <h2>A little inspiration.</h2>
        <p>
          Add up to five videos. Your assistant can study how they look, sound,
          and move.
        </p>
      </div>
      {project.references.length < 5 && (
        <form
          className="reference-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!url.trim()) return;
            setBusy(true);
            setError("");
            try {
              await onAdd(url.trim());
              setUrl("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Video link</span>
            <input
              type="url"
              required
              placeholder="Paste a reference link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </label>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add reference"}
            <Plus size={14} />
          </Button>
        </form>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="section-label">
        References <span>{project.references.length} / 5</span>
      </div>
      <div className="reference-list">
        {project.references.map((reference, index) => (
          <article className="reference-card" key={reference.id}>
            <div className="reference-card-top">
              <span className="reference-index">0{index + 1}</span>
              <div>
                <strong>{reference.platform || "Reference video"}</strong>
                <a href={reference.url} target="_blank" rel="noreferrer">
                  {new URL(reference.url).hostname.replace("www.", "")}
                  <ExternalLink size={11} />
                </a>
              </div>
              <span className={`reference-state ${reference.status}`}>
                <span className="status-dot" />
              </span>
            </div>
            <div className="reference-status">
              <span>{statusLabels[reference.status]}</span>
              {reference.duration && (
                <small>{Math.round(reference.duration)}s</small>
              )}
            </div>
            {reference.status === "ready" && (
              <div className="reference-meta">
                {reference.frameCount ?? 0} frames ·{" "}
                {reference.transcriptStatus === "available"
                  ? "Transcript ready"
                  : "No transcript"}
              </div>
            )}
            {reference.error && (
              <p className="reference-error">{reference.error}</p>
            )}
            {reference.status === "error" ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  void onRetry(reference.id).catch((e) => setError(e.message));
                }}
              >
                <RefreshCw size={12} />
                Try again
              </button>
            ) : (
              reference.status === "ready" && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setDetail(reference)}
                >
                  View details
                  <ChevronRight size={12} />
                </button>
              )
            )}
          </article>
        ))}
      </div>
      {!project.references.length && (
        <div className="library-empty">
          <Link size={23} />
          <p>Save a look you love.</p>
          <span>Paste your first video link above.</span>
        </div>
      )}
      {detail && (
        <Dialog
          title="Reference details"
          description={detail.url}
          onClose={() => setDetail(null)}
        >
          <div className="reference-detail">
            <p>
              {detail.frameCount ?? 0} extracted frames · {detail.fps || 30}{" "}
              frames per second
            </p>
            <h3>Transcript</h3>
            <p className="transcript">
              {detail.transcript ||
                "No speech transcript is available for this reference."}
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function App() {
  const editor = useProject();
  const panels = useEditorLayout();
  const project = editor.project;
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(() =>
    new URLSearchParams(location.hash.slice(1)).get("folder"),
  );
  const [libraryAction, setLibraryAction] = useState<LibraryAction | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [engines, setEngines] = useState<EngineStatus[]>([]);
  const [view, setView] = useState<"dashboard" | "editor">("dashboard");
  const currentView = useRef(view);
  const [newProject, setNewProject] = useState(false);
  const [connections, setConnections] = useState(false);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<"chat" | "media" | "references">("chat");
  const [mobileEditor, setMobileEditor] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [exportJob, setExportJob] = useState<Job | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState("recent");
  const [notice, setNotice] = useState("");
  const selectedLayer = project?.document.layers.find(
    (layer) => selected.length === 1 && layer.id === selected[0],
  );
  useEffect(() => {
    setSelected((ids) => {
      const retained = ids.filter((id) =>
        project?.document.layers.some((layer) => layer.id === id),
      );
      return retained.length === ids.length ? ids : retained;
    });
  }, [project?.document.layers]);
  const loadEngines = useCallback(() => {
    void api<EngineStatus[]>("/engines")
      .then(setEngines)
      .catch((e) => editor.setError(e.message));
  }, []);
  const loadProjects = useCallback(async () => {
    const [projects, folders] = await Promise.all([
      api<Project[]>("/projects"),
      api<ProjectFolder[]>("/folders"),
    ]);
    setProjects(projects);
    setFolders(folders);
  }, []);

  useEffect(() => {
    loadEngines();
    void loadProjects()
      .catch((e) => editor.setError(e.message))
      .finally(() => setLoading(false));
    let navigation = 0;
    const navigate = async () => {
      const hash = location.hash;
      if (hash && !hash.startsWith("#project=") && !hash.startsWith("#folder="))
        return;
      const params = new URLSearchParams(hash.slice(1));
      const id = params.get("project");
      if (!id) setActiveFolder(params.get("folder"));
      if (
        (id &&
          currentView.current === "editor" &&
          editor.current.current?.id === id) ||
        (!id && currentView.current === "dashboard")
      )
        return;
      const request = ++navigation;
      try {
        await editor.persist();
        if (request !== navigation || location.hash !== hash) return;
        if (id) {
          const next = await api<Project>(
            `/projects/${encodeURIComponent(id)}`,
          );
          if (request !== navigation || location.hash !== hash) return;
          openProject(next);
        } else {
          currentView.current = "dashboard";
          setView("dashboard");
          setPlaying(false);
          await loadProjects();
        }
      } catch (error) {
        if (request !== navigation) return;
        editor.setError((error as Error).message);
        const projectHash =
          currentView.current === "editor" && editor.current.current
            ? `#project=${editor.current.current.id}`
            : "";
        history.replaceState(
          null,
          "",
          `${location.pathname}${location.search}${projectHash}`,
        );
      }
    };
    const onHashChange = () => {
      void navigate();
    };
    window.addEventListener("hashchange", onHashChange);
    void navigate();
    return () => {
      navigation++;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
  useEffect(() => {
    if (!playing || !project) return;
    let frame: number;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - previous) / 1000;
      previous = now;
      setTime((current) => {
        const next = current + elapsed;
        if (next >= project.document.duration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, project?.document.duration]);
  useEffect(() => {
    if (
      busy ||
      !project?.references.some(
        (ref) => !["ready", "error"].includes(ref.status),
      )
    )
      return;
    const id = project.id;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void api<Project>(`/projects/${id}`, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted && editor.current.current?.id === id)
            editor.syncMetadata(next);
        })
        .catch(() => {});
    }, 1800);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [project?.id, project?.references.map((ref) => ref.status).join(), busy]);
  useEffect(() => {
    if (!exportJob || !["queued", "running"].includes(exportJob.status)) return;
    const timer = window.setInterval(() => {
      void api<Job>(`/jobs/${exportJob.id}`)
        .then(setExportJob)
        .catch((e) => editor.setError(e.message));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [exportJob?.id, exportJob?.status]);

  const changeLayer = useCallback(
    (id: string, patch: Partial<VideoLayer>) => {
      const current = editor.current.current;
      if (current)
        editor.change({
          ...current.document,
          layers: current.document.layers.map((layer) =>
            layer.id === id ? { ...layer, ...patch } : layer,
          ),
        });
    },
    [editor.change],
  );
  const changeLayers = useCallback(
    (patches: Record<string, Partial<VideoLayer>>) => {
      const current = editor.current.current;
      if (!current || busy) return;
      editor.change({
        ...current.document,
        layers: current.document.layers.map((layer) =>
          patches[layer.id] && !layer.locked
            ? { ...layer, ...patches[layer.id] }
            : layer,
        ),
      });
    },
    [editor.change, busy],
  );
  const removeLayer = useCallback(() => {
    const current = editor.current.current;
    if (!current || busy || !selected.length) return;
    editor.change({
      ...current.document,
      layers: current.document.layers.filter(
        (layer) => !selected.includes(layer.id) || layer.locked,
      ),
    });
    setSelected(
      selected.filter(
        (id) =>
          current.document.layers.find((layer) => layer.id === id)?.locked,
      ),
    );
  }, [selected, editor.change, busy]);
  const duplicateLayer = useCallback(() => {
    const current = editor.current.current;
    if (!current || busy) return;
    const layers = current.document.layers.filter(
      (layer) => selected.includes(layer.id) && !layer.locked,
    );
    if (!layers.length) return;
    if (current.document.layers.length + layers.length > MAX_LAYERS) {
      editor.setError(
        `A video can contain up to ${MAX_LAYERS.toLocaleString()} elements.`,
      );
      return;
    }
    const offset =
      Math.max(...current.document.layers.map((layer) => layer.track)) +
      1 -
      Math.min(...layers.map((layer) => layer.track));
    if (layers.some((layer) => layer.track + offset > 1000)) return;
    const copies = layers.map((layer) => ({
      ...layer,
      id: crypto.randomUUID(),
      name: `${layer.name} copy`,
      track: layer.track + offset,
      x: layer.x + 24,
      y: layer.y + 24,
    }));
    editor.change({
      ...current.document,
      layers: [...current.document.layers, ...copies],
    });
    setSelected(copies.map((copy) => copy.id));
  }, [selected, editor.change, busy]);
  const splitLayer = useCallback(() => {
    const current = editor.current.current;
    if (current && current.document.layers.length >= MAX_LAYERS) {
      editor.setError(
        `A video can contain up to ${MAX_LAYERS.toLocaleString()} elements.`,
      );
      return;
    }
    const layer = current?.document.layers.find(
      (layer) => selected.length === 1 && layer.id === selected[0],
    );
    if (
      !current ||
      !layer ||
      layer.locked ||
      time <= layer.start ||
      time >= layer.start + layer.duration
    )
      return;
    const at = Math.round(time * current.document.fps) / current.document.fps;
    if (at <= layer.start || at >= layer.start + layer.duration) return;
    const second = {
      ...layer,
      id: crypto.randomUUID(),
      name: `${layer.name} (2)`,
      start: at,
      duration: layer.start + layer.duration - at,
      trimStart: (layer.trimStart || 0) + at - layer.start,
    };
    editor.change({
      ...current.document,
      layers: [
        ...current.document.layers.map((item) =>
          item.id === layer.id ? { ...item, duration: at - layer.start } : item,
        ),
        second,
      ],
    });
    setSelected([second.id]);
  }, [selected, time, editor.change]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        view !== "editor" ||
        busy ||
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable],dialog",
        )
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? editor.redo() : editor.undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        editor.redo();
      } else if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void editor.persist().catch(() => {});
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateLayer();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeLayer();
      } else if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key.toLowerCase() === "s") splitLayer();
      else if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(
          editor.current.current?.document.layers.map((layer) => layer.id) ||
            [],
        );
      } else if (event.key === "Escape") setSelected([]);
      else if (
        selected.length &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const delta = event.shiftKey ? 10 : 1;
        const dx =
          event.key === "ArrowRight"
            ? delta
            : event.key === "ArrowLeft"
              ? -delta
              : 0;
        const dy =
          event.key === "ArrowDown"
            ? delta
            : event.key === "ArrowUp"
              ? -delta
              : 0;
        changeLayers(
          Object.fromEntries(
            (editor.current.current?.document.layers || [])
              .filter((layer) => selected.includes(layer.id) && !layer.locked)
              .map((layer) => [layer.id, { x: layer.x + dx, y: layer.y + dy }]),
          ),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    view,
    busy,
    selected,
    changeLayers,
    editor.undo,
    editor.redo,
    duplicateLayer,
    splitLayer,
    removeLayer,
  ]);

  function openProject(next: Project) {
    editor.open(next);
    currentView.current = "editor";
    setView("editor");
    setSelected([]);
    setTime(0);
    setPlaying(false);
    setTab("chat");
    panels.openChat();
    location.hash = `project=${next.id}`;
  }
  async function goHome() {
    try {
      await editor.persist();
      setPlaying(false);
      currentView.current = "dashboard";
      setView("dashboard");
      location.hash = "";
      await loadProjects();
    } catch {}
  }
  async function createProject(name: string, urls: string[]) {
    let next = await api<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, folderId: folder?.id ?? null }),
    });
    setNewProject(false);
    openProject(next);
    for (const url of urls) {
      try {
        const result = await api<{ project: Project }>(
          `/projects/${next.id}/references`,
          { method: "POST", body: JSON.stringify({ url }) },
        );
        next = result.project;
        editor.syncMetadata(next);
      } catch (e) {
        editor.setError((e as Error).message);
      }
    }
  }
  async function upload(files: File[]): Promise<Asset[]> {
    if (!project || !files.length) return [];
    await editor.persist();
    const previous = new Set(project.assets.map((asset) => asset.id));
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    setUploading(true);
    try {
      const next = await api<Project>(`/projects/${project.id}/assets`, {
        method: "POST",
        body,
      });
      editor.syncMetadata(next);
      return next.assets.filter((asset) => !previous.has(asset.id));
    } finally {
      setUploading(false);
    }
  }
  function addElement(type: "text" | "shape", asset?: Asset) {
    if (!project) return;
    const doc = editor.current.current!.document;
    if (doc.layers.length >= MAX_LAYERS) {
      editor.setError(
        `A video can contain up to ${MAX_LAYERS.toLocaleString()} elements.`,
      );
      return;
    }
    const start = Math.min(time, doc.duration - 1 / doc.fps);
    const duration =
      asset?.type !== "image" && asset?.duration
        ? Math.min(asset.duration, 3600 - start)
        : Math.min(5, doc.duration - start);
    const layer: VideoLayer = {
      id: crypto.randomUUID(),
      name: asset?.name || (type === "text" ? "Your text" : "Rectangle"),
      type: asset?.type || type,
      start,
      duration,
      track: doc.layers.length
        ? Math.max(...doc.layers.map((layer) => layer.track)) + 1
        : 1,
      x: asset ? 0 : Math.round(doc.width * 0.12),
      y: asset ? 0 : Math.round(doc.height * 0.4),
      width: asset ? doc.width : Math.round(doc.width * 0.76),
      height: asset
        ? doc.height
        : type === "text"
          ? Math.round(doc.height * 0.2)
          : Math.round(doc.width * 0.5),
      rotation: 0,
      opacity: 1,
      ...(asset
        ? { assetId: asset.id, volume: 1, trimStart: 0 }
        : type === "text"
          ? {
              text: "Make it yours.",
              fontSize: Math.round(doc.width * 0.09),
              fontFamily: "Montserrat",
              fontWeight: 600,
              color: "#ffffff",
            }
          : { background: "#4d7dff", borderRadius: 24 }),
    };
    editor.change({
      ...doc,
      duration: Math.max(doc.duration, start + duration),
      layers: [...doc.layers, layer],
    });
    setSelected([layer.id]);
  }
  async function addReference(url: string) {
    if (!project) return;
    await editor.persist();
    const result = await api<{ project: Project }>(
      `/projects/${project.id}/references`,
      { method: "POST", body: JSON.stringify({ url }) },
    );
    editor.syncMetadata(result.project);
  }
  async function exportVideo() {
    if (!project) return;
    setExporting(true);
    try {
      await editor.persist();
      setExportJob(
        await api<Job>(`/projects/${project.id}/export`, { method: "POST" }),
      );
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const folder = folders.find((item) => item.id === activeFolder);
  const folderProjects = folder
    ? projects.filter((item) => item.folderId === folder.id)
    : projects;
  const filtered = folderProjects
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div className={`app ${view}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {view === "dashboard" ? (
        <>
          <aside className="dashboard-sidebar">
            <a
              className="brand-link"
              aria-label="short.it home"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void goHome();
              }}
            >
              <Logo />
            </a>
            <div className="workspace-label">Your workspace</div>
            <nav aria-label="Main navigation">
              <button
                type="button"
                title="Projects"
                className={`sidebar-item ${!folder ? "active" : ""}`}
                aria-current={!folder ? "page" : undefined}
                onClick={() => {
                  setActiveFolder(null);
                  location.hash = "";
                }}
              >
                <LayoutGrid size={17} />
                <span>Projects</span>
                <span className="sidebar-count">{projects.length}</span>
              </button>
              <button
                type="button"
                className="sidebar-item"
                aria-label="Assistants"
                onClick={() => setConnections(true)}
              >
                <Sparkles size={17} />
                <span>Assistants</span>
              </button>
            </nav>
            <nav className="folder-navigation" aria-label="Folders">
              <div className="folder-heading">
                <span>Folders</span>
                <IconButton
                  label="New folder"
                  onClick={() => setLibraryAction({ type: "createFolder" })}
                >
                  <Plus size={15} />
                </IconButton>
              </div>
              {folders.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.name}
                  aria-current={folder?.id === item.id ? "page" : undefined}
                  className={`sidebar-item ${folder?.id === item.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveFolder(item.id);
                    setSearch("");
                    location.hash = `folder=${item.id}`;
                  }}
                >
                  <Folder size={17} />
                  <span>{item.name}</span>
                  <span className="sidebar-count">
                    {
                      projects.filter((project) => project.folderId === item.id)
                        .length
                    }
                  </span>
                </button>
              ))}
              {!folders.length && <p>Keep related projects together.</p>}
            </nav>
            <div className="sidebar-footer">
              <button
                type="button"
                className="sidebar-item"
                aria-label="A little help"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={17} />
                <span>A little help</span>
                <ExternalLink size={12} />
              </button>
              <div className="local-workspace">
                <span className="local-dot" />
                <div>
                  <strong>Local workspace</strong>
                  <span>Made on your computer.</span>
                </div>
              </div>
            </div>
          </aside>
          <main id="main-content" className="dashboard-main" tabIndex={-1}>
            <header className="dashboard-topbar">
              <span>
                Workspace <ChevronRight size={12} /> Projects
                {folder && (
                  <>
                    <ChevronRight size={12} />
                    <span className="folder-path">
                      <Folder size={13} />
                      <span>{folder.name}</span>
                    </span>
                  </>
                )}
              </span>
              <IconButton
                label="Assistant connections"
                onClick={() => setConnections(true)}
              >
                <Settings2 size={17} />
              </IconButton>
            </header>
            <div className="dashboard-content">
              <div className="dashboard-title">
                <div>
                  <span className="eyebrow">
                    FROM AN IDEA TO A FINISHED VIDEO
                  </span>
                  <h1>
                    Your next great short
                    <br />
                    starts here<span>.</span>
                  </h1>
                  <p>
                    A space for your ideas, your references, and a little
                    creative help.
                  </p>
                </div>
                <Button variant="primary" onClick={() => setNewProject(true)}>
                  <Plus size={17} />
                  New project
                </Button>
              </div>
              <div className="projects-heading">
                <div>
                  <h2>{folder?.name || "All projects"}</h2>
                  <span>{folderProjects.length}</span>
                  {folder && (
                    <IconButton
                      label="Delete folder"
                      onClick={() =>
                        setLibraryAction({ type: "deleteFolder", folder })
                      }
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </div>
                <div className="project-filters">
                  <Select
                    className="folder-filter"
                    label="View projects"
                    value={folder?.id || ""}
                    onChange={(id) => {
                      setActiveFolder(id || null);
                      setSearch("");
                      location.hash = id ? `folder=${id}` : "";
                    }}
                    options={[
                      { value: "", label: "All projects" },
                      ...folders.map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                  />
                  <label className="search-field">
                    <Search size={14} />
                    <span className="sr-only">Search projects</span>
                    <input
                      placeholder="Search projects"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <Select
                    label="Sort projects"
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: "recent", label: "Recently edited" },
                      { value: "name", label: "Name A–Z" },
                    ]}
                  />
                </div>
              </div>
              {loading ? (
                <div className="project-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="project-skeleton">
                      <div />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : filtered.length ? (
                <div className="project-grid">
                  {filtered.map((item) => (
                    <article className="project-tile" key={item.id}>
                      <button
                        type="button"
                        className="project-card"
                        onClick={() => openProject(item)}
                      >
                        <MiniPreview project={item} />
                        <div className="project-card-info">
                          <h3>{item.name}</h3>
                          <span>
                            {dateLabel(item.updatedAt)}
                            <span>·</span>
                            {Math.round(item.document.duration)}s
                          </span>
                        </div>
                      </button>
                      <ProjectActions
                        project={item}
                        onAction={setLibraryAction}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <div className="projects-empty">
                  <div className="empty-film">
                    <div />
                    <div />
                    <div>
                      <Clapperboard size={31} />
                      <span>00:00</span>
                    </div>
                  </div>
                  <h3>
                    {search
                      ? "No projects by that name."
                      : folder
                        ? "A little room for your next idea."
                        : "A blank canvas. A lot of possibilities."}
                  </h3>
                  <p>
                    {search
                      ? "Try a different search."
                      : folder
                        ? "Create a project here or move one in from All projects."
                        : "Start with a prompt, a favorite video, or the audio you’ve been saving."}
                  </p>
                  {!search && (
                    <Button onClick={() => setNewProject(true)}>
                      {folder
                        ? "Create a project"
                        : "Create your first project"}
                      <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
              )}
              <footer className="dashboard-bottom">
                <span>
                  <span className="local-dot" />
                  Saved locally. Yours to create.
                </span>
                <span>
                  short.it <span className="separator">/</span> open source
                </span>
              </footer>
            </div>
          </main>
        </>
      ) : (
        project && (
          <>
            <header className="editor-header">
              <button
                type="button"
                className="editor-brand"
                aria-label="Back to projects"
                onClick={() => void goHome()}
              >
                <Logo compact />
                <ArrowLeft size={14} />
              </button>
              <div className="project-title">
                <label className="sr-only" htmlFor="project-name">
                  Project name
                </label>
                <input
                  id="project-name"
                  aria-label="Project name"
                  value={project.name}
                  maxLength={100}
                  onChange={(e) => editor.rename(e.target.value)}
                  disabled={busy}
                />
                <Status busy={editor.saveState === "saving"}>
                  {editor.saveState === "saving"
                    ? "Saving"
                    : editor.saveState === "error"
                      ? "Not saved"
                      : "Saved"}
                </Status>
              </div>
              <div className="header-history">
                <IconButton
                  label="Undo (Ctrl+Z)"
                  onClick={editor.undo}
                  disabled={!editor.canUndo || busy}
                >
                  <Undo2 size={16} />
                </IconButton>
                <IconButton
                  label="Redo (Ctrl+Shift+Z)"
                  onClick={editor.redo}
                  disabled={!editor.canRedo || busy}
                >
                  <Redo2 size={16} />
                </IconButton>
              </div>
              <div className="header-actions">
                <IconButton
                  label="Assistant connections"
                  onClick={() => setConnections(true)}
                >
                  <Settings2 size={17} />
                </IconButton>
                <Button
                  variant="primary"
                  className="export-button"
                  disabled={busy || exporting}
                  onClick={() => void exportVideo()}
                >
                  <ArrowDownToLine size={14} />
                  {exporting ? "Preparing…" : "Export"}
                </Button>
              </div>
            </header>
            <main
              id="main-content"
              tabIndex={-1}
              ref={panels.ref}
              style={panels.style}
              className={`editor-layout resizable-editor ${mobileEditor ? "show-editor" : ""} ${panels.chatCollapsed ? "chat-collapsed" : ""}`}
            >
              <nav className="editor-rail" aria-label="Editor tools">
                <div>
                  {(
                    [
                      { id: "chat", label: "Assistant", icon: Sparkles },
                      { id: "media", label: "Media", icon: FolderOpen },
                      { id: "references", label: "References", icon: Link },
                    ] as const
                  ).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-label={item.label}
                      title={item.label}
                      className={tab === item.id ? "active" : ""}
                      onClick={() => {
                        if (
                          window.matchMedia("(min-width: 801px)").matches &&
                          tab === item.id
                        )
                          panels.toggleChat();
                        else panels.openChat();
                        setTab(item.id);
                        setMobileEditor(false);
                      }}
                    >
                      <item.icon size={19} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`mobile-editor-tool ${mobileEditor ? "active" : ""}`}
                    aria-label="Open video editor"
                    onClick={() => setMobileEditor(true)}
                  >
                    <Clapperboard size={19} />
                    <span>Editor</span>
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Help and keyboard shortcuts"
                  title="Help and shortcuts"
                  onClick={() => setHelp(true)}
                >
                  <CircleHelp size={18} />
                </button>
              </nav>
              <aside className="left-panel">
                <header className="left-panel-header">
                  <h2>
                    {tab === "chat"
                      ? "Creative assistant"
                      : tab === "media"
                        ? "Your media"
                        : "References"}
                  </h2>
                  {tab === "chat" ? (
                    <span className="chat-header-badge">Let’s create</span>
                  ) : (
                    <span className="muted">
                      {tab === "media"
                        ? project.assets.length
                        : `${project.references.length}/5`}
                    </span>
                  )}
                </header>
                <div
                  className={`left-panel-content ${tab !== "chat" ? "scrollable" : ""}`}
                  style={{ display: tab === "chat" ? "flex" : "none" }}
                >
                  <Chat
                    key={project.id}
                    project={project}
                    engines={engines}
                    onSync={editor.syncAgent}
                    onSave={editor.persist}
                    onUpload={upload}
                    onBusy={setBusy}
                    onConnections={() => setConnections(true)}
                  />
                </div>
                {tab === "media" && (
                  <div className="left-panel-content scrollable">
                    <div className="library-panel">
                      <Dropzone
                        busy={uploading}
                        onFiles={(files) => {
                          void upload(files).catch((e) =>
                            editor.setError(e.message),
                          );
                        }}
                      />
                      <div className="section-label">
                        Media library<span>{project.assets.length} files</span>
                      </div>
                      <div className="asset-list">
                        {project.assets.map((asset) => {
                          const Icon =
                            asset.type === "image"
                              ? Image
                              : asset.type === "video"
                                ? Video
                                : FileAudio;
                          return (
                            <button
                              type="button"
                              className="asset-card"
                              key={asset.id}
                              disabled={busy}
                              onClick={() => addElement("text", asset)}
                              title={`Add ${asset.name} to timeline`}
                            >
                              <span className={`asset-thumbnail ${asset.type}`}>
                                {asset.type === "image" ? (
                                  <img
                                    src={assetUrl(project.id, asset.id)}
                                    alt=""
                                  />
                                ) : (
                                  <Icon size={21} />
                                )}
                              </span>
                              <span className="asset-info">
                                <strong>{asset.name}</strong>
                                <small>
                                  {asset.type}
                                  {asset.duration
                                    ? ` · ${Math.round(asset.duration)}s`
                                    : ""}{" "}
                                  · {(asset.size / 1024 / 1024).toFixed(1)} MB
                                </small>
                              </span>
                              <Plus size={15} />
                            </button>
                          );
                        })}
                      </div>
                      {!project.assets.length && (
                        <div className="library-empty">
                          <Film size={25} />
                          <p>Everything you need, right here.</p>
                          <span>
                            Import a voiceover, a clip, or an image to get
                            started.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {tab === "references" && (
                  <div className="left-panel-content scrollable">
                    <ReferencePanel
                      project={project}
                      onAdd={addReference}
                      onRetry={async (id) => {
                        await editor.persist();
                        await api(
                          `/projects/${project.id}/references/${id}/retry`,
                          { method: "POST" },
                        );
                        editor.syncMetadata(
                          await api<Project>(`/projects/${project.id}`),
                        );
                      }}
                    />
                  </div>
                )}
              </aside>
              {panels.splitter("chat")}
              <div className="editor-workspace" inert={busy}>
                <div className="canvas-tools">
                  <div>
                    <Button variant="ghost" onClick={() => addElement("text")}>
                      <Type size={15} />
                      Text
                    </Button>
                    <Button variant="ghost" onClick={() => addElement("shape")}>
                      <Shapes size={15} />
                      Shape
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTab("media");
                        panels.openChat();
                      }}
                    >
                      <Upload size={15} />
                      Media
                    </Button>
                  </div>
                  <span>
                    {project.document.width > project.document.height
                      ? "Landscape"
                      : project.document.width === project.document.height
                        ? "Square"
                        : "Portrait"}
                    <span className="separator">·</span>
                    {project.document.width > project.document.height
                      ? "16:9"
                      : project.document.width === project.document.height
                        ? "1:1"
                        : "9:16"}
                  </span>
                </div>
                <div className="preview-inspector">
                  <Canvas
                    project={project}
                    time={time}
                    playing={playing}
                    selected={selected}
                    onSelect={setSelected}
                    onLayersChange={changeLayers}
                    disabled={busy}
                    onAddText={() => addElement("text")}
                  />
                  {panels.splitter("inspector")}
                  {selected.length > 1 ? (
                    <aside className="inspector multi-selection">
                      <strong>{selected.length} elements selected</strong>
                      <p>
                        Drag to move together. Shift-click to change the
                        selection.
                      </p>
                    </aside>
                  ) : (
                    <Inspector
                      document={project.document}
                      selected={selectedLayer}
                      onLayerChange={changeLayer}
                      onDocumentChange={editor.change}
                    />
                  )}
                </div>
                <div className="transport">
                  <span className="current-time">
                    {formatTime(time)}{" "}
                    <span>/ {formatTime(project.document.duration)}</span>
                  </span>
                  <div>
                    <IconButton
                      label="Return to start"
                      onClick={() => {
                        setTime(0);
                        setPlaying(false);
                      }}
                    >
                      <SkipBack size={15} />
                    </IconButton>
                    <IconButton
                      label={playing ? "Pause preview" : "Play preview (Space)"}
                      className="play-button"
                      onClick={() => setPlaying((value) => !value)}
                    >
                      {playing ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
                    </IconButton>
                    <span className="transport-spacer" />
                  </div>
                  <span className="transport-hint">
                    Space to {playing ? "pause" : "play"}
                  </span>
                </div>
                {panels.splitter("timeline")}
                <Timeline
                  document={project.document}
                  time={time}
                  selected={selected}
                  onSelect={setSelected}
                  onSeek={setTime}
                  onChange={changeLayer}
                  onLayersChange={changeLayers}
                  disabled={busy}
                  onDuplicate={duplicateLayer}
                  onDelete={removeLayer}
                  onSplit={splitLayer}
                />
              </div>
              {busy && (
                <div className="generation-overlay">
                  <span className="status-dot" />
                  Creating your video. You can follow along in the chat.
                </div>
              )}
            </main>
          </>
        )
      )}
      {editor.error && (
        <div className="global-error" role="alert">
          <span>{editor.error}</span>
          <IconButton label="Dismiss error" onClick={() => editor.setError("")}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      <div role="status" className="sr-only">
        {notice}
      </div>
      {newProject && (
        <NewProject
          onClose={() => setNewProject(false)}
          onCreate={createProject}
        />
      )}
      {libraryAction && (
        <LibraryDialog
          action={libraryAction}
          folders={folders}
          onClose={() => setLibraryAction(null)}
          onSubmit={async (value) => {
            const action = libraryAction;
            if (action.type === "createFolder") {
              const created = await api<ProjectFolder>("/folders", {
                method: "POST",
                body: JSON.stringify({ name: value }),
              });
              setFolders((items) => [...items, created]);
              setActiveFolder(created.id);
              setSearch("");
              location.hash = `folder=${created.id}`;
              setNotice("Folder created");
            } else if (action.type === "deleteFolder") {
              await api(`/folders/${action.folder.id}`, { method: "DELETE" });
              setActiveFolder(null);
              location.hash = "";
              await loadProjects();
              setNotice(
                "Folder deleted. Your projects are still in All projects.",
              );
            } else if (action.type === "moveProject") {
              const next = await api<Project>(
                `/projects/${action.project.id}/folder`,
                {
                  method: "PUT",
                  body: JSON.stringify({ folderId: value || null }),
                },
              );
              setProjects((items) =>
                items.map((item) => (item.id === next.id ? next : item)),
              );
              editor.syncMetadata(next);
              setNotice("Project moved");
            } else {
              await api(`/projects/${action.project.id}`, { method: "DELETE" });
              setProjects((items) =>
                items.filter((item) => item.id !== action.project.id),
              );
              setNotice("Project deleted");
            }
            setLibraryAction(null);
          }}
        />
      )}
      {connections && (
        <Connections
          engines={engines}
          onRefresh={loadEngines}
          onClose={() => setConnections(false)}
        />
      )}
      {exportJob && (
        <Dialog
          title={
            exportJob.status === "done"
              ? "Ready for the world."
              : exportJob.status === "error"
                ? "Export needs attention"
                : "Making the final cut."
          }
          description={
            exportJob.status === "done"
              ? "Your video is ready to save and share."
              : "Your editable project stays right here."
          }
          onClose={() => setExportJob(null)}
        >
          <div className={`export-state ${exportJob.status}`}>
            <span className="export-state-icon">
              {exportJob.status === "done" ? (
                <Check size={28} />
              ) : exportJob.status === "error" ? (
                <X size={28} />
              ) : (
                <Film size={28} />
              )}
            </span>
            <h3>
              {exportJob.status === "done"
                ? "Video exported"
                : exportJob.status === "error"
                  ? "Couldn’t export this video"
                  : "Rendering your video…"}
            </h3>
            <p>
              {exportJob.error ||
                exportJob.message ||
                "Preparing your frames and audio."}
            </p>
            {["queued", "running"].includes(exportJob.status) && (
              <div className="indeterminate-progress">
                <span />
              </div>
            )}
          </div>
          <footer className="dialog-actions">
            <Button onClick={() => setExportJob(null)}>Close</Button>
            {exportJob.status === "done" && (
              <a
                className="button primary"
                href={exportJob.url || `/api/jobs/${exportJob.id}/download`}
                download
              >
                <ArrowDownToLine size={15} />
                Download MP4
              </a>
            )}
            {exportJob.status === "error" && (
              <Button variant="primary" onClick={() => void exportVideo()}>
                Try again
              </Button>
            )}
          </footer>
        </Dialog>
      )}
      {help && (
        <Dialog
          title="A little help."
          description="A few small shortcuts for your next great short."
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <p>
              Start with a prompt in the assistant. Add reference links for a
              style to follow, or import media and mention it with <kbd>@</kbd>.
              You can also add text and shapes directly.
            </p>
            <div className="shortcut-list">
              {[
                ["Play / pause", "Space"],
                ["Undo", "Ctrl Z"],
                ["Redo", "Ctrl Shift Z"],
                ["Split selected clip", "S"],
                ["Duplicate selection", "Ctrl D"],
                ["Select all elements", "Ctrl A"],
                ["Clear selection", "Esc"],
                ["Add / remove from selection", "Shift click"],
                ["Move element", "Arrow keys"],
                ["Move by 10 pixels", "Shift Arrows"],
                ["Delete element", "Delete"],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p>
              Drag elements on the canvas to move them, use the corner to
              resize, or enter precise values in the Edit panel. Drag a clip’s
              edges on the timeline to trim it. Drag across empty canvas or
              timeline space to select several elements, then move or delete
              them together.
            </p>
          </div>
          <footer className="dialog-actions">
            <Button variant="primary" onClick={() => setHelp(false)}>
              Got it
            </Button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
