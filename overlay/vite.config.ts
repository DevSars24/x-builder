import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "XBuilderOverlay",
      formats: ["iife"],
      fileName: () => "overlay.iife.js",
    },
    outDir: "dist",
    rollupOptions: {
      external: [],
    },
  },
});
