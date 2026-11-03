/**
 * schematic_embed.js
 * Bridge iframe <-> parent window (React) for pole schematic application.
 * Protocol version: 1
 */

(function () {
  // Only activate if we are running inside an iframe (window.self !== window.top)
  const isEmbedded = window.self !== window.top;
  if (!isEmbedded) return;

  document.documentElement.setAttribute("data-embed", "true");

  // Read allowed parent origins from meta tag or query param
  const metaOrigins = document.querySelector('meta[name="schematic-parent-origins"]');
  const allowedOrigins = new Set(
    (metaOrigins?.getAttribute("content") || "")
      .split(/\s+/)
      .filter(Boolean)
  );
  // Also allow URL param ?parentOrigin=...
  const urlParam = new URLSearchParams(window.location.search).get("parentOrigin");
  if (urlParam) {
    try {
      allowedOrigins.add(new URL(urlParam).origin);
    } catch (_) {}
  }
  // Common dev defaults
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://127.0.0.1:5173");

  let trustedOrigin = null;

  function isOriginAllowed(origin) {
    if (!origin) return false;
    if (allowedOrigins.has(origin)) return true;
    // Allow any localhost / 127.0.0.1 port in development
    try {
      const u = new URL(origin);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
      if (u.hostname.endsWith(".netlify.app")) return true;
    } catch (_) {}
    return false;
  }

  function postToParent(message) {
    if (!window.parent || window.parent === window) return;
    const target = trustedOrigin || "*";
    window.parent.postMessage(message, target);
  }

  function sendReady() {
    const host = window.schematicHost;
    postToParent({
      version: 1,
      type: "SCHEMATIC_READY",
      payload: {
        isReady: true,
        snapshot: host ? host.getSnapshot() : null
      }
    });
  }

  // Populate form fields from structured payload
  function setField(id, val) {
    const el = document.getElementById(id);
    if (!el || val === undefined || val === null) return;
    el.value = val;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyParametersToForm(payload = {}) {
    const {
      poles = [],
      arms = [],
      directObjects = [],
      overHeadWires = []
    } = payload;

    // Pole count
    const poleCount = Math.min(3, Math.max(1, poles.length || 1));
    setField("pole-count", String(poleCount));

    poles.slice(0, 3).forEach((p, idx) => {
      const i = idx + 1;
      setField(`pole-${i}-name`, p.name ?? `Pole ${i}`);
      setField(`pole-${i}-material`, p.material ?? "STK400");
      setField(`pole-${i}-type`, p.type ?? (p.Upper_D !== p.Lower_D ? "tapered" : "straight"));
      setField(`pole-${i}-diameter`, p.Lower_D ?? p.lowerDiameter ?? p.diameter);
      setField(`pole-${i}-upper-diameter`, p.Upper_D ?? p.upperDiameter ?? p.Lower_D ?? p.diameter);
      setField(`pole-${i}-thickness`, p.thickness ?? p.lowerThickness ?? p.t);
      setField(`pole-${i}-upper-thickness`, p.upperThickness ?? p.upper_t ?? p.thickness ?? p.lowerThickness);
      setField(`pole-${i}-height`, p.height ?? p.H ?? p.length);
      setField(`pole-${i}-quantity`, p.quantity ?? 1);
    });

    // Arm count
    const armCount = Math.min(2, Math.max(0, arms.length));
    setField("arm-count", String(armCount));

    arms.slice(0, 2).forEach((a, idx) => {
      const i = idx + 1;
      setField(`arm-${i}-name`, a.name ?? `Arm ${i}`);
      setField(`arm-${i}-material`, a.material ?? "STK400");
      setField(`arm-${i}-type`, a.type ?? "straight");
      setField(`arm-${i}-diameter`, a.diameter ?? a.Lower_D ?? a.Upper_D);
      setField(`arm-${i}-thickness`, a.thickness ?? a.t);
      setField(`arm-${i}-height`, a.height ?? a.H);
      setField(`arm-${i}-length`, a.length ?? a.L);
      setField(`arm-${i}-fix-angle`, a.fixAngle ?? 0);
      setField(`arm-${i}-vertical-angle`, a.verticalAngle ?? 0);
    });

    // Direct Object count
    const doCount = Math.min(1, Math.max(0, directObjects.length));
    setField("do-count", String(doCount));

    directObjects.slice(0, 1).forEach((d) => {
      setField("do-1-name", d.name ?? "Direct Object");
      setField("do-1-height", d.height ?? d.H);
      setField("do-1-quantity", d.quantity ?? 1);
    });

    // OHW count
    const ohwCount = Math.min(4, Math.max(0, overHeadWires.length));
    setField("ohw-count", String(ohwCount));

    overHeadWires.slice(0, 4).forEach((o, idx) => {
      const i = idx + 1;
      setField(`ohw-${i}-name`, o.name ?? `OHW ${i}`);
      setField(`ohw-${i}-weight`, o.weight ?? o.w);
      setField(`ohw-${i}-diameter`, o.diameter ?? o.d);
      setField(`ohw-${i}-height`, o.height ?? o.H);
      setField(`ohw-${i}-span`, o.span ?? o.S);
      setField(`ohw-${i}-fix-angle`, o.fixAngle ?? 0);
    });
  }

  // Handle messages from parent React app
  window.addEventListener("message", (event) => {
    if (!isOriginAllowed(event.origin)) return;
    trustedOrigin = event.origin;

    const { version, type, requestId, payload } = event.data || {};
    if (version !== 1) return;

    const host = window.schematicHost;
    if (!host) {
      postToParent({
        version: 1,
        type: "SCHEMATIC_ERROR",
        requestId,
        payload: { message: "Schematic host is not ready yet." }
      });
      return;
    }

    switch (type) {
      case "SET_PARAMETERS": {
        try {
          applyParametersToForm(payload);
          const replaceManual = Boolean(payload?.replaceManualEdit);
          let result = host.regenerate({ replaceManualEdit: replaceManual });
          if (replaceManual) {
            result = host.regenerate({ replaceManualEdit: true });
          }

          const snapshot = host.getSnapshot();
          if (result.blocked) {
            postToParent({
              version: 1,
              type: "SCHEMATIC_GENERATED",
              requestId,
              payload: {
                svg: snapshot.editedSvg ?? snapshot.generatedSvg,
                isStale: true,
                blocked: true,
                message: "Hasil manual dipertahankan. Konfirmasi replace jika ingin generate ulang."
              }
            });
            return;
          }

          if (!result.generated && !snapshot.generatedSvg) {
            postToParent({
              version: 1,
              type: "SCHEMATIC_ERROR",
              requestId,
              payload: { message: result.status || "Gagal generate schematic (cek parameter)." }
            });
            return;
          }

          postToParent({
            version: 1,
            type: "SCHEMATIC_GENERATED",
            requestId,
            payload: {
              svg: snapshot.generatedSvg,
              parameters: snapshot.parameters,
              isStale: false
            }
          });
        } catch (err) {
          postToParent({
            version: 1,
            type: "SCHEMATIC_ERROR",
            requestId,
            payload: { message: err.message || "Gagal memproses parameter." }
          });
        }
        break;
      }

      case "OPEN_EDITOR": {
        try {
          const snap = host.getSnapshot();
          if (!snap.generatedSvg) {
            host.regenerate({ replaceManualEdit: true });
          }
          host.openEditor();
        } catch (err) {
          postToParent({
            version: 1,
            type: "SCHEMATIC_ERROR",
            requestId,
            payload: { message: err.message || "Gagal membuka editor SVG." }
          });
        }
        break;
      }

      case "OPEN_PROJECT": {
        try {
          const project = payload?.project;
          const ok = host.restoreProject(project, { protectSnapshot: true });
          if (ok) {
            const snapshot = host.getSnapshot();
            postToParent({
              version: 1,
              type: "SCHEMATIC_GENERATED",
              requestId,
              payload: {
                svg: snapshot.editedSvg ?? snapshot.generatedSvg,
                parameters: snapshot.parameters,
                isStale: snapshot.stale
              }
            });
          }
        } catch (err) {
          postToParent({
            version: 1,
            type: "SCHEMATIC_ERROR",
            requestId,
            payload: { message: err.message || "Gagal membuka data proyek." }
          });
        }
        break;
      }

      case "GET_SNAPSHOT": {
        const snapshot = host.getSnapshot();
        postToParent({
          version: 1,
          type: "SCHEMATIC_SNAPSHOT",
          requestId,
          payload: { snapshot }
        });
        break;
      }

      default:
        break;
    }
  });

  // Listen for editor applied events
  window.addEventListener("schematic:applied", (event) => {
    postToParent({
      version: 1,
      type: "SCHEMATIC_APPLIED",
      payload: { svg: event.detail?.svg }
    });
  });

  // Listen for editor cancelled events
  window.addEventListener("schematic:editor-cancelled", () => {
    postToParent({
      version: 1,
      type: "SCHEMATIC_EDITOR_CANCELLED",
      payload: {}
    });
  });

  const autoOpenParam = new URLSearchParams(window.location.search).get("autoOpenEditor");
  function checkAutoOpen() {
    if (autoOpenParam === "true" || autoOpenParam === "1") {
      setTimeout(() => {
        try {
          if (window.schematicHost && window.schematicHost.getSnapshot()?.generatedSvg) window.schematicHost.openEditor();
        } catch (e) { console.warn("Auto open editor error:", e); }
      }, 200);
    }
  }

  // Signal ready when host initializes
  if (window.schematicHost) {
    sendReady();
    checkAutoOpen();
  } else {
    window.addEventListener("schematic:host-ready", () => {
      sendReady();
      checkAutoOpen();
    });
  }
})();
