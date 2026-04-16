import { useToasts } from "./store";

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismiss(t.id)}
        >
          <div className="toast-accent" />
          <div className="toast-text">{t.text}</div>
        </div>
      ))}
    </div>
  );
}
