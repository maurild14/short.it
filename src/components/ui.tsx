import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, Upload, Check, ChevronDown } from "lucide-react";

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Dialog({
  title,
  description,
  children,
  onClose,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className="dialog-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}

// Adapted from haassiib/96 Group's MIT Tabs on 21st.dev; license in docs/ui-sources.md.
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div className="tabs">
      <div
        role="tablist"
        className="tab-list"
        onKeyDown={(e) => {
          const delta =
            e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          const index = tabs.findIndex((t) => t.id === value);
          const next =
            e.key === "Home"
              ? tabs[0]
              : e.key === "End"
                ? tabs.at(-1)
                : delta
                  ? tabs[(index + delta + tabs.length) % tabs.length]
                  : undefined;
          if (next) {
            e.preventDefault();
            onChange(next.id);
            refs.current[next.id]?.focus();
          }
        }}
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            role="tab"
            id={`${base}-${tab.id}`}
            aria-controls={`${base}-panel`}
            aria-selected={value === tab.id}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-${value}`}
        className="tab-content"
      >
        {children}
      </div>
    </div>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  className = "",
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`select-wrap ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option
            value={option.value}
            disabled={option.disabled}
            key={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  );
}

export function Dropzone({
  onFiles,
  compact = false,
  busy = false,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div
      className={`dropzone ${compact ? "compact" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add("drag-over");
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("drag-over");
        if (!busy) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        aria-label="Import media files"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="dropzone-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <span className="upload-icon">
          <Upload size={19} />
        </span>
        <strong>
          {busy
            ? "Importing your files…"
            : compact
              ? "Import media"
              : "Drop your media here"}
        </strong>
        {!compact && <span>Audio, video, and images · or browse files</span>}
      </button>
    </div>
  );
}

export function Status({
  children,
  busy = false,
}: {
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <span className={`status ${busy ? "busy" : ""}`}>
      {busy ? <span className="status-dot" /> : <Check size={12} />}
      <span>{children}</span>
    </span>
  );
}
