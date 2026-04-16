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
