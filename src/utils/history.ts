/** Local, opt-in, metadata-only history. Never stores files, passwords, keys or decrypted content. */
export interface HistoryEntry {
  id: string;
  kind: 'encode' | 'decode';
  at: string; // ISO date
  fileName: string;
  size: number;
  parts: number;
  ok: boolean;
}

const KEY = 'pixti.history.v1';
const MAX = 100;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as HistoryEntry[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addHistory(e: Omit<HistoryEntry, 'id' | 'at'>): void {
  try {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
    const next = [{ ...e, id, at: new Date().toISOString() }, ...loadHistory()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
