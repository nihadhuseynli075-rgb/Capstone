import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // .env lives at the repository root, shared with the API, rather than inside
  // this app. Only VITE_-prefixed values from it reach the browser.
  envDir: "../../",
  server: {
    port: 5173
  }
});
