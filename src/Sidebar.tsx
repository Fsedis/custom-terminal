import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabs } from "./store";

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
  // ~/.claude/projects/-Users-foo-bar → /Users/foo/bar
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

  useEffect(() => {
    invoke<ClaudeProject[]>("list_claude_projects")
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

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

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span>Projects</span>
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
      </div>
      <div style={styles.list}>
        {projects.length === 0 && (
          <div style={styles.empty}>no ~/.claude/projects</div>
        )}
        {projects.map((p) => {
          const cwd = decodeProjectPath(p.name);
          const isOpen = expanded[p.name] ?? false;
          return (
            <div key={p.name} style={styles.project}>
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
                  style={styles.plus}
                  onClick={(e) => {
                    e.stopPropagation();
                    openShell(cwd);
                  }}
                  title="new shell here"
                >
                  +
                </span>
              </div>
              {isOpen && (
                <div style={styles.sessions}>
                  {p.sessions.slice(0, 20).map((s) => (
                    <div
                      key={s.id}
                      style={styles.session}
                      title={s.first_message ?? s.id}
                      onClick={() => openClaudeSession(s.cwd ?? cwd, s.id)}
                    >
                      {s.first_message
                        ? s.first_message.slice(0, 40)
                        : s.id.slice(0, 8)}
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
  },
  header: {
    padding: "8px 10px",
    fontWeight: 600,
    borderBottom: "1px solid #2a2a2a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  newBtn: {
    background: "#2a2a2a",
    color: "#ddd",
    border: "none",
    padding: "2px 6px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
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
  plus: {
    color: "#777",
    padding: "0 4px",
    cursor: "pointer",
  },
  sessions: { paddingLeft: 20, paddingBottom: 4 },
  session: {
    padding: "3px 8px",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#aaa",
  },
};
