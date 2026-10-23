export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

export function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export const OPEN_PRACTICE = 'paper-helper-open-practice';
export function openPractice(detail: { id?: string; quick?: boolean; questionIds?: string[] } = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_PRACTICE, { detail }));
}
