import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Terminal } from "./Terminal";
import { TitleBar } from "./TitleBar";
import { ModuleRail } from "./ModuleRail";
import { Browser } from "./Browser";
import { SessionTimeline } from "./SessionTimeline";
import { SessionSidePanel } from "./SessionSidePanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toasts } from "./Toasts";
import { useTabs, useModule, useSidebar, useSidePanel } from "./store";
import { Icon } from "./icons";
import "./App.css";

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
  const { tabs, activeId, addTab, removeTab, setActive } = useTabs();
  const activeModule = useModule((s) => s.activeModule);
  const setModule = useModule((s) => s.setModule);
  const toggleSidebar = useSidebar((s) => s.toggle);
  const toggleSidePanel = useSidePanel((s) => s.toggle);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // ⌘T new shell
      if (e.key.toLowerCase() === "t" && !e.shiftKey && !isInput) {
        e.preventDefault();
        addTab({
          id: crypto.randomUUID(),
          title: "shell",
          kind: "shell",
        });
        return;
      }
      // ⌘W close tab
      if (e.key.toLowerCase() === "w" && !isInput) {
        if (activeId) {
          e.preventDefault();
          removeTab(activeId);
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
            setActive(tabs[i].id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tabs,
    activeId,
    addTab,
    removeTab,
    setActive,
    setModule,
    toggleSidebar,
    toggleSidePanel,
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
                    onNew={() =>
                      addTab({
                        id: crypto.randomUUID(),
                        title: "shell",
                        kind: "shell",
                      })
                    }
                  />
                )}
                {tabs.map((t) => (
                  <Terminal
                    key={t.id}
                    tabId={t.id}
                    cwd={t.cwd}
                    command={
                      t.kind === "claude" && t.sessionId
                        ? {
                            shell: "claude",
                            args: ["--resume", t.sessionId],
                          }
                        : undefined
                    }
                    active={t.id === activeId}
                  />
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
    </div>
  );
}

export default App;
