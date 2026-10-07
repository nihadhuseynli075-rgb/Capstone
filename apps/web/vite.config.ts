import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// .env lives at the repository root, shared with the API, rather than inside
// this app.
const ENV_DIR = "../../";

/**
 * The only .env values the browser is given, each under its plain name.
 *
 * Vite would otherwise want a VITE_ prefix on every one, which meant writing
 * the Supabase URL into .env twice. Naming them here instead keeps the list
 * short and explicit: the secret key, the admin password and everything else
 * in .env never reach the browser. The old VITE_ names still work, so an older
 * .env does not stop signing in.
 */
const BROWSER_ENV: Record<string, string[]> = {
  SUPABASE_URL: ["SUPABASE_URL", "VITE_SUPABASE_URL"],
  SUPABASE_PUBLISHABLE_KEY: ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"],
  API_BASE_URL: ["API_BASE_URL", "VITE_API_BASE_URL"]
};

export default defineConfig(({ mode }) => {
  // Prefix "" reads every variable, from .env and from the process (Render's
  // settings arrive that way, and win over .env); BROWSER_ENV picks the few.
  const all = loadEnv(mode, ENV_DIR, "");
  const define = Object.fromEntries(
    Object.entries(BROWSER_ENV).map(([name, sources]) => {
      const value = sources.map((source) => all[source]?.trim()).find(Boolean);
      return [`import.meta.env.${name}`, value === undefined ? "undefined" : JSON.stringify(value)];
    })
  );

  return {
    plugins: [react()],
    define,
    envDir: ENV_DIR,
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
  };
});
