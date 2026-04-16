import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabs, useSidePanel } from "./store";
import { Icon } from "./icons";
import { fetchSessionUsage, SessionUsage, shortModel } from "./usage";
import { formatCost, formatTokens } from "./utils";
import { findLeaf, firstLeaf } from "./panes";
import "./SessionSidePanel.css";

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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SessionSidePanel() {
  const { tabs, activeTabId, addTab } = useTabs();
  const open = useSidePanel((s) => s.open);
  const toggle = useSidePanel((s) => s.toggle);

  const tab = tabs.find((t) => t.id === activeTabId);
  const activeLeaf = tab
    ? (findLeaf(tab.root, tab.activeLeafId) ?? firstLeaf(tab.root))
    : null;
  const isClaude =
    !!activeLeaf &&
    activeLeaf.shell === "claude" &&
    !!activeLeaf.sessionId &&
    !!activeLeaf.cwd;

  const [file, setFile] = useState<string | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newSince, setNewSince] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isClaude || !activeLeaf) {
      setFile(null);
      setEvents([]);
      setErr(null);
      return;
    }
    const key = `${tab!.id}:${activeLeaf.id}`;
    if (prevTabIdRef.current !== key) {
      prevTabIdRef.current = key;
      setEvents([]);
      prevCountRef.current = 0;
      setNewSince(new Set());
    }
    let cancelled = false;
    invoke<string>("resolve_session_file", {
      cwd: activeLeaf.cwd!,
      sessionId: activeLeaf.sessionId!,
    })
      .then((f) => {
        if (!cancelled) {
          setFile(f);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [tab?.id, activeLeaf?.id, activeLeaf?.sessionId, activeLeaf?.cwd, isClaude]);

  useEffect(() => {
    if (!file || !open) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const list = await invoke<SessionEvent[]>(
          "read_claude_session_events",
          { file },
        );
        if (cancelled) return;
        setEvents((prev) => {
          if (
            prev.length === list.length &&
            prev[prev.length - 1]?.uuid === list[list.length - 1]?.uuid
          ) {
            return prev;
          }
          if (prev.length > 0 && list.length > prev.length) {
            const added = new Set(
              list.slice(prev.length).map((e) => e.uuid),
            );
            setNewSince(added);
            window.setTimeout(() => setNewSince(new Set()), 1600);
          }
          return list;
        });
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled)
          timer = window.setTimeout(tick, 1500);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [file, open]);

  useEffect(() => {
    if (!file) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    fetchSessionUsage(file, events.length)
      .then((u) => !cancelled && setUsage(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file, events.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstLoad = prevCountRef.current === 0 && events.length > 0;
    if (firstLoad) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else if (events.length > prevCountRef.current) {
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (nearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevCountRef.current = events.length;
  }, [events.length]);

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

  const forkFrom = async (uuid: string) => {
    if (!file || !activeLeaf) return;
    setBusy(true);
    try {
      const res = await invoke<{ session_id: string; file: string }>(
        "fork_claude_session",
        { file, uptoUuid: uuid },
      );
      addTab({
        title: `fork:${res.session_id.slice(0, 6)}`,
        cwd: activeLeaf.cwd,
        shell: "claude",
        sessionId: res.session_id,
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isClaude) return null;

  return (
    <div className={`ssp ${open ? "ssp-open" : "ssp-closed"}`}>
      <button
        className="ssp-toggle"
        onClick={toggle}
        title={open ? "Hide timeline" : "Show timeline"}
      >
        {open ? "›" : "‹"}
      </button>
      {open && (
        <div className="ssp-body">
          <div className="ssp-header">
            <div className="ssp-title">
              <span className="ssp-dot-live" />
              session timeline
            </div>
            <div className="ssp-sub">
              {activeLeaf!.sessionId!.slice(0, 8)} · {events.length} events
            </div>
            {usage && usage.messages > 0 && (
              <div className="ssp-usage">
                <div className="ssp-usage-row">
                  <span className="ssp-usage-cost">
                    {formatCost(usage.cost_usd)}
                  </span>
                  <span className="ssp-usage-total">
                    {formatTokens(
                      usage.input +
                        usage.output +
                        usage.cache_write +
                        usage.cache_read,
                    )}{" "}
                    tokens
                  </span>
                </div>
                <div className="ssp-usage-grid">
                  <span className="ssp-u-label">in</span>
                  <span className="ssp-u-val">{formatTokens(usage.input)}</span>
                  <span className="ssp-u-label">out</span>
                  <span className="ssp-u-val">{formatTokens(usage.output)}</span>
                  <span className="ssp-u-label">cache r</span>
                  <span className="ssp-u-val">
                    {formatTokens(usage.cache_read)}
                  </span>
                  <span className="ssp-u-label">cache w</span>
                  <span className="ssp-u-val">
                    {formatTokens(usage.cache_write)}
                  </span>
                </div>
                {usage.by_model.length > 1 && (
                  <div className="ssp-usage-models">
                    {usage.by_model.map((m) => (
                      <span key={m.model} className="ssp-usage-model">
                        <span className="ssp-um-name">{shortModel(m.model)}</span>
                        <span className="ssp-um-cost">
                          {formatCost(m.cost_usd)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="ssp-scroll" ref={scrollRef}>
            {err && <div className="ssp-err">{err}</div>}
            {!err && events.length === 0 && (
              <div className="ssp-empty">waiting for events…</div>
            )}
            {events.map((ev, i) => {
              const isFork = forkParents.has(ev.uuid);
              const isBranchChild =
                (childrenOf.get(ev.parent_uuid)?.length ?? 1) > 1;
              const isNew = newSince.has(ev.uuid);
              const last = i === events.length - 1;
              return (
                <div
                  key={ev.uuid}
                  className={`ssp-row ssp-${ev.role}${isNew ? " ssp-new" : ""}`}
                >
                  <div className="ssp-gutter">
                    <div
                      className={`ssp-dot ${isFork ? "ssp-dot-fork" : ""}`}
                    />
                    {!last && <div className="ssp-line" />}
                  </div>
                  <div className="ssp-content">
                    <div className="ssp-meta">
                      <span className="ssp-role">{ev.role}</span>
                      {ev.tool_name && (
                        <span className="ssp-tool">{ev.tool_name}</span>
                      )}
                      {ev.is_sidechain && (
                        <span className="ssp-tag ssp-tag-side">sidechain</span>
                      )}
                      {isBranchChild && (
                        <span className="ssp-tag ssp-tag-branch">branch</span>
                      )}
                      {isFork && (
                        <span className="ssp-tag ssp-tag-fork">
                          fork ×{childrenOf.get(ev.uuid)?.length ?? 0}
                        </span>
                      )}
                      <span className="ssp-ts">
                        {formatTime(ev.timestamp)}
                      </span>
                      <button
                        className="ssp-fork-chip"
                        onClick={() => forkFrom(ev.uuid)}
                        disabled={busy}
                        title="Fork a new session from this event"
                      >
                        <Icon.Fork size={10} />
                        <span>fork</span>
                      </button>
                    </div>
                    <div className="ssp-preview">
                      {ev.preview || <span className="ssp-dim">(empty)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
