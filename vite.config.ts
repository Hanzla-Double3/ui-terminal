import { defineConfig } from "vite";
export default defineConfig({
  root: "demo",
  server: {
    host: "127.0.0.1",
    port: 18120,
    strictPort: true,
    fs: { allow: [".."] },
  },
  build: { outDir: "../demo-dist", emptyOutDir: true },
});
