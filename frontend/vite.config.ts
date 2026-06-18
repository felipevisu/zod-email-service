import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Match "/api/..." only — NOT the SPA route "/api-keys", which also
      // starts with "/api" and would otherwise be proxied to the backend.
      "^/api/": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
