import { useEffect, useState } from "react";

/**
 * A hash router in a dozen lines.
 *
 * The app has six screens and no need for nested layouts or data loaders, so a
 * routing library would be more moving parts than the whole thing is worth.
 * Hash routes also mean any static host serves the app without rewrite rules.
 */
export function currentPath(): string {
  // The query is not part of the route: "/build?subject=math" is still "/build".
  const path = window.location.hash.replace(/^#/, "").split("?")[0];
  return path.length > 0 ? path : "/";
}

/** One value from the route's query, e.g. `subject` in "#/build?subject=math". */
export function routeParam(name: string): string | null {
  const hash = window.location.hash;
  const start = hash.indexOf("?");
  if (start === -1) return null;
  return new URLSearchParams(hash.slice(start + 1)).get(name);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const handleChange = () => setPath(currentPath());
    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  return path;
}
