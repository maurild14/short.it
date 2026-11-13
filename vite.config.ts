import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["react", "react-dom/client", "lucide-react"] },
  server: {
    host: "127.0.0.1",
    watch: { ignored: ["**/.short-it/**", "**/projects/**"] },
  },
  build: { sourcemap: false },
});
