import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest config is merged in here via the `test` field so a single command
// (npm test) runs the suite with the same module resolution as the app.
export default defineConfig({
  plugins: [react()],
  // @carbon/react and the app must share ONE React instance. Without deduping,
  // Vite's dep optimizer can hand Carbon's pre-bundled chunk a second React copy,
  // which throws "Invalid hook call" the moment a Carbon component (Popover,
  // Tooltip, ComboBox) runs a hook. Dedupe pins a single copy; pre-bundling
  // @carbon/react with react/react-dom keeps them on that same instance.
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "@carbon/react"] },
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
          // React core must match EXACTLY on the react/react-dom/scheduler packages.
          // A loose "/react/" test also captures scoped packages like
          // @floating-ui/react (a Carbon runtime dep), pulling them into the React
          // chunk and creating a cross-chunk circular init (a TDZ "cannot access X
          // before initialization" crash at load). Anchor on node_modules/<pkg>/.
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) return "vendor-react";
          if (id.includes("@mui") || id.includes("@emotion")) return "vendor-mui";
          // Keep Carbon together with the UI runtime deps it imports (floating-ui,
          // downshift, flatpickr) so they initialize in one chunk, not across a cycle.
          if (id.includes("@carbon") || id.includes("@floating-ui") || id.includes("downshift") || id.includes("flatpickr") || id.includes("@ibm/plex")) return "vendor-carbon";
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
