import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type UsageByModel = {
  model: string;
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
  cost_usd: number;
  messages: number;
};

export type SessionUsage = {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
  cost_usd: number;
  messages: number;
  by_model: UsageByModel[];
};

export type SessionCostEntry = {
  session_id: string;
  cost_usd: number;
  total_tokens: number;
};

const sessionCache = new Map<string, { mtime: number; data: SessionUsage }>();
const projectCache = new Map<
  string,
  { stamp: number; data: Map<string, SessionCostEntry> }
>();

export async function fetchSessionUsage(
  file: string,
  mtime: number,
): Promise<SessionUsage> {
  const cached = sessionCache.get(file);
  if (cached && cached.mtime === mtime) return cached.data;
  const data = await invoke<SessionUsage>("get_session_usage", { file });
  sessionCache.set(file, { mtime, data });
  return data;
}

export async function fetchProjectUsage(
  path: string,
  stamp: number,
): Promise<Map<string, SessionCostEntry>> {
  const cached = projectCache.get(path);
  if (cached && cached.stamp === stamp) return cached.data;
  const list = await invoke<SessionCostEntry[]>("get_project_usage", { path });
  const map = new Map(list.map((e) => [e.session_id, e]));
  projectCache.set(path, { stamp, data: map });
  return map;
}

export function useSessionUsage(file: string | null, mtime: number) {
  const [data, setData] = useState<SessionUsage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetchSessionUsage(file, mtime)
      .then((u) => !cancelled && setData(u))
      .catch((e) => !cancelled && setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [file, mtime]);
  return { data, err };
}

export function shortModel(model: string): string {
  // claude-opus-4-7-20260101 → opus 4.7
  const m = model.toLowerCase();
  const fam = m.includes("opus")
    ? "opus"
    : m.includes("haiku")
      ? "haiku"
      : m.includes("sonnet")
        ? "sonnet"
        : "claude";
  const ver = m.match(/-(\d+)-(\d+)/);
  if (ver) return `${fam} ${ver[1]}.${ver[2]}`;
  return fam;
}
