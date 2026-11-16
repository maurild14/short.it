import { useEffect, useId, useRef, useState } from "react";
import { FolderInput, MoreHorizontal, Trash2 } from "lucide-react";
import type { Project, ProjectFolder } from "../shared/types";
import { Button, Dialog, Select } from "./ui";
import "./project-library.css";

export type LibraryAction =
  | { type: "createFolder" }
  | { type: "deleteFolder"; folder: ProjectFolder }
  | { type: "moveProject"; project: Project }
  | { type: "deleteProject"; project: Project };

export function ProjectActions({
  project,
  onAction,
}: {
  project: Project;
  onAction: (action: LibraryAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="project-actions"
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button"
        aria-label={`Options for ${project.name}`}
        title={`Options for ${project.name}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          className="project-action-list"
          id={id}
          role="group"
          aria-label="Project actions"
        >
          <button
            type="button"
            onClick={() => {
              trigger.current?.focus();
              onAction({ type: "moveProject", project });
              setOpen(false);
            }}
          >
            <FolderInput size={15} /> Move to folder
          </button>
          <button
            type="button"
            className="delete-action"
            onClick={() => {
              trigger.current?.focus();
              onAction({ type: "deleteProject", project });
              setOpen(false);
            }}
          >
            <Trash2 size={15} /> Delete project
          </button>
        </div>
      )}
    </div>
  );
}

export function LibraryDialog({
  action,
  folders,
  onClose,
  onSubmit,
}: {
  action: LibraryAction;
  folders: ProjectFolder[];
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(
    action.type === "moveProject" ? action.project.folderId || "" : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const creating = action.type === "createFolder";
  const moving = action.type === "moveProject";
  useEffect(() => {
    form.current
      ?.querySelector<HTMLElement>(
        creating ? "input" : moving ? "select" : 'button[type="button"]',
      )
      ?.focus();
  }, [creating, moving]);
  const title = creating
    ? "New folder"
    : moving
      ? "Move project"
      : action.type === "deleteFolder"
        ? "Delete folder?"
        : "Delete project?";
  const description = creating
    ? "A little space to keep related projects together."
    : moving
      ? `Choose a home for “${action.project.name}”.`
      : action.type === "deleteFolder"
        ? `“${action.folder.name}” will be removed. Its projects will stay in All projects.`
        : `“${action.project.name}” and all its media, references, chat, and exports will be permanently deleted. This cannot be undone.`;
  return (
    <Dialog
      title={title}
      description={description}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        ref={form}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSubmit(value.trim());
          } catch (error) {
            setError((error as Error).message);
            setBusy(false);
          }
        }}
      >
        {creating && (
          <label className="field">
            <span>Folder name</span>
            <input
              autoFocus
              required
              maxLength={100}
              value={value}
              placeholder="e.g. Brand stories"
              disabled={busy}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        {moving && (
          <div className="field">
            <span>Destination</span>
            <Select
              label="Destination"
              value={value}
              disabled={busy}
              onChange={setValue}
              options={[
                { value: "", label: "No folder" },
                ...folders.map((folder) => ({
                  value: folder.id,
                  label: folder.name,
                })),
              ]}
            />
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          <Button
            autoFocus={!creating && !moving}
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant={creating || moving ? "primary" : "danger"}
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : creating
                ? "Create folder"
                : moving
                  ? "Move project"
                  : action.type === "deleteFolder"
                    ? "Delete folder"
                    : "Delete project"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
