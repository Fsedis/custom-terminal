import { useTabs } from "./store";

export function TitleBar() {
  const { tabs, activeId, addTab, removeTab, setActive } = useTabs();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-trafficlights" data-tauri-drag-region />
      <div className="titlebar-tabs" data-tauri-drag-region>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={"tbtab" + (t.id === activeId ? " active" : "")}
            onClick={() => setActive(t.id)}
            title={t.cwd ?? t.title}
          >
            <span className="tbtab-title">{t.title}</span>
            <span
              className="tbtab-close"
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
          className="tbtab-new"
          onClick={() =>
            addTab({
              id: crypto.randomUUID(),
              title: "shell",
              kind: "shell",
            })
          }
          title="new tab"
        >
          +
        </div>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
    </div>
  );
}
