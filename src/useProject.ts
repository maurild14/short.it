import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Project, VideoDocument } from "./shared/types";

const signature = (project: Project) =>
  JSON.stringify([project.name, project.document]);

export function useProject() {
  const [project, setProject] = useState<Project | null>(null);
  const current = useRef<Project | null>(null);
  const saved = useRef("");
  const revision = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const pendingSignature = useRef<string | null>(null);
  const [past, setPast] = useState<VideoDocument[]>([]);
  const [future, setFuture] = useState<VideoDocument[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [error, setError] = useState("");

  const sync = useCallback((next: Project, recordHistory = false) => {
    if (
      recordHistory &&
      current.current?.id === next.id &&
      JSON.stringify(current.current.document) !== JSON.stringify(next.document)
    ) {
      const before = current.current.document;
      setPast((items) => [...items.slice(-49), before]);
      setFuture([]);
    }
    saved.current = signature(next);
    revision.current = next.revision;
    current.current = next;
    setProject(next);
    setSaveState("saved");
  }, []);
  const open = useCallback(
    (next: Project) => {
      setPast([]);
      setFuture([]);
      setError("");
      sync(next);
    },
    [sync],
  );
  const syncAgent = useCallback(
    (next: Project) => {
      const local = current.current;
      if (!local || local.id !== next.id || next.revision < revision.current)
        return;
      if (signature(local) !== saved.current) {
        setError(
          "The assistant finished, but you have unsaved edits. Reopen the project to load its result; your current edit is still here.",
        );
        return;
      }
      sync(next, true);
    },
    [sync],
  );
  const syncMetadata = useCallback((next: Project) => {
    const local = current.current;
    if (!local || local.id !== next.id || next.revision < revision.current)
      return;
    if (
      signature(next) !== saved.current &&
      signature(next) !== pendingSignature.current
    ) {
      setError(
        "This project changed in another window. Your edit is still here. Reopen the project before making further changes.",
      );
      return;
    }
    revision.current = next.revision;
    const merged = { ...next, name: local.name, document: local.document };
    current.current = merged;
    setProject(merged);
  }, []);
  const change = useCallback(
    (document: VideoDocument, recordHistory = true) => {
      const previous = current.current;
      if (
        !previous ||
        JSON.stringify(previous.document) === JSON.stringify(document)
      )
        return;
      if (recordHistory) {
        setPast((items) => [...items.slice(-49), previous.document]);
        setFuture([]);
      }
      const next = { ...previous, document };
      current.current = next;
      setProject(next);
      setSaveState("saving");
    },
    [],
  );
  const rename = useCallback((name: string) => {
    if (current.current) {
      const next = { ...current.current, name };
      current.current = next;
      setProject(next);
      setSaveState("saving");
    }
  }, []);

  const persist = useCallback(async function persist(): Promise<void> {
    if (inFlight.current) {
      await inFlight.current;
      return persist();
    }
    const snapshot = current.current;
    if (!snapshot || signature(snapshot) === saved.current) return;
    setSaveState("saving");
    pendingSignature.current = signature({
      ...snapshot,
      name: snapshot.name.trim() || "Untitled video",
    });
    inFlight.current = (async () => {
      let result: Project;
      try {
        result = await api<Project>(`/projects/${snapshot.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: snapshot.name.trim() || "Untitled video",
            document: snapshot.document,
            revision: revision.current,
          }),
        });
      } catch (e) {
        if (!(e as Error).message.includes("Project changed")) throw e;
        const latest = await api<Project>(`/projects/${snapshot.id}`);
        if (signature(latest) !== saved.current)
          throw new Error(
            "This project changed in another window. Your edit is still here. Reopen the project before making further changes.",
          );
        revision.current = latest.revision;
        result = await api<Project>(`/projects/${snapshot.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: snapshot.name.trim() || "Untitled video",
            document: snapshot.document,
            revision: latest.revision,
          }),
        });
      }
      saved.current = signature({ ...snapshot, name: result.name });
      revision.current = Math.max(revision.current, result.revision);
      if (current.current?.id === snapshot.id) {
        const newer = current.current.revision > result.revision;
        const next = {
          ...current.current,
          name:
            current.current.name === snapshot.name
              ? result.name
              : current.current.name,
          revision: revision.current,
          updatedAt: newer ? current.current.updatedAt : result.updatedAt,
          references: newer ? current.current.references : result.references,
          assets: newer ? current.current.assets : result.assets,
        };
        current.current = next;
        setProject(next);
      }
    })();
    try {
      await inFlight.current;
    } catch (e) {
      setSaveState("error");
      setError((e as Error).message);
      throw e;
    } finally {
      inFlight.current = null;
      pendingSignature.current = null;
    }
    if (current.current && signature(current.current) !== saved.current)
      return persist();
    setSaveState("saved");
  }, []);

  useEffect(() => {
    if (!project || signature(project) === saved.current) return;
    const timer = window.setTimeout(() => {
      void persist().catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project?.document, project?.name, persist]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current && signature(current.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (previous && current.current) {
      const before = current.current.document;
      setFuture((items) => [before, ...items]);
      setPast((items) => items.slice(0, -1));
      change(previous, false);
    }
  }, [past, change]);
  const redo = useCallback(() => {
    const next = future[0];
    if (next && current.current) {
      const before = current.current.document;
      setPast((items) => [...items, before]);
      setFuture((items) => items.slice(1));
      change(next, false);
    }
  }, [future, change]);
  return {
    project,
    current,
    sync,
    syncMetadata,
    syncAgent,
    open,
    change,
    rename,
    persist,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    saveState,
    error,
    setError,
  };
}
