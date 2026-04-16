export function relativeTime(mtimeSec: number): string {
  if (!mtimeSec) return "";
  const now = Date.now() / 1000;
  const diff = now - mtimeSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w`;
  return new Date(mtimeSec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function timeBucket(mtimeSec: number): string {
  if (!mtimeSec) return "Older";
  const now = new Date();
  const d = new Date(mtimeSec * 1000);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (isYest) return "Yesterday";
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Older";
}

export function shortBasename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function formatCost(usd: number): string {
  if (!isFinite(usd) || usd <= 0) return "";
  if (usd < 0.01) return "<$0.01";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(1)}`;
  return `$${Math.round(usd)}`;
}

export function formatTokens(n: number): string {
  if (!isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}
