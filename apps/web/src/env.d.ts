/// <reference types="vite/client" />

// The .env values vite.config.ts hands the browser under their plain names.
// Undefined when .env leaves them out.
interface ImportMetaEnv {
  readonly SUPABASE_URL: string | undefined;
  readonly SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly API_BASE_URL: string | undefined;
}
