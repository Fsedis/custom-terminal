import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useConfirm,
  usePreview,
  useSidebar,
  useTabs,
  useToasts,
} from "./store";
import { Icon } from "./icons";
import { relativeTime, shortBasename, timeBucket } from "./utils";

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

  const addTab = useTabs((s) => s.addTab);
  const tabs = useTabs((s) => s.tabs);
  const setPreview = usePreview((s) => s.setPreview);
  const collapsed = useSidebar((s) => s.collapsed);
  const toggleCollapsed = useSidebar((s) => s.toggle);
  const askConfirm = useConfirm((s) => s.ask);
  const pushToast = useToasts((s) => s.push);
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

  const openShell = (cwd?: string) => {
    addTab({
      id: crypto.randomUUID(),
      title: cwd ? shortBasename(cwd) : "shell",
      cwd,
      kind: "shell",
    });
  };

  const openClaudeSession = (cwd: string, sessionId: string) => {
    addTab({
      id: crypto.randomUUID(),
      title: `claude:${sessionId.slice(0, 6)}`,
      cwd,
      kind: "claude",
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

  const activeSessionIds = useMemo(
    () => new Set(tabs.filter((t) => t.sessionId).map((t) => t.sessionId!)),
    [tabs],
  );

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
          return (
            <div
              key={p.name}
              className={`sb-project${isOpen ? " open" : ""}`}
            >
              <div
                className="sb-project-header"
                onClick={() =>
                  setExpanded((s) => ({ ...s, [p.name]: !isOpen }))
                }
                title={cwd}
              >
                <span className="sb-chev">
                  <Icon.Chevron size={11} />
                </span>
                <span className="sb-project-name">{shortBasename(cwd)}</span>
                <span className="sb-bucket">{bucket}</span>
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
                    return (
                      <div
                        key={s.id}
                        className={`sb-session${active ? " active" : ""}`}
                        title={s.first_message ?? s.id}
                        onClick={() => previewSession(s, cwd)}
                        onDoubleClick={() =>
                          openClaudeSession(s.cwd ?? cwd, s.id)
                        }
                      >
                        <span className="sb-session-dot" />
                        <span className="sb-session-text">
                          {s.first_message
                            ? s.first_message.slice(0, 60)
                            : s.id.slice(0, 8)}
                        </span>
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
