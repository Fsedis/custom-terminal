import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useConfirm,
  useContextMenu,
  usePreview,
  useSidebar,
  useTabs,
  useToasts,
} from "./store";
import { Icon } from "./icons";
import { formatCost, relativeTime, shortBasename, timeBucket } from "./utils";
import { fetchProjectUsage, SessionCostEntry } from "./usage";
import { collectLeaves } from "./panes";

type ClaudeSession = {
  id: string;
  file: string;
  first_message: string | null;
  cwd: string | null;
  mtime: number;
};

type ClaudeProject = {
  name: string;
  path: string;
  sessions: ClaudeSession[];
};

function decodeProjectPath(name: string): string {
  if (name.startsWith("-")) return name.replace(/-/g, "/").replace(/^\//, "/");
  return name;
}

export function Sidebar() {
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [projUsage, setProjUsage] = useState<
    Record<string, Map<string, SessionCostEntry>>
  >({});

  const addTab = useTabs((s) => s.addTab);
  const tabs = useTabs((s) => s.tabs);
  const setPreview = usePreview((s) => s.setPreview);
  const collapsed = useSidebar((s) => s.collapsed);
  const toggleCollapsed = useSidebar((s) => s.toggle);
  const askConfirm = useConfirm((s) => s.ask);
  const pushToast = useToasts((s) => s.push);
  const openMenu = useContextMenu((s) => s.open);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setLoading(true);
    invoke<ClaudeProject[]>("list_claude_projects")
      .then((p) => setProjects(p))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadUsage = useCallback(
    (p: ClaudeProject) => {
      if (projUsage[p.path]) return;
      const stamp = p.sessions.reduce((a, s) => a + s.mtime, 0);
      fetchProjectUsage(p.path, stamp)
        .then((map) =>
          setProjUsage((u) => ({ ...u, [p.path]: map })),
        )
        .catch(() => {});
    },
    [projUsage],
  );

  const openShell = (cwd?: string) => {
    addTab({
      title: cwd ? shortBasename(cwd) : "shell",
      cwd,
      shell: "shell",
    });
  };

  const openClaudeSession = (cwd: string, sessionId: string) => {
    addTab({
      title: `claude:${sessionId.slice(0, 6)}`,
      cwd,
      shell: "claude",
      sessionId,
    });
  };

  const previewSession = (s: ClaudeSession, fallbackCwd: string) => {
    setPreview({
      file: s.file,
      sessionId: s.id,
      cwd: s.cwd ?? fallbackCwd,
      title: s.first_message ?? s.id,
    });
  };

  const deleteSession = async (s: ClaudeSession) => {
    const label = s.first_message
      ? s.first_message.slice(0, 80)
      : s.id.slice(0, 8);
    const ok = await askConfirm({
      title: "Delete session?",
      message: `${label}\n\nThis cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("delete_claude_session", { file: s.file });
      pushToast({ kind: "success", text: "Session deleted" });
      reload();
    } catch (e) {
      pushToast({ kind: "error", text: `Failed: ${e}` });
    }
  };

  const deleteProject = async (p: ClaudeProject, cwd: string) => {
    const ok = await askConfirm({
      title: "Delete project?",
      message: `${shortBasename(cwd)}\n\nAll ${p.sessions.length} session(s) will be removed.\nThis cannot be undone.`,
      confirmLabel: "Delete all",
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("delete_claude_project", { path: p.path });
      pushToast({ kind: "success", text: `Deleted ${shortBasename(cwd)}` });
      reload();
    } catch (e) {
      pushToast({ kind: "error", text: `Failed: ${e}` });
    }
  };

  const activeSessionIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tabs) {
      for (const l of collectLeaves(t.root)) {
        if (l.sessionId) set.add(l.sessionId);
      }
    }
    return set;
  }, [tabs]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects
      .map((p) => {
        const cwd = decodeProjectPath(p.name);
        const projMatch = cwd.toLowerCase().includes(q);
        const sessions = p.sessions.filter((s) =>
          projMatch
            ? true
            : (s.first_message ?? "").toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q),
        );
        if (projMatch || sessions.length > 0) {
          return { ...p, sessions };
        }
        return null;
      })
      .filter((p): p is ClaudeProject => p !== null);
  }, [projects, query]);

  useEffect(() => {
    if (query) {
      const map: Record<string, boolean> = {};
      filteredProjects.forEach((p) => (map[p.name] = true));
      setExpanded(map);
    }
  }, [query, filteredProjects]);

  if (collapsed) {
    return (
      <div className="sb-collapsed">
        <button
          className="sb-collapse-btn"
          onClick={toggleCollapsed}
          title="Show projects (⌘B)"
        >
          <Icon.Chevron size={12} />
        </button>
      </div>
    );
  }

  const totalSessions = projects.reduce((a, p) => a + p.sessions.length, 0);

  return (
    <div className="sb">
      <div className="sb-header">
        <div className="sb-header-row">
          <div className="sb-title">
            <Icon.Folder size={13} />
            <span>Projects</span>
            {totalSessions > 0 && (
              <span className="sb-count">{totalSessions}</span>
            )}
          </div>
          <div className="sb-header-actions">
            <button
              className="sb-icon-btn"
              onClick={() => openShell()}
              title="New shell (⌘T)"
            >
              <Icon.Plus size={13} />
            </button>
            <button
              className="sb-icon-btn"
              onClick={toggleCollapsed}
              title="Hide sidebar (⌘B)"
            >
              <Icon.ChevronLeft size={13} />
            </button>
          </div>
        </div>
        <div className="sb-search">
          <Icon.Search size={12} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions…"
            spellCheck={false}
          />
          {query && (
            <button
              className="sb-search-clear"
              onClick={() => setQuery("")}
              title="Clear"
            >
              <Icon.Close size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="sb-list thin-scroll">
        {loading && projects.length === 0 && (
          <div className="sb-skel">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sb-skel-row" />
            ))}
          </div>
        )}
        {!loading && filteredProjects.length === 0 && (
          <div className="sb-empty">
            {query ? (
              <>no matches for “{query}”</>
            ) : (
              <>no Claude projects yet</>
            )}
          </div>
        )}

        {filteredProjects.map((p) => {
          const cwd = decodeProjectPath(p.name);
          const isOpen = expanded[p.name] ?? false;
          const top = p.sessions[0];
          const bucket = top ? timeBucket(top.mtime) : "Older";
          const usageMap = projUsage[p.path];
          const projTotal = usageMap
            ? Array.from(usageMap.values()).reduce(
                (a, s) => a + s.cost_usd,
                0,
              )
            : 0;
          return (
            <div
              key={p.name}
              className={`sb-project${isOpen ? " open" : ""}`}
            >
              <div
                className="sb-project-header"
                onClick={() => {
                  const next = !isOpen;
                  setExpanded((s) => ({ ...s, [p.name]: next }));
                  if (next) loadUsage(p);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.clientX, e.clientY, [
                    {
                      label: "New shell here",
                      icon: "plus",
                      onClick: () => openShell(cwd),
                    },
                    {
                      label: "Copy path",
                      icon: "copy",
                      onClick: () => {
                        navigator.clipboard.writeText(cwd);
                        pushToast({ kind: "success", text: "Path copied" });
                      },
                    },
                    { label: "", onClick: () => {}, separator: true },
                    {
                      label: "Delete project",
                      icon: "close",
                      danger: true,
                      onClick: () => deleteProject(p, cwd),
                    },
                  ]);
                }}
                title={cwd}
              >
                <span className="sb-chev">
                  <Icon.Chevron size={11} />
                </span>
                <span className="sb-project-name">{shortBasename(cwd)}</span>
                <span className="sb-bucket">{bucket}</span>
                {projTotal > 0 && (
                  <span className="sb-cost" title="Total spend">
                    {formatCost(projTotal)}
                  </span>
                )}
                <span className="sb-proj-count">{p.sessions.length}</span>
                <button
                  className="sb-hover-btn sb-ghost"
                  title="New shell here"
                  onClick={(e) => {
                    e.stopPropagation();
                    openShell(cwd);
                  }}
                >
                  <Icon.Plus size={11} />
                </button>
                <button
                  className="sb-hover-btn sb-danger"
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(p, cwd);
                  }}
                >
                  <Icon.Trash size={11} />
                </button>
              </div>
              {isOpen && (
                <div className="sb-sessions">
                  {p.sessions.slice(0, 40).map((s) => {
                    const active = activeSessionIds.has(s.id);
                    const cost = usageMap?.get(s.id)?.cost_usd ?? 0;
                    return (
                      <div
                        key={s.id}
                        className={`sb-session${active ? " active" : ""}`}
                        title={s.first_message ?? s.id}
                        onClick={() => previewSession(s, cwd)}
                        onDoubleClick={() =>
                          openClaudeSession(s.cwd ?? cwd, s.id)
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openMenu(e.clientX, e.clientY, [
                            {
                              label: "Resume in new tab",
                              icon: "plus",
                              onClick: () =>
                                openClaudeSession(s.cwd ?? cwd, s.id),
                            },
                            {
                              label: "Copy session id",
                              icon: "copy",
                              onClick: () => {
                                navigator.clipboard.writeText(s.id);
                                pushToast({
                                  kind: "success",
                                  text: "Session id copied",
                                });
                              },
                            },
                            { label: "", onClick: () => {}, separator: true },
                            {
                              label: "Delete session",
                              icon: "close",
                              danger: true,
                              onClick: () => deleteSession(s),
                            },
                          ]);
                        }}
                      >
                        <span className="sb-session-dot" />
                        <span className="sb-session-text">
                          {s.first_message
                            ? s.first_message.slice(0, 60)
                            : s.id.slice(0, 8)}
                        </span>
                        {cost > 0 && (
                          <span className="sb-session-cost" title="Session cost">
                            {formatCost(cost)}
                          </span>
                        )}
                        <span className="sb-session-time">
                          {relativeTime(s.mtime)}
                        </span>
                        <button
                          className="sb-hover-btn sb-ghost"
                          title="Resume in new tab"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClaudeSession(s.cwd ?? cwd, s.id);
                          }}
                        >
                          <Icon.Play size={10} />
                        </button>
                        <button
                          className="sb-hover-btn sb-danger"
                          title="Delete session"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s);
                          }}
                        >
                          <Icon.Trash size={11} />
                        </button>
                      </div>
                    );
                  })}
                  {p.sessions.length === 0 && (
                    <div className="sb-empty sb-empty-sm">no sessions</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
