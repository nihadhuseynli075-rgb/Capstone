import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // .env lives at the repository root, shared with the API, rather than inside
  // this app. Only VITE_-prefixed values from it reach the browser.
  envDir: "../../",
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        // The two big libraries in files of their own. With Supabase configured
        // everything came to one 508 KB file, over Vite's warning; split, no
        // file is over 300 KB, they download side by side, and a deploy that
        // only changes the app leaves the libraries cached in the browser.
        // Decided per module, so a build without Supabase (where its client
        // is left out altogether) does not get an empty file for it.
        manualChunks(id) {
          if (id.includes("/node_modules/@supabase/")) return "supabase";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          return undefined;
        }
      }
    }
  }
});
