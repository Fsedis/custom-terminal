import { ReactElement } from "react";
import { ModuleId, useModule, useTabs } from "./store";
import { Icon } from "./icons";

const modules: {
  id: ModuleId;
  label: string;
  Icon: (p: { size?: number }) => ReactElement;
}[] = [
  { id: "terminal", label: "Terminal", Icon: Icon.Terminal },
  { id: "web", label: "Web", Icon: Icon.Globe },
  { id: "files", label: "Files", Icon: Icon.Files },
];

export function ModuleRail() {
  const { activeModule, setModule } = useModule();
  const tabs = useTabs((s) => s.tabs);

  return (
    <div className="module-rail">
      {modules.map((m) => {
        const active = activeModule === m.id;
        const badge = m.id === "terminal" ? tabs.length : 0;
        return (
          <button
            key={m.id}
            className={`rail-item${active ? " active" : ""}`}
            onClick={() => setModule(m.id)}
            title={m.label}
          >
            <div className="rail-icon">
              <m.Icon size={15} />
              {badge > 0 && <span className="rail-badge">{badge}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
