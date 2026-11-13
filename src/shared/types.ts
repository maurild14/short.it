export type Asset = {
  id: string;
  name: string;
  filename: string;
  mime: string;
  type: "audio" | "image" | "video";
  size: number;
  duration?: number;
};
export type Reference = {
  id: string;
  url: string;
  platform: string;
  status:
    | "queued"
    | "downloading"
    | "extracting"
    | "transcribing"
    | "ready"
    | "error";
  error?: string;
  frameCount?: number;
  fps?: number;
  duration?: number;
  transcript?: string;
  transcriptStatus?: "available" | "unavailable";
};
export type VideoLayer = {
  id: string;
  name: string;
  type: "text" | "image" | "video" | "audio" | "shape";
  start: number;
  duration: number;
  track: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  assetId?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  background?: string;
  borderRadius?: number;
  volume?: number;
  trimStart?: number;
  fadeIn?: number;
  fadeOut?: number;
  locked?: boolean;
  hidden?: boolean;
};
export type VideoDocument = {
  version: 1;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  layers: VideoLayer[];
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  assetIds?: string[];
};
export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  references: Reference[];
  assets: Asset[];
  messages: ChatMessage[];
  document: VideoDocument;
  sessions?: Partial<Record<"codex" | "claude", string>>;
};
export type Job = {
  id: string;
  projectId: string;
  type: "reference" | "export";
  status: "queued" | "running" | "done" | "error";
  message?: string;
  error?: string;
  url?: string;
};
export const newDocument = (): VideoDocument => ({
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 15,
  background: "#08090b",
  layers: [],
});
