import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Terminal } from "./Terminal";
import { useTabs } from "./store";
import "./App.css";

function App() {
  const { tabs, activeId, addTab, removeTab, setActive } = useTabs();

  useEffect(() => {
    if (tabs.length === 0) {
      addTab({ id: crypto.randomUUID(), title: "shell", kind: "shell" });
    }
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="tabs">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={"tab" + (t.id === activeId ? " active" : "")}
              onClick={() => setActive(t.id)}
            >
              <span className="tab-title">{t.title}</span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(t.id);
                }}
              >
                ×
              </span>
            </div>
          ))}
          <div
            className="tab new-tab"
            onClick={() =>
              addTab({
                id: crypto.randomUUID(),
                title: "shell",
                kind: "shell",
              })
            }
          >
            +
          </div>
        </div>
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
      </div>
    </div>
  );
}

export default App;
