import type { Project } from "./shared/types";

export type EngineStatus = {
  id: "codex" | "claude";
  label: string;
  available: boolean;
  reason?: string;
  models: { id: string; label: string; efforts?: string[] }[];
  efforts: { id: string; label: string }[];
  capabilities: { webSearch: boolean; imageGeneration: string };
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers:
      init.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init.headers },
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}

export const assetUrl = (projectId: string, assetId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;

export async function streamChat(
  projectId: string,
  body: object,
  onEvent: (event: {
    type: string;
    text?: string;
    error?: string;
    project?: Project;
  }) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/projects/${projectId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  if (!response.body)
    throw new Error("The connection closed before a response arrived.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() || "";
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") onEvent(JSON.parse(data));
    }
    if (done) break;
  }
}
