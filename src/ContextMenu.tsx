import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useContextMenu } from "./store";
import { Icon } from "./icons";

const ICONS = {
  edit: Icon.Edit,
  copy: Icon.Copy,
  close: Icon.Close,
  plus: Icon.Plus,
  splitRight: Icon.SplitRight,
  splitDown: Icon.SplitDown,
} as const;

export function ContextMenu() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(menu.x, vw - w - 8);
    const top = Math.min(menu.y, vh - h - 8);
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, close]);

  if (!menu) return null;

  return (
    <>
      <div className="ctx-backdrop" onMouseDown={close} onContextMenu={(e) => {
        e.preventDefault();
        close();
      }} />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {menu.items.map((it, i) => {
          if (it.separator) return <div key={i} className="ctx-sep" />;
          const IconComp = it.icon ? ICONS[it.icon] : null;
          return (
            <button
              key={i}
              className={`ctx-item${it.danger ? " ctx-danger" : ""}`}
              disabled={it.disabled}
              onClick={() => {
                if (!it.disabled) {
                  it.onClick();
                  close();
                }
              }}
            >
              <span className="ctx-icon">
                {IconComp && <IconComp size={13} />}
              </span>
              <span className="ctx-label">{it.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
