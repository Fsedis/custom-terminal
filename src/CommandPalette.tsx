import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePalette, useTabs, useToasts } from "./store";
import { Icon } from "./icons";
import { findLeaf, firstLeaf } from "./panes";
import { MIN_PANE_H, MIN_PANE_W } from "./PaneNode";
import { relativeTime, shortBasename } from "./utils";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: keyof typeof ICONS;
  keywords?: string;
  run: () => void;
};

const ICONS = {
  sparkle: Icon.Sparkle,
  fork: Icon.Fork,
  splitRight: Icon.SplitRight,
  splitDown: Icon.SplitDown,
  folder: Icon.Folder,
  terminal: Icon.Terminal,
  play: Icon.Play,
} as const;

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
type ClaudeSkill = {
  name: string;
  description: string | null;
  kind: "command" | "skill";
};

// Claude Code built-in slash commands that are always available.
const BUILTIN_SLASH: { name: string; description: string }[] = [
  { name: "clear", description: "Start a new conversation" },
  { name: "compact", description: "Compact conversation context" },
  { name: "continue", description: "Continue the last session" },
  { name: "cost", description: "Show token usage and cost" },
  { name: "model", description: "Change the model" },
  { name: "memory", description: "Manage project memory" },
  { name: "status", description: "Show agent status" },
  { name: "help", description: "Show Claude Code help" },
];

