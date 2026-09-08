import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest config is merged in here via the `test` field so a single command
// (npm test) runs the suite with the same module resolution as the app.
export default defineConfig({
  plugins: [react()],
  // Pin the dev server to a fixed port and fail loudly if it is taken, rather than
  // silently wandering to a random port. A wandering port is unreachable from the
  // in-app browser preview; a hard failure ("Port 5173 is in use") instead points
  // straight at a leftover dev server from an earlier session that needs stopping.
  server: { port: 5173, strictPort: true },
  build: {
    // Split the heavy vendor libraries into their own long-lived chunks so a code
    // change only busts the small app chunk, not the whole 1.6MB payload, and the
    // browser can fetch vendors in parallel and reuse them across deploys. deck.gl
    // + luma.gl (the map's WebGL renderer) is by far the largest, so it is isolated
    // and only loaded with the map view (which is also lazy, see App.tsx).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@deck.gl") || id.includes("@luma.gl") || id.includes("@math.gl") || id.includes("@loaders.gl")) return "vendor-deckgl";
          if (id.includes("@mui") || id.includes("@emotion")) return "vendor-mui";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
          return "vendor";
        },
      },
    },
    // The isolated deck.gl chunk is legitimately large; keep the warning honest by
    // raising the threshold above the app chunks it no longer applies to.
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
