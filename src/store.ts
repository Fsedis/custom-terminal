import { create } from "zustand";

export type ModuleId = "terminal" | "files" | "web";

export type Tab = {
  id: string;
  title: string;
  ptyId?: string;
  cwd?: string;
  kind: "shell" | "claude";
  sessionId?: string;
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
  activeId: string | null;
  addTab: (tab: Tab) => void;
  removeTab: (id: string) => void;
  setActive: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
};

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  addTab: (tab) =>
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId =
        s.activeId === id ? tabs[tabs.length - 1]?.id ?? null : s.activeId;
      return { tabs, activeId };
    }),
  setActive: (id) => set({ activeId: id }),
  updateTab: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
}));
