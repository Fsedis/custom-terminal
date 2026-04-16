import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePreview, useTabs } from "./store";

type SessionEvent = {
  uuid: string;
  parent_uuid: string | null;
  role: "user" | "assistant";
  timestamp: string | null;
  preview: string;
  tool_name: string | null;
  is_sidechain: boolean;
};

function formatTime(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionTimeline() {
  const preview = usePreview((s) => s.preview);
  const setPreview = usePreview((s) => s.setPreview);
  const addTab = useTabs((s) => s.addTab);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    setLoading(true);
    setErr(null);
    invoke<SessionEvent[]>("read_claude_session_events", {
      file: preview.file,
    })
      .then((e) => setEvents(e))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [preview?.file]);

  const { childrenOf, forkParents } = useMemo(() => {
    const childrenOf = new Map<string | null, string[]>();
    for (const ev of events) {
      const key = ev.parent_uuid;
      const arr = childrenOf.get(key) ?? [];
      arr.push(ev.uuid);
      childrenOf.set(key, arr);
    }
    const forkParents = new Set<string>();
    for (const [parent, kids] of childrenOf) {
      if (parent && kids.length > 1) forkParents.add(parent);
    }
    return { childrenOf, forkParents };
  }, [events]);

  if (!preview) return null;

  const resume = () => {
    addTab({
      id: crypto.randomUUID(),
      title: `claude:${preview.sessionId.slice(0, 6)}`,
      cwd: preview.cwd,
      kind: "claude",
      sessionId: preview.sessionId,
    });
    setPreview(null);
  };

  const forkFrom = async (uuid: string) => {
    try {
      const res = await invoke<{ session_id: string; file: string }>(
        "fork_claude_session",
        { file: preview.file, uptoUuid: uuid },
      );
      addTab({
        id: crypto.randomUUID(),
        title: `fork:${res.session_id.slice(0, 6)}`,
        cwd: preview.cwd,
        kind: "claude",
        sessionId: res.session_id,
      });
      setPreview(null);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div style={styles.overlay} onClick={() => setPreview(null)}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>
            <div style={styles.titleMain}>{preview.title}</div>
            <div style={styles.titleSub}>
              {preview.sessionId} · {preview.cwd}
            </div>
          </div>
          <div style={styles.actions}>
            <button style={styles.btnPrimary} onClick={resume}>
              Resume session
            </button>
            <button style={styles.btn} onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
        </div>
        <div style={styles.body}>
          {loading && <div style={styles.empty}>loading…</div>}
          {err && <div style={styles.err}>{err}</div>}
          {!loading && !err && events.length === 0 && (
            <div style={styles.empty}>no events</div>
          )}
          {events.map((ev, i) => {
            const isFork = forkParents.has(ev.uuid);
            const siblingCount =
              childrenOf.get(ev.parent_uuid)?.length ?? 1;
            const isBranchChild = siblingCount > 1;
            return (
              <div key={ev.uuid} style={styles.row}>
                <div style={styles.gutter}>
                  <div
                    style={{
                      ...styles.dot,
                      background:
                        ev.role === "user" ? "#6aa8ff" : "#b88bff",
                      outline: isFork ? "2px solid #ffb86b" : "none",
                    }}
                  />
                  {i < events.length - 1 && <div style={styles.line} />}
                </div>
                <div style={styles.content}>
                  <div style={styles.meta}>
                    <span style={styles.role}>
                      {ev.role}
                      {ev.tool_name ? ` · ${ev.tool_name}` : ""}
                      {ev.is_sidechain ? " · sidechain" : ""}
                    </span>
                    <span style={styles.ts}>{formatTime(ev.timestamp)}</span>
                    {isBranchChild && (
                      <span style={styles.branchTag}>branch</span>
                    )}
                    {isFork && (
                      <span style={styles.forkTag}>fork ×{
                        childrenOf.get(ev.uuid)?.length ?? 0
                      }</span>
                    )}
                    <span style={styles.spacer} />
                    <button
                      style={styles.rowBtn}
                      onClick={() => forkFrom(ev.uuid)}
                      title="Create new session from this point"
                    >
                      fork from here
                    </button>
                  </div>
                  <div style={styles.preview}>
                    {ev.preview || <span style={styles.dim}>(empty)</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    justifyContent: "center",
    alignItems: "stretch",
    zIndex: 50,
    padding: 24,
  },
  panel: {
    background: "#161616",
    color: "#ddd",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    width: "min(860px, 100%)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontSize: 12,
  },
  header: {
    padding: "10px 14px",
    borderBottom: "1px solid #2a2a2a",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  title: { flex: 1, overflow: "hidden" },
  titleMain: {
    fontWeight: 600,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  titleSub: { color: "#777", fontSize: 11, marginTop: 2 },
  actions: { display: "flex", gap: 6 },
  btn: {
    background: "#2a2a2a",
    color: "#ddd",
    border: "none",
    padding: "5px 10px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
  },
  btnPrimary: {
    background: "#3b6fd6",
    color: "#fff",
    border: "none",
    padding: "5px 10px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
  },
  body: {
    overflowY: "auto",
    padding: "10px 14px",
    flex: 1,
  },
  empty: { color: "#666", padding: 12 },
  err: { color: "#ff7777", padding: 12 },
  row: { display: "flex", gap: 10, alignItems: "stretch" },
  gutter: {
    width: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  line: { width: 1, flex: 1, background: "#2a2a2a", marginTop: 2 },
  content: { flex: 1, padding: "2px 0 10px 0", minWidth: 0 },
  meta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "#888",
    fontSize: 11,
  },
  role: { color: "#aaa" },
  ts: { color: "#666" },
  branchTag: {
    color: "#ffb86b",
    border: "1px solid #5a4a2a",
    padding: "0 4px",
    borderRadius: 2,
    fontSize: 10,
  },
  forkTag: {
    color: "#ffb86b",
    background: "#3a2a12",
    padding: "0 4px",
    borderRadius: 2,
    fontSize: 10,
  },
  preview: {
    marginTop: 3,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#ccc",
    lineHeight: 1.45,
  },
  dim: { color: "#555" },
  spacer: { flex: 1 },
  rowBtn: {
    background: "transparent",
    color: "#7fbfff",
    border: "1px solid #2a3a55",
    borderRadius: 3,
    padding: "1px 6px",
    fontSize: 10,
    cursor: "pointer",
    opacity: 0.7,
  },
};
