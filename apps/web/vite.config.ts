import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("../..", import.meta.url));
  // Env comes from the repo root .env. Server code reads process.env;
  // Vite only exposes VITE_* to the browser.
  Object.assign(process.env, { ...loadEnv(mode, envDir, ""), ...process.env });
  return {
    envDir,
    server: { port: 3001 },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
