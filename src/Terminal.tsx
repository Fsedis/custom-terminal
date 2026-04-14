import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { useTabs } from "./store";

type Props = {
  tabId: string;
  cwd?: string;
  command?: { shell?: string; args?: string[] };
  active: boolean;
};

export function Terminal({ tabId, cwd, command, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const updateTab = useTabs((s) => s.updateTab);

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
      windowsMode: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

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

    const doResize = () => {
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
      if (!doResize()) return;
      spawned = true;

      const cols = term.cols;
      const rows = term.rows;

      const ptyId = await invoke<string>("pty_spawn", {
        opts: {
          cwd,
          cols,
          rows,
          shell: command?.shell,
          args: command?.args,
        },
      });
      if (disposed) {
        invoke("pty_kill", { id: ptyId });
        return;
      }
      ptyIdRef.current = ptyId;
      updateTab(tabId, { ptyId });

      unlistenData = await listen<{ id: string; data: string }>(
        "pty://data",
        (e) => {
          if (e.payload.id === ptyId) term.write(e.payload.data);
        }
      );
      unlistenExit = await listen<{ id: string }>("pty://exit", (e) => {
        if (e.payload.id === ptyId)
          term.write("\r\n\x1b[33m[process exited]\x1b[0m\r\n");
      });

      term.onData((data) => {
        invoke("pty_write", { id: ptyId, data });
      });
      term.onResize(({ cols, rows }) => {
        if (ptyIdRef.current)
          invoke("pty_resize", { id: ptyIdRef.current, cols, rows });
      });
    };

    const ro = new ResizeObserver(() => {
      if (!spawned) {
        trySpawn();
      } else {
        doResize();
      }
    });
    ro.observe(container);

    requestAnimationFrame(() => requestAnimationFrame(trySpawn));

    return () => {
      disposed = true;
      ro.disconnect();
      unlistenData?.();
      unlistenExit?.();
      if (ptyIdRef.current) invoke("pty_kill", { id: ptyIdRef.current });
      term.dispose();
    };
  }, [tabId]);

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

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: active ? "block" : "none",
        background: "#1a1a1a",
        padding: "4px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    />
  );
}
