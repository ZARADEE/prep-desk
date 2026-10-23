import { build } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false,
  root,
  base: "/",
  plugins: [react()],
  resolve: {
    alias: [{ find: /^printf$/, replacement: resolve(root, "src/components/os-lab/printf-browser.cjs") }]
  },
  define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/api") },
  build: {
    outDir: resolve(root, "out/web"),
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "index.html") }
  }
});
