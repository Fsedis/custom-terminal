import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { PaneNode } from "./PaneNode";
import { TitleBar } from "./TitleBar";
import { ModuleRail } from "./ModuleRail";
import { Browser } from "./Browser";
import { SessionTimeline } from "./SessionTimeline";
import { SessionSidePanel } from "./SessionSidePanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toasts } from "./Toasts";
import { ContextMenu } from "./ContextMenu";
import { useTabs, useModule, useSidebar, useSidePanel, useToasts } from "./store";
import { Icon } from "./icons";
import { Pane } from "./panes";
import { MIN_PANE_H, MIN_PANE_W } from "./PaneNode";
import "./App.css";

function countRootLeaves(p: Pane): number {
  if (p.kind === "leaf") return 1;
  return p.children.reduce((a, c) => a + countRootLeaves(c), 0);
}

function activeLeafRect(leafId: string): DOMRect | null {
  const el = document.querySelector(
    `.pane-leaf[data-leaf-id="${leafId}"]`,
  ) as HTMLElement | null;
  return el?.getBoundingClientRect() ?? null;
}

function canSplit(leafId: string, direction: "row" | "column"): boolean {
  const r = activeLeafRect(leafId);
  if (!r) return true;
  return direction === "row"
    ? r.width >= MIN_PANE_W * 2
    : r.height >= MIN_PANE_H * 2;
}

function ModulePlaceholder({ name }: { name: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{name}</div>
      <div className="placeholder-sub">module coming soon</div>
    </div>
  );
}

function TerminalEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="placeholder">
      <Icon.Terminal size={32} />
      <div className="placeholder-title">No tabs open</div>
      <div className="placeholder-sub">
        Press ⌘T to start a shell, or pick a session on the left.
      </div>
      <button className="confirm-btn confirm-primary" onClick={onNew}>
        New shell
      </button>
    </div>
  );
}

function App() {
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    splitActive,
    closeLeaf,
    focusLeafDelta,
  } = useTabs();
  const activeModule = useModule((s) => s.activeModule);
  const setModule = useModule((s) => s.setModule);
  const toggleSidebar = useSidebar((s) => s.toggle);
  const toggleSidePanel = useSidePanel((s) => s.toggle);
  const pushToast = useToasts((s) => s.push);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onContext);
    return () => window.removeEventListener("contextmenu", onContext);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const isXtermHelper =
        target?.classList.contains("xterm-helper-textarea") ?? false;
      const isInput =
        !isXtermHelper &&
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // ⌘T new shell
      if (e.key.toLowerCase() === "t" && !e.shiftKey && !isInput) {
        e.preventDefault();
        addTab({ title: "shell", shell: "shell" });
        return;
      }
      // ⌘W close active pane (or tab if last pane)
      if (e.key.toLowerCase() === "w" && !isInput) {
        if (activeTab) {
          e.preventDefault();
          closeLeaf(activeTab.id, activeTab.activeLeafId);
        }
        return;
      }
      // ⌘D split vertical (side-by-side)
      if (e.key.toLowerCase() === "d" && !e.shiftKey && !isInput) {
        if (activeTab) {
          e.preventDefault();
          if (canSplit(activeTab.activeLeafId, "row")) {
            splitActive(activeTab.id, "row");
          } else {
            pushToast({ kind: "error", text: "Not enough width to split" });
          }
        }
        return;
      }
      // ⌘⇧D split horizontal (stacked)
      if (e.key.toLowerCase() === "d" && e.shiftKey && !isInput) {
        if (activeTab) {
          e.preventDefault();
          if (canSplit(activeTab.activeLeafId, "column")) {
            splitActive(activeTab.id, "column");
          } else {
            pushToast({ kind: "error", text: "Not enough height to split" });
          }
        }
        return;
      }
      // ⌘[ / ⌘] cycle panes within tab
      if ((e.key === "[" || e.key === "]") && !isInput) {
        if (activeTab) {
          e.preventDefault();
          focusLeafDelta(activeTab.id, e.key === "]" ? 1 : -1);
        }
        return;
      }
      // ⌘B sidebar
      if (e.key.toLowerCase() === "b" && !isInput) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      // ⌘\  side panel (timeline)
      if (e.key === "\\" && !isInput) {
        e.preventDefault();
        toggleSidePanel();
        return;
      }
      // ⌘1..9 switch tab / module
      if (/^[1-9]$/.test(e.key) && !isInput) {
        const i = parseInt(e.key, 10) - 1;
        if (e.shiftKey) {
          const mods: ("terminal" | "web" | "files")[] = [
            "terminal",
            "web",
            "files",
          ];
          if (i < mods.length) {
            e.preventDefault();
            setModule(mods[i]);
          }
        } else {
          if (i < tabs.length) {
            e.preventDefault();
            setActiveTab(tabs[i].id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tabs,
    activeTab,
    addTab,
    removeTab,
    setActiveTab,
    setModule,
    toggleSidebar,
    toggleSidePanel,
    splitActive,
    closeLeaf,
    focusLeafDelta,
    pushToast,
  ]);

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <div className="main">
          {activeModule === "terminal" && (
            <div className="terminal-area">
              <div className="terminal-stack">
                {tabs.length === 0 && (
                  <TerminalEmptyState
                    onNew={() => addTab({ title: "shell", shell: "shell" })}
                  />
                )}
                {tabs.map((t) => (
                  <div
                    key={t.id}
                    className="tab-root"
                    style={{ display: t.id === activeTabId ? "flex" : "none" }}
                  >
                    <PaneNode
                      tabId={t.id}
                      pane={t.root}
                      activeLeafId={t.activeLeafId}
                      siblingsCount={countRootLeaves(t.root)}
                    />
                  </div>
                ))}
              </div>
              <SessionSidePanel />
            </div>
          )}
          {activeModule === "web" && <Browser />}
          {activeModule === "files" && <ModulePlaceholder name="files" />}
          <SessionTimeline />
        </div>
        <ModuleRail />
      </div>
      <ConfirmDialog />
      <Toasts />
      <ContextMenu />
    </div>
  );
}

export default App;
