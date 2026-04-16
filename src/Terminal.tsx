import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { usePaneDrag, useTabs } from "./store";
import { Leaf } from "./panes";

type Props = {
  tabId: string;
  leaf: Leaf;
  active: boolean;
};

export function Terminal({ tabId, leaf, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const updateLeaf = useTabs((s) => s.updateLeaf);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: '"SF Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: { background: "#1a1a1a", foreground: "#e0e0e0" },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown") return true;
      const mod = ev.metaKey || ev.ctrlKey;
      if (!mod) return true;
      const k = ev.key.toLowerCase();
      if (
        k === "t" ||
        k === "w" ||
        k === "d" ||
        k === "b" ||
        k === "\\" ||
        k === "[" ||
        k === "]" ||
        /^[1-9]$/.test(ev.key)
      ) {
        return false;
      }
      return true;
    });

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("WebGL renderer failed, falling back to DOM", e);
    }

    termRef.current = term;
    fitRef.current = fit;

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let disposed = false;
    let spawned = false;

    let resizeRaf = 0;
    let pendingSize: { cols: number; rows: number } | null = null;
    const flushResize = () => {
      resizeRaf = 0;
      if (!pendingSize || !ptyIdRef.current) return;
      invoke("pty_resize", {
        id: ptyIdRef.current,
        cols: pendingSize.cols,
        rows: pendingSize.rows,
      });
      pendingSize = null;
    };

    const doFit = () => {
      if (!container.clientWidth || !container.clientHeight) return false;
      try {
        fit.fit();
      } catch {
        return false;
      }
      if (term.cols < 2 || term.rows < 2) return false;
      return true;
    };

    const trySpawn = async () => {
      if (spawned || disposed) return;
      if (!doFit()) return;
      spawned = true;

      const cols = term.cols;
      const rows = term.rows;

      const opts: Record<string, unknown> = {
        cwd: leaf.cwd,
        cols,
        rows,
      };
      if (leaf.shell === "claude" && leaf.sessionId) {
        opts.shell = "claude";
        opts.args = ["--resume", leaf.sessionId];
      }

      const ptyId = await invoke<string>("pty_spawn", { opts });
      if (disposed) {
        invoke("pty_kill", { id: ptyId });
        return;
      }
      ptyIdRef.current = ptyId;
      updateLeaf(tabId, leaf.id, { ptyId });

      unlistenData = await listen<{ id: string; data: string }>(
        "pty://data",
        (e) => {
          if (e.payload.id === ptyId) term.write(e.payload.data);
        },
      );
      unlistenExit = await listen<{ id: string }>("pty://exit", (e) => {
        if (e.payload.id === ptyId)
          term.write("\r\n\x1b[33m[process exited]\x1b[0m\r\n");
      });

      term.onData((data) => {
        invoke("pty_write", { id: ptyId, data });
      });
      term.onResize(({ cols, rows }) => {
        pendingSize = { cols, rows };
        if (!resizeRaf) resizeRaf = requestAnimationFrame(flushResize);
      });
    };

    let fitRaf = 0;
    const scheduleFit = () => {
      if (fitRaf) return;
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0;
        if (usePaneDrag.getState().dragging) return;
        if (!spawned) trySpawn();
        else doFit();
      });
    };

    const ro = new ResizeObserver(scheduleFit);
    ro.observe(container);

    const unsubDrag = usePaneDrag.subscribe((s, prev) => {
      if (prev.dragging && !s.dragging) {
        requestAnimationFrame(() => {
          if (!spawned) trySpawn();
          else doFit();
        });
      }
    });

    requestAnimationFrame(() => requestAnimationFrame(trySpawn));

    return () => {
      disposed = true;
      ro.disconnect();
      unsubDrag();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (fitRaf) cancelAnimationFrame(fitRaf);
      unlistenData?.();
      unlistenExit?.();
      if (ptyIdRef.current) invoke("pty_kill", { id: ptyIdRef.current });
      term.dispose();
    };
  }, [leaf.id]);

  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {}
        termRef.current?.focus();
      });
    }
  }, [active]);

  return <div ref={containerRef} className="pane-xterm" />;
}
