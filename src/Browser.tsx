import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const LABEL = "browser-main";

const PICKER_SCRIPT = `
(function () {
  if (window.__ctPickerActive) return;
  window.__ctPickerActive = true;
  var overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: 2147483647,
    cursor: 'crosshair', background: 'transparent'
  });
  var box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', border: '2px solid #4ea1ff',
    background: 'rgba(78,161,255,0.12)', pointerEvents: 'none',
    zIndex: 2147483647, transition: 'all 40ms'
  });
  document.body.append(overlay, box);
  var current = null;
  function pathOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      var s = el.tagName.toLowerCase();
      if (el.id) { s += '#' + el.id; parts.unshift(s); break; }
      if (el.className && typeof el.className === 'string') {
        s += '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.');
      }
      parts.unshift(s);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  overlay.addEventListener('mousemove', function (e) {
    overlay.style.pointerEvents = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = 'auto';
    if (!el || el === current) return;
    current = el;
    var r = el.getBoundingClientRect();
    Object.assign(box.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px'
    });
  });
  function cleanup() {
    overlay.remove(); box.remove();
    window.__ctPickerActive = false;
  }
  overlay.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    overlay.style.pointerEvents = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) { cleanup(); return; }
    var r = el.getBoundingClientRect();
    var info = {
      selector: pathOf(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').slice(0, 300),
      html: el.outerHTML.slice(0, 1200),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      url: location.href
    };
    if (window.__ct_post) window.__ct_post(info);
    cleanup();
  }, true);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') cleanup(); }, { once: true });
})();
`;

export function Browser() {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState("https://example.com");
  const [currentUrl, setCurrentUrl] = useState("https://example.com");
  const [picked, setPicked] = useState<any | null>(null);
  const createdRef = useRef(false);

  useEffect(() => {
    (window as any).__ctPicked = (info: any) => setPicked(info);
    return () => {
      delete (window as any).__ctPicked;
    };
  }, []);

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!placeholder) return;

    let disposed = false;

    const rectOf = () => {
      const r = placeholder.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };

    (async () => {
      const { x, y, w, h } = rectOf();
      if (w < 1 || h < 1) return;
      if (!createdRef.current) {
        try {
          await invoke("browser_create", {
            label: LABEL,
            url: currentUrl,
            x, y, w, h,
          });
          createdRef.current = true;
        } catch (e) {
          console.error("browser_create failed", e);
        }
      }
    })();

    const update = () => {
      if (!createdRef.current) return;
      const { x, y, w, h } = rectOf();
      if (w < 1 || h < 1) return;
      invoke("browser_resize", { label: LABEL, x, y, w, h });
    };

    const ro = new ResizeObserver(update);
    ro.observe(placeholder);
    window.addEventListener("resize", update);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("resize", update);
      invoke("browser_close", { label: LABEL }).catch(() => {});
      createdRef.current = false;
    };
  }, []);

  const normalize = (u: string) => {
    u = u.trim();
    if (!u) return currentUrl;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  };

  const go = () => {
    const u = normalize(urlInput);
    setCurrentUrl(u);
    setUrlInput(u);
    invoke("browser_navigate", { label: LABEL, url: u }).catch(console.error);
  };

  const reload = () => {
    invoke("browser_eval", {
      label: LABEL,
      script: "window.location.reload();",
    }).catch(() => {});
  };

  const back = () => {
    invoke("browser_eval", { label: LABEL, script: "history.back();" }).catch(() => {});
  };

  const forward = () => {
    invoke("browser_eval", { label: LABEL, script: "history.forward();" }).catch(() => {});
  };

  const pick = () => {
    invoke("browser_eval", { label: LABEL, script: PICKER_SCRIPT }).catch(console.error);
  };

  const copy = () => {
    if (picked) navigator.clipboard.writeText(JSON.stringify(picked, null, 2));
  };

  return (
    <div className="browser">
      <div className="browser-bar">
        <button className="bb-btn" onClick={back}>◀</button>
        <button className="bb-btn" onClick={forward}>▶</button>
        <button className="bb-btn" onClick={reload}>↻</button>
        <input
          className="bb-url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="https://..."
          spellCheck={false}
        />
        <button className="bb-btn" onClick={go}>Go</button>
        <button className="bb-btn bb-pick" onClick={pick} title="Pick element (Esc to cancel)">⌖</button>
      </div>
      <div className="browser-body">
        <div className="browser-frame" ref={placeholderRef} />
        {picked && (
          <div className="browser-picked">
            <div className="bp-header">
              <span className="bp-tag">{picked.tag}</span>
              <span className="bp-sel" title={picked.selector}>{picked.selector}</span>
              <button className="bp-btn" onClick={copy} title="Copy JSON">copy</button>
              <button className="bp-btn" onClick={() => setPicked(null)} title="Close">×</button>
            </div>
            <div className="bp-sections">
              {picked.text && (
                <div className="bp-section">
                  <div className="bp-label">text</div>
                  <div className="bp-text">{picked.text}</div>
                </div>
              )}
              {picked.html && (
                <div className="bp-section">
                  <div className="bp-label">html</div>
                  <pre className="bp-code">{picked.html}</pre>
                </div>
              )}
              {picked.rect && (
                <div className="bp-section">
                  <div className="bp-label">rect</div>
                  <div className="bp-rect">
                    x: {Math.round(picked.rect.x)} · y: {Math.round(picked.rect.y)} · w: {Math.round(picked.rect.w)} · h: {Math.round(picked.rect.h)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