function decodeProjectPath(name: string): string {
  if (name.startsWith("-")) return name.replace(/-/g, "/").replace(/^\//, "/");
  return name;
}

function scoreMatch(label: string, query: string): number {
  if (!query) return 1;
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l === q) return 1000;
  if (l.startsWith(q)) return 500 - l.length;
  const idx = l.indexOf(q);
  if (idx === 0) return 400 - l.length;
  if (idx > 0) return 200 - idx - l.length * 0.1;
  let li = 0;
  for (let i = 0; i < q.length; i++) {
    const found = l.indexOf(q[i], li);
    if (found === -1) return -1;
    li = found + 1;
  }
  return 50;
}

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const hide = usePalette((s) => s.hide);

  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const addTab = useTabs((s) => s.addTab);
  const splitActive = useTabs((s) => s.splitActive);
  const updateLeaf = useTabs((s) => s.updateLeaf);
  const pushToast = useToasts((s) => s.push);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [skills, setSkills] = useState<ClaudeSkill[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    invoke<ClaudeProject[]>("list_claude_projects")
      .then(setProjects)
      .catch(() => setProjects([]));
    invoke<ClaudeSkill[]>("list_claude_skills")
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [open]);

  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeLeaf = activeTab
    ? (findLeaf(activeTab.root, activeTab.activeLeafId) ??
      firstLeaf(activeTab.root))
    : null;

  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    const cwd = activeLeaf?.cwd;

    // ── Quick claude actions for the current context ──
    if (cwd) {
      out.push({
        id: "new-claude-here",
        label: "New Claude here",
        hint: shortBasename(cwd),
        group: "Claude",
        icon: "sparkle",
        run: () =>
          addTab({
            title: "claude",
            cwd,
            shell: "claude",
          }),
      });

      if (activeTab) {
        const canSplit = (dir: "row" | "column") => {
          const el = document.querySelector(
            `.pane-leaf[data-leaf-id="${activeLeaf!.id}"]`,
          ) as HTMLElement | null;
          if (!el) return true;
          const r = el.getBoundingClientRect();
          return dir === "row"
            ? r.width >= MIN_PANE_W * 2
            : r.height >= MIN_PANE_H * 2;
        };

        const splitWithClaude = (direction: "row" | "column") => {
          if (!canSplit(direction)) {
            pushToast({
              kind: "error",
              text:
                direction === "row"
                  ? "Not enough width to split"
                  : "Not enough height to split",
            });
            return;
          }
          splitActive(activeTab.id, direction);
          // The store sets the new leaf as active and it's always a shell.
          // Convert it into a claude leaf in the same cwd.
          setTimeout(() => {
            const t = useTabs
              .getState()
              .tabs.find((x) => x.id === activeTab.id);
            if (!t) return;
            updateLeaf(t.id, t.activeLeafId, {
              title: "claude",
              shell: "claude",
            });
          }, 0);
        };

        out.push({
          id: "split-claude-right",
          label: "Split right with Claude",
          hint: "⌘D then convert",
          group: "Claude",
          icon: "splitRight",
          run: () => splitWithClaude("row"),
        });
        out.push({
          id: "split-claude-down",
          label: "Split down with Claude",
          group: "Claude",
          icon: "splitDown",
          run: () => splitWithClaude("column"),
        });
      }
    }

    // Fork if active tab is a claude session
    if (activeLeaf?.shell === "claude" && activeLeaf.sessionId && cwd) {
      const leaf = activeLeaf;
      out.push({
        id: "fork-active",
        label: "Fork this Claude session",
        hint: leaf.sessionId!.slice(0, 8),
        group: "Claude",
        icon: "fork",
        run: async () => {
          try {
            const file = await invoke<string>("resolve_session_file", {
              cwd: cwd!,
              sessionId: leaf.sessionId!,
            });
            const events = await invoke<{ uuid: string }[]>(
              "read_claude_session_events",
              { file },
            );
            const last = events[events.length - 1];
            if (!last) {
              pushToast({ kind: "error", text: "Session has no events yet" });
              return;
            }
            const res = await invoke<{ session_id: string; file: string }>(
              "fork_claude_session",
              { file, uptoUuid: last.uuid },
            );
            addTab({
              title: `fork:${res.session_id.slice(0, 6)}`,
              cwd,
              shell: "claude",
              sessionId: res.session_id,
            });
          } catch (e) {
            pushToast({ kind: "error", text: `Fork failed: ${e}` });
          }
        },
      });
    }

    // Resume most recent claude session in the current cwd.
    if (cwd) {
      const proj = projects.find((p) => decodeProjectPath(p.name) === cwd);
      const last = proj?.sessions[0];
      if (last) {
        const label = last.first_message
          ? last.first_message.slice(0, 80)
          : last.id.slice(0, 8);
        out.push({
          id: "resume-last-here",
          label: `Resume last: ${label}`,
          hint: relativeTime(last.mtime),
          group: "Claude",
          icon: "sparkle",
          run: () =>
            addTab({
              title: `claude:${last.id.slice(0, 6)}`,
              cwd: last.cwd ?? cwd,
              shell: "claude",
              sessionId: last.id,
            }),
        });
      }
    }

    // ── Send a slash-command into the active Claude pty ──
    if (activeLeaf?.shell === "claude" && activeLeaf.ptyId) {
      const ptyId = activeLeaf.ptyId;
      const send = (name: string) =>
        invoke("pty_write", { id: ptyId, data: `/${name}\r` }).catch((e) =>
          pushToast({ kind: "error", text: `Send failed: ${e}` }),
        );

      BUILTIN_SLASH.forEach((s) => {
        out.push({
          id: `slash-${s.name}`,
          label: `/${s.name}`,
          hint: s.description,
          group: "Run in active Claude",
          icon: "play",
          keywords: s.description,
          run: () => send(s.name),
        });
      });

      skills.forEach((s) => {
        out.push({
          id: `skill-${s.kind}-${s.name}`,
          label: `/${s.name}`,
          hint: s.description ?? s.kind,
          group:
            s.kind === "skill" ? "Your skills" : "Your slash commands",
          icon: s.kind === "skill" ? "sparkle" : "play",
          keywords: s.description ?? undefined,
          run: () => send(s.name),
        });
      });
    }

    // ── New Claude in a different project ──
    projects.forEach((p) => {
      const projCwd = decodeProjectPath(p.name);
      if (projCwd === cwd) return;
      out.push({
        id: `new-in-${p.path}`,
        label: `New Claude in ${shortBasename(projCwd)}`,
        hint: projCwd,
        group: "New Claude in project",
        icon: "folder",
        keywords: projCwd,
        run: () =>
          addTab({
            title: `claude:${shortBasename(projCwd)}`,
            cwd: projCwd,
            shell: "claude",
          }),
      });
    });

    return out;
  }, [
    activeTab,
    activeLeaf,
    projects,
    skills,
    addTab,
    splitActive,
    updateLeaf,
    pushToast,
  ]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 200);
    const q = query.trim();
    const scored = commands
      .map((c) => {
        const s1 = scoreMatch(c.label, q);
        const s2 = c.keywords ? scoreMatch(c.keywords, q) * 0.6 : -1;
        const s3 = c.hint ? scoreMatch(c.hint, q) * 0.4 : -1;
        return { c, score: Math.max(s1, s2, s3) };
      })
      .filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 200).map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const groupedFiltered = useMemo(() => {
    const groups = new Map<string, { cmd: Cmd; idx: number }[]>();
    filtered.forEach((c, idx) => {
      const arr = groups.get(c.group) ?? [];
      arr.push({ cmd: c, idx });
      groups.set(c.group, arr);
    });
    return groups;
  }, [filtered]);

  if (!open) return null;

  const run = (c: Cmd) => {
    c.run();
    hide();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[index];
      if (c) run(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  };

  return (
    <div className="pal-overlay" onMouseDown={hide}>
      <div className="pal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input-row">
          <Icon.Sparkle size={14} />
          <input
            ref={inputRef}
            className="pal-input"
            placeholder="Claude action or session…"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="pal-hint">esc</span>
        </div>
        <div className="pal-list thin-scroll" ref={listRef}>
          {filtered.length === 0 && (
            <div className="pal-empty">no matches</div>
          )}
          {Array.from(groupedFiltered.entries()).map(([group, items]) => (
            <div key={group} className="pal-group">
              <div className="pal-group-title">{group}</div>
              {items.map(({ cmd, idx }) => {
                const IconComp = cmd.icon ? ICONS[cmd.icon] : null;
                return (
                  <button
                    key={cmd.id}
                    data-idx={idx}
                    className={`pal-item${idx === index ? " pal-active" : ""}`}
                    onMouseEnter={() => setIndex(idx)}
                    onClick={() => run(cmd)}
                  >
                    <span className="pal-icon">
                      {IconComp && <IconComp size={13} />}
                    </span>
                    <span className="pal-label">{cmd.label}</span>
                    {cmd.hint && <span className="pal-kbd">{cmd.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
