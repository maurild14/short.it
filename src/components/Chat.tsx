import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  CircleStop,
  FileAudio,
  Image,
  Paperclip,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import type { Project, Asset } from "../shared/types";
import { api, streamChat, type EngineStatus, type ChatStatus } from "../api";
import { Button, IconButton, Select } from "./ui";

const assetIcons = { image: Image, audio: FileAudio, video: Video };

function MessageText({ content }: { content: string }) {
  return (
    <div className="message-text">
      {content.split(/(```[\s\S]*?```)/g).map((part, index) =>
        part.startsWith("```") ? (
          <pre key={index}>
            <code>{part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</code>
          </pre>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  );
}

export default function Chat({
  project,
  engines,
  onSync,
  onSave,
  onUpload,
  onBusy,
  onConnections,
}: {
  project: Project;
  engines: EngineStatus[];
  onSync: (project: Project) => void;
  onSave: () => Promise<void>;
  onUpload: (files: File[]) => Promise<Asset[]>;
  onBusy: (busy: boolean) => void;
  onConnections: () => void;
}) {
  const [engineId, setEngineId] = useState<"codex" | "claude">(() =>
    localStorage.getItem("short-it-engine") === "claude" ? "claude" : "codex",
  );
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("medium");
  const [prompt, setPrompt] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [response, setResponse] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const observedRunning = useRef(false);
  const callbacks = useRef({ onSync, onBusy });
  callbacks.current = { onSync, onBusy };
  const engine = engines.find((item) => item.id === engineId);
  const modelEfforts = engine?.models.find(
    (item) => item.id === model,
  )?.efforts;
  const efforts =
    engine?.efforts.filter(
      (item) => !modelEfforts || modelEfforts.includes(item.id),
    ) || [];
  const mentionQuery = prompt.match(/@([^@\s]*)$/)?.[1];
  const mentions =
    mentionOpen && mentionQuery !== undefined
      ? project.assets
          .filter((asset) =>
            asset.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  useEffect(() => {
    if (engine && !engine.available) {
      const available = engines.find((item) => item.available);
      if (available) setEngineId(available.id);
    }
  }, [engines]);
  useEffect(() => {
    const remembered = localStorage.getItem(`short-it-model-${engineId}`);
    setModel(
      engine?.models.find((item) => item.id === remembered)?.id ||
        engine?.models[0]?.id ||
        "",
    );
    localStorage.setItem("short-it-engine", engineId);
  }, [engineId, engines]);
  useEffect(() => {
    if (efforts.length && !efforts.some((item) => item.id === effort))
      setEffort(
        efforts.find((item) => item.id === "medium")?.id || efforts[0].id,
      );
  }, [engineId, model, engines]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [response, status, project.messages.length, pending]);
  useEffect(() => {
    let active = true;
    let reconnecting = false;
    let lastServerError: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    mounted.current = true;
    callbacks.current.onBusy(true);
    async function refresh() {
      try {
        if (controller.current) return;
        const snapshot = await api<ChatStatus>(`/projects/${project.id}/chat`);
        if (!active || controller.current) return;
        if (snapshot.running) {
          observedRunning.current = true;
          setResponse(snapshot.text);
          setStatus(snapshot.status || "Creating your video...");
          setPending("");
        } else {
          if (observedRunning.current) {
            callbacks.current.onSync(snapshot.project);
            setAttached([]);
          }
          observedRunning.current = false;
          setPending("");
          setResponse("");
          setStatus("");
        }
        if (
          reconnecting ||
          (snapshot.error && snapshot.error !== lastServerError)
        )
          setError(snapshot.error || "");
        lastServerError = snapshot.error;
        reconnecting = false;
        setBusy(snapshot.running);
        callbacks.current.onBusy(snapshot.running);
        setChecking(false);
      } catch (e) {
        if (active && !controller.current) {
          reconnecting = true;
          setError(
            `Could not check your assistant. Reconnecting... ${(e as Error).message}`,
          );
          setChecking(true);
          callbacks.current.onBusy(true);
        }
      } finally {
        if (active) timer = setTimeout(refresh, 700);
      }
    }
    void refresh();
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      controller.current?.abort();
      callbacks.current.onBusy(false);
    };
  }, [project.id]);

  function insertMention(asset: Asset) {
    setPrompt((value) => value.replace(/@([^@\s]*)$/, `@${asset.name} `));
    setAttached((value) => [...new Set([...value, asset.id])]);
    setMentionOpen(false);
    textarea.current?.focus();
  }
  async function upload(selected: File[]) {
    if (!selected.length) return;
    setUploading(true);
    setError("");
    try {
      const assets = await onUpload(selected);
      setAttached((value) => [
        ...new Set([...value, ...assets.map((asset) => asset.id)]),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function send() {
    const message = prompt.trim();
    if (!message || busy || checking || uploading || controller.current) return;
    if (!engine?.available) {
      setError(engine?.reason || "Connect an assistant to start creating.");
      return;
    }
    setError("");
    setBusy(true);
    onBusy(true);
    setPending(message);
    setResponse("");
    setStatus("Getting ready…");
    const connection = new AbortController();
    controller.current = connection;
    try {
      await onSave();
      if (!mounted.current || connection.signal.aborted) return;
      observedRunning.current = true;
      setPrompt("");
      setMentionOpen(false);
      await streamChat(
        project.id,
        { message, engine: engineId, model, effort, assetIds: attached },
        (event) => {
          if (!mounted.current || connection.signal.aborted) return;
          if (event.type === "text")
            setResponse((value) => value + (event.text || ""));
          if (event.type === "status") setStatus(event.text || "Working…");
          if (event.type === "error")
            setError(
              event.error || "The assistant could not finish this request.",
            );
          if (event.type === "done" && event.project) {
            onSync(event.project);
            setPending("");
            setResponse("");
            setAttached([]);
          }
        },
        connection.signal,
      );
    } catch (e) {
      if (mounted.current && !connection.signal.aborted) {
        setError((e as Error).message);
        setStatus("Reconnecting...");
      }
    } finally {
      if (controller.current === connection) controller.current = null;
      // The server owns completion; polling also recovers interrupted streams.
      if (mounted.current && !connection.signal.aborted) setChecking(true);
    }
  }
  async function stop() {
    try {
      await api(`/projects/${project.id}/cancel`, { method: "POST" });
      if (mounted.current) setStatus("Stopping...");
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-log" ref={log} aria-label="Conversation">
        {!project.messages.length && !busy && (
          <div className="chat-welcome">
            <span className="assistant-mark">
              <Sparkles size={21} />
            </span>
            <h2>Let’s make it move.</h2>
            <p>
              Describe your video. Add a reference, drop in your audio, and
              we’ll build from there.
            </p>
            <div className="starter-prompts">
              {[
                "Turn my idea into a short video",
                "Match the style of my references",
                "Build visuals around my audio",
              ].map((text, index) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => {
                    setPrompt(text);
                    textarea.current?.focus();
                  }}
                >
                  <span className="prompt-number">0{index + 1}</span>
                  <span>{text}</span>
                  <ArrowUp size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
        {project.messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <div className="message-author">
              {message.role === "assistant" ? (
                <>
                  <span className="tiny-mark">
                    <Sparkles size={11} />
                  </span>
                  short.it
                </>
              ) : (
                "You"
              )}
            </div>
            <MessageText content={message.content} />
            {message.assetIds?.length ? (
              <div className="message-assets">
                {message.assetIds.map((id) => {
                  const asset = project.assets.find((item) => item.id === id);
                  return asset ? (
                    <span key={id}>
                      <Paperclip size={10} />
                      {asset.name}
                    </span>
                  ) : null;
                })}
              </div>
            ) : null}
          </article>
        ))}
        {pending && (
          <article className="chat-message user">
            <div className="message-author">You</div>
            <MessageText content={pending} />
          </article>
        )}
        {(busy || response) && (
          <article className="chat-message assistant">
            <div className="message-author">
              <span className="tiny-mark">
                <Sparkles size={11} />
              </span>
              short.it
            </div>
            {response && <MessageText content={response} />}{" "}
            {busy && (
              <div className="working-status">
                <span className="status-dot" />
                {status || "Creating your video…"}
              </div>
            )}
          </article>
        )}
      </div>
      <div className="chat-composer-wrap">
        {error && (
          <div className="inline-error" role="alert">
            <span>{error}</span>
            <IconButton label="Dismiss message" onClick={() => setError("")}>
              <X size={13} />
            </IconButton>
          </div>
        )}
        <div
          className="prompt-composer"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("drag-over");
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("drag-over");
            void upload(Array.from(e.dataTransfer.files));
          }}
        >
          {attached.length > 0 && (
            <div className="attachment-list">
              {attached.map((id) => {
                const asset = project.assets.find((item) => item.id === id);
                if (!asset) return null;
                const Icon = assetIcons[asset.type];
                return (
                  <span className="attachment-chip" key={id}>
                    <Icon size={12} />
                    <span>{asset.name}</span>
                    <IconButton
                      label={`Detach ${asset.name}`}
                      onClick={() =>
                        setAttached((value) =>
                          value.filter((item) => item !== id),
                        )
                      }
                    >
                      <X size={11} />
                    </IconButton>
                  </span>
                );
              })}
            </div>
          )}
          {mentions.length > 0 && (
            <div
              className="mention-menu"
              role="listbox"
              aria-label="Mention an asset"
            >
              {mentions.map((asset, index) => {
                const Icon = assetIcons[asset.type];
                return (
                  <button
                    type="button"
                    key={asset.id}
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={index === mentionIndex ? "active" : ""}
                    onClick={() => insertMention(asset)}
                  >
                    <Icon size={15} />
                    <span>{asset.name}</span>
                    <small>{asset.type}</small>
                  </button>
                );
              })}
            </div>
          )}
          <label className="sr-only" htmlFor="assistant-prompt">
            Describe your video or ask for an edit
          </label>
          <textarea
            id="assistant-prompt"
            ref={textarea}
            value={prompt}
            rows={3}
            placeholder="Describe your video, or ask for an edit…"
            disabled={busy || checking}
            onChange={(e) => {
              setPrompt(e.target.value);
              setMentionOpen(true);
              setMentionIndex(0);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 170)}px`;
            }}
            onKeyDown={(e) => {
              if (mentions.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex(
                    (value) =>
                      (value +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        mentions.length) %
                      mentions.length,
                  );
                  return;
                }
                if (e.key === "Escape") {
                  setMentionOpen(false);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mentions[mentionIndex] || mentions[0]);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-actions">
            <div>
              <input
                ref={files}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="sr-only"
                aria-label="Attach media files"
                onChange={(e) => {
                  void upload(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
              <IconButton
                label="Attach media"
                disabled={busy || checking || uploading}
                onClick={() => files.current?.click()}
              >
                <Paperclip size={16} />
              </IconButton>
              <IconButton
                label="Mention an asset"
                disabled={busy || checking}
                onClick={() => {
                  setPrompt(
                    (value) =>
                      `${value}${value && !value.endsWith(" ") ? " " : ""}@`,
                  );
                  setMentionOpen(true);
                  setMentionIndex(0);
                  textarea.current?.focus();
                }}
              >
                <AtSign size={16} />
              </IconButton>
              <span>{uploading ? "Importing…" : "@ to use your media"}</span>
            </div>
            {busy ? (
              <IconButton
                label="Stop generating"
                className="send-button stop"
                onClick={() => void stop()}
              >
                <CircleStop size={19} />
              </IconButton>
            ) : (
              <IconButton
                label="Send message"
                className="send-button"
                disabled={checking || !prompt.trim() || uploading}
                onClick={() => void send()}
              >
                <ArrowUp size={18} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="model-controls">
          <Select
            label="Assistant provider"
            value={engineId}
            onChange={(id) => setEngineId(id as "codex" | "claude")}
            disabled={busy || checking}
            options={
              engines.length
                ? engines.map((item) => ({ value: item.id, label: item.label }))
                : [
                    { value: "codex", label: "Codex" },
                    { value: "claude", label: "Claude" },
                  ]
            }
          />
          <Select
            label="Model"
            value={model}
            onChange={(id) => {
              setModel(id);
              localStorage.setItem(`short-it-model-${engineId}`, id);
            }}
            disabled={busy || checking || !engine?.models.length}
            options={
              engine?.models.length
                ? engine.models.map((item) => ({
                    value: item.id,
                    label: item.label,
                  }))
                : [{ value: "", label: "Default model" }]
            }
          />
          {efforts.length > 0 && (
            <Select
              label="Thinking effort"
              value={effort}
              onChange={setEffort}
              disabled={busy || checking}
              options={efforts.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
            />
          )}
        </div>
        {!engine?.available && (
          <button
            type="button"
            className="connection-nudge"
            onClick={onConnections}
          >
            <span className="status-dot" />
            Connect your assistant <span>→</span>
          </button>
        )}
        <p className="composer-footnote">
          Your idea. Your media. Every detail editable.
        </p>
      </div>
    </div>
  );
}
