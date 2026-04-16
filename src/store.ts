import { create } from "zustand";
import {
  collectLeaves,
  firstLeaf,
  Leaf,
  makeLeaf,
  NewLeafInput,
  Pane,
  removeLeaf as removeLeafFromTree,
  splitLeaf,
  updateRatios,
} from "./panes";

export type ModuleId = "terminal" | "files" | "web";

export type Tab = {
  id: string;
  root: Pane;
  activeLeafId: string;
};

type ModuleState = {
  activeModule: ModuleId;
  setModule: (m: ModuleId) => void;
};

export const useModule = create<ModuleState>((set) => ({
  activeModule: "terminal",
  setModule: (m) => set({ activeModule: m }),
}));

export type PreviewSession = {
  file: string;
  sessionId: string;
  cwd: string;
  title: string;
};

type PreviewState = {
  preview: PreviewSession | null;
  setPreview: (p: PreviewSession | null) => void;
};

export const usePreview = create<PreviewState>((set) => ({
  preview: null,
  setPreview: (p) => set({ preview: p }),
}));

type SidePanelState = {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
};

export const useSidePanel = create<SidePanelState>((set) => ({
  open: true,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (v) => set({ open: v }),
}));

type SidebarState = {
  collapsed: boolean;
  toggle: () => void;
};

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));

type DragState = {
  dragging: boolean;
  setDragging: (v: boolean) => void;
};

export const usePaneDrag = create<DragState>((set) => ({
  dragging: false,
  setDragging: (v) => set({ dragging: v }),
}));

export type MenuItem = {
  label: string;
  onClick: () => void;
  icon?: "edit" | "copy" | "close" | "plus" | "splitRight" | "splitDown";
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
};

type ContextMenuState = {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  open: (x: number, y: number, items: MenuItem[]) => void;
  close: () => void;
};

export const useContextMenu = create<ContextMenuState>((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmState = {
  request: ConfirmRequest | null;
  resolver: ((ok: boolean) => void) | null;
  ask: (req: ConfirmRequest) => Promise<boolean>;
  resolve: (ok: boolean) => void;
};

export const useConfirm = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      set({ request: req, resolver: resolve });
    }),
  resolve: (ok) => {
    const r = get().resolver;
    set({ request: null, resolver: null });
    r?.(ok);
  },
}));

export type Toast = {
  id: string;
  kind: "info" | "success" | "error";
  text: string;
};

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 3600);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Persist UI prefs in localStorage without a middleware
const LS_KEY = "ct.ui.v1";
type Persisted = { sidebarCollapsed?: boolean; sidePanelOpen?: boolean };
function loadPersisted(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

const persisted = loadPersisted();

useSidebar.setState({ collapsed: persisted.sidebarCollapsed ?? false });
useSidePanel.setState({ open: persisted.sidePanelOpen ?? true });

useSidebar.subscribe((s) =>
  savePersisted({
    ...loadPersisted(),
    sidebarCollapsed: s.collapsed,
  }),
);
useSidePanel.subscribe((s) =>
  savePersisted({
    ...loadPersisted(),
    sidePanelOpen: s.open,
  }),
);

type TabsState = {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (input: NewLeafInput) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setActiveLeaf: (tabId: string, leafId: string) => void;
  updateLeaf: (tabId: string, leafId: string, patch: Partial<Leaf>) => void;
  splitActive: (tabId: string, direction: "row" | "column") => void;
  closeLeaf: (tabId: string, leafId: string) => void;
  setRatios: (tabId: string, splitId: string, ratios: number[]) => void;
  focusLeafDelta: (tabId: string, delta: number) => void;
  renameLeaf: (tabId: string, leafId: string, title: string) => void;
};

function tabFromLeaf(leaf: Leaf): Tab {
  return { id: crypto.randomUUID(), root: leaf, activeLeafId: leaf.id };
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (input) => {
    const leaf = makeLeaf(input);
    const tab = tabFromLeaf(leaf);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id
          ? tabs[tabs.length - 1]?.id ?? null
          : s.activeTabId;
      return { tabs, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  setActiveLeaf: (tabId, leafId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, activeLeafId: leafId } : t,
      ),
    })),

  updateLeaf: (tabId, leafId, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const walk = (p: Pane): Pane => {
          if (p.kind === "leaf")
            return p.id === leafId ? { ...p, ...patch } : p;
          return { ...p, children: p.children.map(walk) };
        };
        return { ...t, root: walk(t.root) };
      }),
    })),

  splitActive: (tabId, direction) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const activeLeaves = collectLeaves(t.root);
        const active =
          activeLeaves.find((l) => l.id === t.activeLeafId) ??
          activeLeaves[0];
        if (!active) return t;
        const newLeaf: Leaf = makeLeaf({
          title: "shell",
          cwd: active.cwd,
          shell: "shell",
        });
        const { root, newLeafId } = splitLeaf(
          t.root,
          active.id,
          direction,
          newLeaf,
        );
        return { ...t, root, activeLeafId: newLeafId };
      }),
    })),

  closeLeaf: (tabId, leafId) =>
    set((s) => {
      const tabs: Tab[] = [];
      let newActiveTabId = s.activeTabId;
      for (const t of s.tabs) {
        if (t.id !== tabId) {
          tabs.push(t);
          continue;
        }
        const next = removeLeafFromTree(t.root, leafId);
        if (!next) {
          if (newActiveTabId === tabId) newActiveTabId = null;
          continue;
        }
        const activeLeafId = firstLeaf(next).id;
        tabs.push({ ...t, root: next, activeLeafId });
      }
      if (!newActiveTabId && tabs.length > 0) {
        newActiveTabId = tabs[tabs.length - 1].id;
      }
      return { tabs, activeTabId: newActiveTabId };
    }),

  setRatios: (tabId, splitId, ratios) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== tabId ? t : { ...t, root: updateRatios(t.root, splitId, ratios) },
      ),
    })),

  focusLeafDelta: (tabId, delta) => {
    const t = get().tabs.find((x) => x.id === tabId);
    if (!t) return;
    const leaves = collectLeaves(t.root);
    if (leaves.length <= 1) return;
    const idx = leaves.findIndex((l) => l.id === t.activeLeafId);
    const next = leaves[(idx + delta + leaves.length) % leaves.length];
    set((s) => ({
      tabs: s.tabs.map((x) =>
        x.id === tabId ? { ...x, activeLeafId: next.id } : x,
      ),
    }));
  },

  renameLeaf: (tabId, leafId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const walk = (p: Pane): Pane => {
          if (p.kind === "leaf")
            return p.id === leafId ? { ...p, title: trimmed } : p;
          return { ...p, children: p.children.map(walk) };
        };
        return { ...t, root: walk(t.root) };
      }),
    }));
  },
}));
