import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Terminal } from "./Terminal";
import { TitleBar } from "./TitleBar";
import { ModuleRail } from "./ModuleRail";
import { Browser } from "./Browser";
import { useTabs, useModule } from "./store";
import "./App.css";

function ModulePlaceholder({ name }: { name: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{name}</div>
      <div className="placeholder-sub">module coming soon</div>
    </div>
  );
}

function App() {
  const { tabs, activeId, addTab } = useTabs();
  const activeModule = useModule((s) => s.activeModule);

  useEffect(() => {
    if (tabs.length === 0) {
      addTab({ id: crypto.randomUUID(), title: "shell", kind: "shell" });
    }
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <div className="main">
          {activeModule === "terminal" && (
            <div className="terminal-area">
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
          )}
          {activeModule === "web" && <Browser />}
          {activeModule === "files" && <ModulePlaceholder name="files" />}
        </div>
        <ModuleRail />
      </div>
    </div>
  );
}

export default App;
