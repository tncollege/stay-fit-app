import type { AppData } from "../lib/types";

export const STORE_KEY = "stayfitinlife_stable_react_1_0_0";

export interface StorageAdapter {
  load(): AppData | null;
  save(data: AppData): void;
  clear(): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly key: string) {}

  load() {
    const saved = localStorage.getItem(this.key);
    if (!saved) return null;

    try {
      return JSON.parse(saved) as AppData;
    } catch {
      localStorage.removeItem(this.key);
      return null;
    }
  }

  save(data: AppData) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }

  clear() {
    localStorage.removeItem(this.key);
  }
}

export const storageAdapter: StorageAdapter = new LocalStorageAdapter(STORE_KEY);
