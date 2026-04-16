import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConfirm, usePreview, useSidebar, useTabs } from "./store";

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

function shortName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function Sidebar() {
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const addTab = useTabs((s) => s.addTab);
  const setPreview = usePreview((s) => s.setPreview);
  const collapsed = useSidebar((s) => s.collapsed);
  const toggleCollapsed = useSidebar((s) => s.toggle);
  const askConfirm = useConfirm((s) => s.ask);

  const reload = useCallback(() => {
    invoke<ClaudeProject[]>("list_claude_projects")
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openShell = (cwd: string) => {
    addTab({
      id: crypto.randomUUID(),
      title: shortName(cwd),
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
      reload();
    } catch (e) {
      await askConfirm({
        title: "Failed to delete",
        message: String(e),
        confirmLabel: "OK",
      });
    }
  };

  const deleteProject = async (p: ClaudeProject, cwd: string) => {
    const ok = await askConfirm({
      title: "Delete project?",
      message: `${shortName(cwd)}\n\nAll ${p.sessions.length} session(s) will be removed. This cannot be undone.`,
      confirmLabel: "Delete all",
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("delete_claude_project", { path: p.path });
      reload();
    } catch (e) {
      await askConfirm({
        title: "Failed to delete",
        message: String(e),
        confirmLabel: "OK",
      });
    }
  };

  if (collapsed) {
    return (
      <div className="sidebar-collapsed">
        <button
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title="Show projects"
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Projects</span>
        <div style={styles.headerActions}>
          <button
            style={styles.newBtn}
            onClick={() =>
              addTab({
                id: crypto.randomUUID(),
                title: "shell",
                kind: "shell",
              })
            }
          >
            + shell
          </button>
          <button
            style={styles.collapseBtn}
            onClick={toggleCollapsed}
            title="Hide sidebar"
          >
            ‹
          </button>
        </div>
      </div>
      <div style={styles.list}>
        {projects.length === 0 && (
          <div style={styles.empty}>no ~/.claude/projects</div>
        )}
        {projects.map((p) => {
          const cwd = decodeProjectPath(p.name);
          const isOpen = expanded[p.name] ?? false;
          return (
            <div key={p.name} className="sb-project" style={styles.project}>
              <div
                style={styles.projectHeader}
                onClick={() =>
                  setExpanded((s) => ({ ...s, [p.name]: !isOpen }))
                }
              >
                <span style={styles.chev}>{isOpen ? "▾" : "▸"}</span>
                <span style={styles.projectName} title={cwd}>
                  {shortName(cwd)}
                </span>
                <span
                  className="sb-hover-btn"
                  style={styles.iconBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    openShell(cwd);
                  }}
                  title="new shell here"
                >
                  +
                </span>
                <span
                  className="sb-hover-btn sb-del"
                  style={styles.iconBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(p, cwd);
                  }}
                  title="delete project"
                >
                  ×
                </span>
              </div>
              {isOpen && (
                <div style={styles.sessions}>
                  {p.sessions.slice(0, 20).map((s) => (
                    <div
                      key={s.id}
                      className="sb-session"
                      style={styles.session}
                      title={s.first_message ?? s.id}
                      onClick={() => previewSession(s, cwd)}
                      onDoubleClick={() =>
                        openClaudeSession(s.cwd ?? cwd, s.id)
                      }
                    >
                      <span style={styles.sessionText}>
                        {s.first_message
                          ? s.first_message.slice(0, 40)
                          : s.id.slice(0, 8)}
                      </span>
                      <span
                        className="sb-hover-btn"
                        style={styles.sessionIcon}
                        title="resume in new tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          openClaudeSession(s.cwd ?? cwd, s.id);
                        }}
                      >
                        ▶
                      </span>
                      <span
                        className="sb-hover-btn sb-del"
                        style={styles.sessionIcon}
                        title="delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s);
                        }}
                      >
                        ×
                      </span>
                    </div>
                  ))}
                  {p.sessions.length === 0 && (
                    <div style={styles.empty}>no sessions</div>
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

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    background: "#141414",
    color: "#ddd",
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    borderRight: "1px solid #2a2a2a",
    height: "100%",
    flexShrink: 0,
  },
  header: {
    padding: "8px 10px",
    fontWeight: 600,
    borderBottom: "1px solid #2a2a2a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: { flex: 1 },
  headerActions: { display: "flex", gap: 4, alignItems: "center" },
  newBtn: {
    background: "#2a2a2a",
    color: "#ddd",
    border: "none",
    padding: "2px 6px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
  },
  collapseBtn: {
    background: "transparent",
    color: "#888",
    border: "1px solid #2a2a2a",
    borderRadius: 3,
    width: 20,
    height: 20,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    padding: 0,
  },
  list: { overflowY: "auto", flex: 1 },
  empty: { padding: 10, color: "#666", fontSize: 11 },
  project: { borderBottom: "1px solid #202020" },
  projectHeader: {
    padding: "5px 8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    userSelect: "none",
  },
  chev: { width: 12, color: "#777" },
  projectName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconBtn: {
    color: "#777",
    padding: "0 5px",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    borderRadius: 3,
  },
  sessions: { paddingLeft: 20, paddingBottom: 4 },
  session: {
    padding: "3px 8px",
    cursor: "pointer",
    color: "#aaa",
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  sessionText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sessionIcon: {
    color: "#666",
    padding: "0 5px",
    fontSize: 11,
    cursor: "pointer",
    lineHeight: 1,
    borderRadius: 3,
  },
};
