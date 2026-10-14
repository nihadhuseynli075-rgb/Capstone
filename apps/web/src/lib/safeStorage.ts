/**
 * Site storage that never throws.
 *
 * A browser set to keep no site data ("Don't allow sites to save data" in
 * Chrome, "Block all cookies" in Firefox) throws a SecurityError the moment
 * localStorage or sessionStorage is touched, and a full store throws on a
 * write. The saved language was read unguarded as the app started, so in
 * such a browser the whole site was a blank page.
 *
 * Every read and write goes through here instead. What the browser will not
 * keep is kept in memory for as long as the page is open, so a visit still
 * works from start to finish (a test can be built, sat and handed in) and
 * only what should outlast the tab is lost.
 */

type StorageName = "localStorage" | "sessionStorage";

export interface SafeStorage {
  getItem(key: string): string | null;
  /**
   * Whether the value reached the browser's store. False means it is only in
   * memory and gone on a reload, for the few callers with a better place to
   * send someone then (see saveLastResult).
   */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}

function createSafeStorage(name: StorageName): SafeStorage {
  // Values the browser refused. One here is newer than anything the browser's
  // own store holds under the same key, so it is read first.
  const memory = new Map<string, string>();

  return {
    getItem(key) {
      const kept = memory.get(key);
      if (kept !== undefined) return kept;

      try {
        return window[name].getItem(key);
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      try {
        window[name].setItem(key, value);
        memory.delete(key);
        return true;
      } catch {
        memory.set(key, value);
        return false;
      }
    },

    removeItem(key) {
      memory.delete(key);

      try {
        window[name].removeItem(key);
      } catch {
        // Out of reach, so nothing was ever written there.
      }
    }
  };
}

/** Kept on this device: the language, the theme, the guest key. */
export const safeLocalStorage = createSafeStorage("localStorage");

/** Kept for this tab only: the paper in progress, the last result, the admin's token. */
export const safeSessionStorage = createSafeStorage("sessionStorage");
