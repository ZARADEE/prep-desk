import { API_BASE } from "./api";

const DEVICE_KEY = "paper-helper.sync-device.v1";
const SYNC_KEYS = ["todos", "target", "wrong", "history", "practiceSession", "practiceFilters", "timer"];

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const next = `desktop-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  localStorage.setItem(DEVICE_KEY, next);
  return next;
}

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `同步失败：${response.status}`);
  return payload as T;
}

type StateResponse = { ok: boolean; state: Record<string, { value: unknown; revision: number; updated_at: string }> };

export async function pullSyncState(keys: string[] = SYNC_KEYS): Promise<Record<string, unknown>> {
  const query = encodeURIComponent(keys.join(","));
  const result = await call<StateResponse>(`/sync/state?device_id=${encodeURIComponent(deviceId())}&keys=${query}`);
  return Object.fromEntries(Object.entries(result.state ?? {}).map(([key, item]) => [key, item.value]));
}

export async function pushSyncState(changes: Record<string, unknown>): Promise<void> {
  await call("/sync/state", { method: "POST", body: JSON.stringify({ device_id: deviceId(), changes }) });
}
