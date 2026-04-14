import { ModuleId, useModule } from "./store";

const modules: { id: ModuleId; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "▢" },
  { id: "files", label: "Files", icon: "▤" },
  { id: "web", label: "Web", icon: "◎" },
];

export function ModuleRail() {
  const { activeModule, setModule } = useModule();

  return (
    <div className="module-rail">
      {modules.map((m) => (
        <div
          key={m.id}
          className={"rail-item" + (activeModule === m.id ? " active" : "")}
          onClick={() => setModule(m.id)}
          title={m.label}
        >
          <div className="rail-icon">{m.icon}</div>
          <div className="rail-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
