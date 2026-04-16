import { useEffect, useRef, useState } from "react";
import { useContextMenu, useTabs } from "./store";
import { Icon } from "./icons";
import {
  collectLeaves,
  findLeaf,
  firstLeaf,
  Leaf,
  Pane,
} from "./panes";

function displayLeaf(t: { root: Pane; activeLeafId: string }): Leaf {
  return findLeaf(t.root, t.activeLeafId) ?? firstLeaf(t.root);
}

export function TitleBar() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab } = useTabs();
  const renameLeaf = useTabs((s) => s.renameLeaf);
  const openMenu = useContextMenu((s) => s.open);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-trafficlights" data-tauri-drag-region />
      <div className="titlebar-tabs" data-tauri-drag-region>
        {tabs.map((t) => {
          const active = t.id === activeTabId;
          const leaf = displayLeaf(t);
          const isFork = leaf.title.startsWith("fork:");
          const paneCount = collectLeaves(t.root).length;
          return (
            <div
              key={t.id}
              className={`tbtab tbtab-${leaf.shell}${active ? " active" : ""}${
                isFork ? " tbtab-fork" : ""
              }`}
              onClick={() => setActiveTab(t.id)}
              onDoubleClick={() => {
                setActiveTab(t.id);
                setEditing(leaf.id);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  removeTab(t.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setActiveTab(t.id);
                openMenu(e.clientX, e.clientY, [
                  {
                    label: "Rename",
                    icon: "edit",
                    onClick: () => setEditing(leaf.id),
                  },
                  {
                    label: "Duplicate",
                    icon: "copy",
                    onClick: () =>
                      addTab({
                        title: leaf.title,
                        cwd: leaf.cwd,
                        shell: leaf.shell,
                      }),
                  },
                  { label: "", onClick: () => {}, separator: true },
                  {
                    label:
                      tabs.length > 1 ? "Close other tabs" : "Close other tabs",
                    onClick: () => {
                      tabs.forEach((x) => {
                        if (x.id !== t.id) removeTab(x.id);
                      });
                    },
                    disabled: tabs.length <= 1,
                  },
                  {
                    label: "Close tab",
                    icon: "close",
                    danger: true,
                    onClick: () => removeTab(t.id),
                  },
                ]);
              }}
              title={leaf.cwd ? `${leaf.title} — ${leaf.cwd}` : leaf.title}
            >
              <span className="tbtab-icon">
                {leaf.shell === "claude" ? (
                  isFork ? (
                    <Icon.Fork size={12} />
                  ) : (
                    <Icon.Sparkle size={12} />
                  )
                ) : (
                  <Icon.Terminal size={12} />
                )}
              </span>
              {editing === leaf.id ? (
                <RenameInput
                  initial={leaf.title}
                  onCommit={(v) => {
                    renameLeaf(t.id, leaf.id, v);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <span className="tbtab-title">{leaf.title}</span>
              )}
              {paneCount > 1 && (
                <span className="tbtab-panes" title={`${paneCount} panes`}>
                  {paneCount}
                </span>
              )}
              <button
                className="tbtab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(t.id);
                }}
                title="Close tab"
              >
                <Icon.Close size={11} />
              </button>
            </div>
          );
        })}
        <button
          className="tbtab-new"
          onClick={() => addTab({ title: "shell", shell: "shell" })}
          title="New shell (⌘T)"
        >
          <Icon.Plus size={13} />
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
    </div>
  );
}

function RenameInput({
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
      className="tbtab-rename"
      value={val}
      spellCheck={false}
      onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(val);
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(val)}
    />
  );
}
