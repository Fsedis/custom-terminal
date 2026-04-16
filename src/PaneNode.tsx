import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Pane, Split } from "./panes";
import { Terminal } from "./Terminal";
import { useContextMenu, usePaneDrag, useTabs, useToasts } from "./store";
import { Icon } from "./icons";

export const MIN_PANE_W = 260;
export const MIN_PANE_H = 160;

type Props = {
  tabId: string;
  pane: Pane;
  activeLeafId: string;
  siblingsCount: number;
};

export function PaneNode({ tabId, pane, activeLeafId, siblingsCount }: Props) {
  const setActiveLeaf = useTabs((s) => s.setActiveLeaf);
  const splitActive = useTabs((s) => s.splitActive);
  const closeLeaf = useTabs((s) => s.closeLeaf);
  const renameLeaf = useTabs((s) => s.renameLeaf);
  const pushToast = useToasts((s) => s.push);
  const openMenu = useContextMenu((s) => s.open);
  const leafRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (pane.kind !== "leaf") return;
    const el = leafRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pane.kind]);

  if (pane.kind === "leaf") {
    const isActive = pane.id === activeLeafId;
    const canSplitRight = size.w >= MIN_PANE_W * 2;
    const canSplitDown = size.h >= MIN_PANE_H * 2;

    const trySplit = (dir: "row" | "column") => {
      setActiveLeaf(tabId, pane.id);
      const ok = dir === "row" ? canSplitRight : canSplitDown;
      if (!ok) {
        pushToast({
          kind: "error",
          text:
            dir === "row"
              ? "Not enough width to split"
              : "Not enough height to split",
        });
        return;
      }
      splitActive(tabId, dir);
    };

    const showMenu = (x: number, y: number) => {
      setActiveLeaf(tabId, pane.id);
      openMenu(x, y, [
        {
          label: "Rename pane",
          icon: "edit",
          onClick: () => setEditing(true),
        },
        {
          label: "Split right",
          icon: "splitRight",
          disabled: !canSplitRight,
          onClick: () => trySplit("row"),
        },
        {
          label: "Split down",
          icon: "splitDown",
          disabled: !canSplitDown,
          onClick: () => trySplit("column"),
        },
        { label: "", onClick: () => {}, separator: true },
        {
          label: "Close pane",
          icon: "close",
          danger: true,
          disabled: siblingsCount <= 1,
          onClick: () => closeLeaf(tabId, pane.id),
        },
      ]);
    };

    return (
      <div
        ref={leafRef}
        data-leaf-id={pane.id}
        className={`pane-leaf${isActive ? " pane-active" : ""}`}
        onMouseDown={() => setActiveLeaf(tabId, pane.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          showMenu(e.clientX, e.clientY);
        }}
      >
        {siblingsCount > 1 && (
          <div className="pane-header" onMouseDown={(e) => e.stopPropagation()}>
            {editing ? (
              <PaneRenameInput
                initial={pane.title}
                onCommit={(v) => {
                  renameLeaf(tabId, pane.id, v);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <span
                className="pane-header-title"
                onDoubleClick={() => setEditing(true)}
                title="Double-click to rename"
              >
                {pane.title}
              </span>
            )}
          </div>
        )}
        <Terminal tabId={tabId} leaf={pane} active={isActive} />
        <div className="pane-actions" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className="pane-act"
            title="Rename pane"
            onClick={() => setEditing(true)}
          >
            <Icon.Edit size={12} />
          </button>
          <button
            className="pane-act"
            title="Split right (⌘D)"
            disabled={!canSplitRight}
            onClick={() => trySplit("row")}
          >
            <Icon.SplitRight size={12} />
          </button>
          <button
            className="pane-act"
            title="Split down (⌘⇧D)"
            disabled={!canSplitDown}
            onClick={() => trySplit("column")}
          >
            <Icon.SplitDown size={12} />
          </button>
          {siblingsCount > 1 && (
            <button
              className="pane-act pane-act-danger"
              title="Close pane (⌘W)"
              onClick={() => closeLeaf(tabId, pane.id)}
            >
              <Icon.Close size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <SplitNode
      tabId={tabId}
      split={pane}
      activeLeafId={activeLeafId}
      siblingsCount={siblingsCount}
    />
  );
}

function PaneRenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="pane-header-input"
      value={val}
      spellCheck={false}
      onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(val);
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(val)}
    />
  );
}

function SplitNode({
  tabId,
  split,
  activeLeafId,
  siblingsCount,
}: {
  tabId: string;
  split: Split;
  activeLeafId: string;
  siblingsCount: number;
}) {
  const setRatios = useTabs((s) => s.setRatios);
  const setGlobalDrag = usePaneDrag((s) => s.setDragging);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<{
    index: number;
    ratios: number[];
    total: number;
    start: number;
    min: number;
    pointerId: number;
    el: HTMLElement;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = split.direction === "row" ? rect.width : rect.height;
      const start = split.direction === "row" ? rect.left : rect.top;
      const minPx = split.direction === "row" ? MIN_PANE_W : MIN_PANE_H;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        index,
        ratios: [...split.ratios],
        total,
        start,
        min: minPx / total,
        pointerId: e.pointerId,
        el,
      };
      setDragging(true);
      setGlobalDrag(true);
    },
    [split.direction, split.ratios, setGlobalDrag],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragRef.current;
      if (!s) return;
      const pos =
        (split.direction === "row" ? e.clientX : e.clientY) - s.start;
      const frac = Math.max(0, Math.min(1, pos / s.total));

      let before = 0;
      for (let i = 0; i < s.index; i++) before += s.ratios[i];
      const pairSum = s.ratios[s.index] + s.ratios[s.index + 1];
      let left = frac - before;
      left = Math.max(s.min, Math.min(pairSum - s.min, left));
      const right = pairSum - left;

      const next = [...s.ratios];
      next[s.index] = left;
      next[s.index + 1] = right;
      s.ratios = next;

      for (let i = 0; i < next.length; i++) {
        const slot = slotRefs.current[i];
        if (slot) slot.style.flexBasis = `${next[i] * 100}%`;
      }
    },
    [split.direction],
  );

  const commitDrag = useCallback(() => {
    const s = dragRef.current;
    if (!s) return;
    try {
      s.el.releasePointerCapture(s.pointerId);
    } catch {}
    setRatios(tabId, split.id, s.ratios);
    dragRef.current = null;
    setDragging(false);
    setGlobalDrag(false);
  }, [setRatios, tabId, split.id, setGlobalDrag]);

  return (
    <div
      ref={containerRef}
      className={`pane-split pane-split-${split.direction}`}
    >
      {split.children.map((c, i) => (
        <Fragment key={c.id}>
          <div
            ref={(el) => {
              slotRefs.current[i] = el;
            }}
            className="pane-slot"
            style={{ flexBasis: `${split.ratios[i] * 100}%` }}
          >
            <PaneNode
              tabId={tabId}
              pane={c}
              activeLeafId={activeLeafId}
              siblingsCount={siblingsCount}
            />
          </div>
          {i < split.children.length - 1 && (
            <div
              className={`pane-splitter pane-splitter-${split.direction}${
                dragging ? " pane-splitter-active" : ""
              }`}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={commitDrag}
              onPointerCancel={commitDrag}
            >
              <span className="pane-splitter-grip" />
            </div>
          )}
        </Fragment>
      ))}
      {dragging && <div className="pane-drag-overlay" />}
    </div>
  );
}
