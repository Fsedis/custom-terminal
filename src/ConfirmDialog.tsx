import { useEffect, useRef } from "react";
import { useConfirm } from "./store";

export function ConfirmDialog() {
  const request = useConfirm((s) => s.request);
  const resolve = useConfirm((s) => s.resolve);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolve(false);
      if (e.key === "Enter") resolve(true);
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => confirmBtnRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [request, resolve]);

  if (!request) return null;

  return (
    <div className="confirm-overlay" onClick={() => resolve(false)}>
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{request.title}</div>
        <div className="confirm-msg">{request.message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={() => resolve(false)}>
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            className={`confirm-btn ${request.danger ? "confirm-danger" : "confirm-primary"}`}
            onClick={() => resolve(true)}
          >
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
