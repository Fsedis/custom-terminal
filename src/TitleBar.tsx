import { useTabs } from "./store";
import { Icon } from "./icons";

export function TitleBar() {
  const { tabs, activeId, addTab, removeTab, setActive } = useTabs();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-trafficlights" data-tauri-drag-region />
      <div className="titlebar-tabs" data-tauri-drag-region>
        {tabs.map((t) => {
          const active = t.id === activeId;
          const isFork = t.title.startsWith("fork:");
          return (
            <div
              key={t.id}
              className={`tbtab tbtab-${t.kind}${active ? " active" : ""}${
                isFork ? " tbtab-fork" : ""
              }`}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  removeTab(t.id);
                }
              }}
              title={t.cwd ? `${t.title} — ${t.cwd}` : t.title}
            >
              <span className="tbtab-icon">
                {t.kind === "claude" ? (
                  isFork ? (
                    <Icon.Fork size={12} />
                  ) : (
                    <Icon.Sparkle size={12} />
                  )
                ) : (
                  <Icon.Terminal size={12} />
                )}
              </span>
              <span className="tbtab-title">{t.title}</span>
              <button
                className="tbtab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(t.id);
                }}
                title="Close tab (⌘W)"
              >
                <Icon.Close size={11} />
              </button>
            </div>
          );
        })}
        <button
          className="tbtab-new"
          onClick={() =>
            addTab({
              id: crypto.randomUUID(),
              title: "shell",
              kind: "shell",
            })
          }
          title="New shell (⌘T)"
        >
          <Icon.Plus size={13} />
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
    </div>
  );
}
