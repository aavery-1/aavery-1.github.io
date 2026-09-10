// Temporary on-device overflow diagnostic. Renders ONLY when the URL contains
// `debugoverflow` (query or hash), so it is invisible to normal users. It exists
// because a right-edge control-clip reproduces on real iOS WebKit but not in any
// desktop-browser emulation, so we need numbers straight from the device: the
// visual vs layout viewport (distinguishes a real overflow from a zoom/scale
// offset), the exact rects of the clipped control stacks, and the widest
// offenders. Load the site on the phone with `?debugoverflow=1`, screenshot the
// green panel. Safe to leave in tree; remove once the layout bug is fixed.

import { useEffect, useState } from "react";

function debugOn(): boolean {
  return /debugoverflow/i.test(window.location.search) || /debugoverflow/i.test(window.location.hash);
}

export function OverflowDebug() {
  const [text, setText] = useState("measuring...");

  useEffect(() => {
    if (!debugOn()) return;
    const rectOf = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel}: (not found)`;
      const r = el.getBoundingClientRect();
      return `${sel}: L${Math.round(r.left)} R${Math.round(r.right)} W${Math.round(r.width)}`;
    };
    const measure = () => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      const vv = window.visualViewport;
      const offenders: string[] = [];
      const seen = new Set<string>();
      for (const el of document.querySelectorAll("*")) {
        if (el.closest("#overflow-debug")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.left < -2000) continue;
        if (r.right > vw + 0.5) {
          const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          const id = (el as HTMLElement).id ? "#" + (el as HTMLElement).id : "";
          const key = el.tagName + id + cls;
          if (seen.has(key)) continue;
          seen.add(key);
          offenders.push(`${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""} R${Math.round(r.right)} W${Math.round(r.width)}`);
        }
      }
      const lines = [
        `innerW ${window.innerWidth} clientW ${vw} scrollW ${de.scrollWidth} bodyScrollW ${document.body.scrollWidth}`,
        `dpr ${window.devicePixelRatio}`,
        vv ? `vv w ${Math.round(vv.width)} scale ${vv.scale.toFixed(3)} offL ${Math.round(vv.offsetLeft)} pageL ${Math.round(vv.pageLeft)}` : "no visualViewport",
        rectOf(".map-topright"),
        rectOf(".map-controls"),
        rectOf(".app-header"),
        `offenders (${offenders.length}):`,
        ...offenders.slice(0, 12),
        `UA: ${navigator.userAgent}`,
      ];
      setText(lines.join("\n"));
    };
    measure();
    const t = window.setInterval(measure, 1200);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);

  if (!debugOn()) return null;
  return (
    <pre
      id="overflow-debug"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 2147483647,
        margin: 0,
        maxWidth: "78vw",
        maxHeight: "70vh",
        overflow: "auto",
        background: "rgba(0,0,0,0.86)",
        color: "#00ff66",
        font: "10px/1.35 ui-monospace, monospace",
        padding: "6px 8px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        pointerEvents: "none",
      }}
    >
      {text}
    </pre>
  );
}
