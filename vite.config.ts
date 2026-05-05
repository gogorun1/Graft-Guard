import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react],
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "index.html"),
        contentScript: resolve(__dirname, "src/extension/contentScript.ts"),
        background: resolve(__dirname, "src/extension/background.ts"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
