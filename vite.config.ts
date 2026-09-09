import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * A 150-minute tape takes hours to land and dissect. Node's default socket and
 * header timeouts would cut the upload off mid-stream, so the bench disarms all
 * three on the dev server.
 */
function benchLongTapePlugin(): Plugin {
  return {
    name: "bench-long-tape",
    configureServer(server) {
      const arm = () => {
        const http = server.httpServer;
        if (!http) return;
        http.timeout = 0;
        http.headersTimeout = 0;
        http.requestTimeout = 0;
      };
      arm();
      server.httpServer?.on("listening", arm);
    },
  };
}

// Bench lives on 0.0.0.0:4849.
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 4849,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    benchLongTapePlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview ? [nitro()] : []),
    viteReact(),
  ],
}));
