import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 560,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4981",
      "/ws": { target: "ws://localhost:4981", ws: true },
    },
  },
});
