// SVG editor integration boundary. DrawingEngine remains independent.
// Keep editor lifecycle/import/export code here, separate from DrawingEngine.

export function createSchematicEditorState() {
  let generatedSvg = "";
  let editedSvg = null;

  return {
    // Call only after the user explicitly accepts a new generated revision.
    setGeneratedSvg(svg) {
      if (typeof svg !== "string" || !svg.trim()) {
        throw new TypeError("Generated SVG must be a non-empty string.");
      }
      generatedSvg = svg;
      editedSvg = null;
    },
    // The integration must validate/sanitize editor output before applying it.
    applyEditedSvg(svg) {
      if (!generatedSvg) throw new Error("Generate a schematic before editing.");
      if (typeof svg !== "string" || !svg.trim()) {
        throw new TypeError("Edited SVG must be a non-empty string.");
      }
      editedSvg = svg;
    },
    getSnapshot() {
      return { generatedSvg, editedSvg };
    },
    getDisplaySvg() {
      return editedSvg ?? generatedSvg;
    }
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const presentation = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
  "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor"];

// Copy resolved CSS into the document: no dependency on the host page's stylesheet.
export function exportGeneratedSvg(source) {
  const clone = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  originals.forEach((node, i) => {
    if (!node.matches("text, tspan, path, line, polyline, polygon, rect, circle, ellipse")) return;
    const style = getComputedStyle(node);
    for (const name of presentation) copies[i].setAttribute(name, style.getPropertyValue(name));
    copies[i].removeAttribute("class");
  });
  clone.removeAttribute("id");
  clone.removeAttribute("class");
  clone.removeAttribute("aria-labelledby");
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", "210mm");
  clone.setAttribute("height", "297mm");
  const drawing = clone.querySelector("#drawing-content");
  if (drawing) {
    // One named SVG-Edit layer. Its children remain individually selectable.
    drawing.setAttributeNS(INKSCAPE_NS, "inkscape:groupmode", "layer");
    drawing.setAttributeNS(INKSCAPE_NS, "inkscape:label", "Schematic");
    drawing.setAttribute("class", "layer");
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "Schematic";
    drawing.prepend(title);
  }
  return new XMLSerializer().serializeToString(clone);
}

// This application needs vector shapes/text only, not active or external SVG content.
export function validateSvg(svg) {
  if (typeof svg !== "string" || svg.length > 8_000_000) throw new Error("SVG tidak valid/terlalu besar.");
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    throw new Error("Format SVG tidak valid.");
  }
  if (doc.doctype) throw new Error("DOCTYPE tidak didukung.");
  const allowed = new Set(["svg", "g", "defs", "title", "desc", "metadata", "path", "line", "polyline",
    "polygon", "rect", "circle", "ellipse", "text", "tspan", "clipPath", "linearGradient", "radialGradient", "stop", "marker"]);
  for (const node of [...root.querySelectorAll("*"), root]) {
    // Editor metadata is not part of the visible drawing.
    if (node.closest("metadata")) { if (node.localName === "metadata") node.remove(); continue; }
    if (node.namespaceURI !== SVG_NS || !allowed.has(node.localName)) {
      throw new Error(`Elemen SVG tidak didukung: ${node.localName}`);
    }
    for (const attr of [...node.attributes]) {
      const name = attr.localName.toLowerCase();
      if (name.startsWith("on") || name === "href" || name === "src" || name === "base" ||
          /(?:javascript:|@import|expression\s*\()/i.test(attr.value) ||
          (/url\s*\(/i.test(attr.value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(attr.value))) {
        throw new Error(`Atribut SVG tidak didukung: ${attr.name}`);
      }
    }
  }
  // SVG-Edit may export numeric width/height with no viewBox, in its user units.
  if (!root.hasAttribute("viewBox")) {
    const width = root.getAttribute("width"), height = root.getAttribute("height");
    if (!/^[\d.]+$/.test(width || "") || !/^[\d.]+$/.test(height || "")) throw new Error("SVG tidak memiliki viewBox yang valid.");
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const viewBox = root.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0 ||
      Math.abs(viewBox[2] / viewBox[3] - 210 / 297) > 0.001) {
    throw new Error("Ukuran halaman harus tetap A4 portrait (rasio 210:297).");
  }
  root.removeAttribute("class");
  root.removeAttribute("style");
  root.setAttribute("width", "210mm");
  root.setAttribute("height", "297mm");
  return new XMLSerializer().serializeToString(root);
}

function initSchematicEditor() {
  if (new URLSearchParams(location.search).get("editor") === "off") return;
  const $ = id => document.getElementById(id);
  const source = $("drawing"), form = $("parameters"), preview = $("edited-preview");
  if (!source || !form) return;
  const state = createSchematicEditorState();
  let generatedParameters = null, generatedStatus = "", stale = false, bypass = false, applied = false;
  let editorApi = null, readyPromise = null, session = 0, unsavedManual = false;
  const dialog = $("schematic-editor-dialog");
  const message = text => { $("editor-status").textContent = text; };
  const inputs = () => [...form.querySelectorAll("input[id], select[id]")];
  const readParameters = () => Object.fromEntries(inputs().map(node => [node.id, node.value]));
  // Integration hooks for schematic_embed.js. Nothing changes when no one listens.
  const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));
  let captureCount = 0;
  const enableActions = enabled => {
    for (const id of ["edit-schematic", "save-project", "download-svg"]) $(id).disabled = !enabled;
  };
  const showEdited = () => {
    const svg = new DOMParser().parseFromString(state.getDisplaySvg(), "image/svg+xml").documentElement;
    svg.setAttribute("class", "canvas-a4");
    preview.replaceChildren(document.importNode(svg, true));
    preview.hidden = false; source.setAttribute("hidden", "");
  };
  const capture = () => {
    if (!source.querySelector("#drawing-content > *")) return;
    state.setGeneratedSvg(exportGeneratedSvg(source));
    generatedParameters = readParameters();
    generatedStatus = $("status").textContent;
    applied = false; stale = false; unsavedManual = false;
    preview.hidden = true; source.removeAttribute("hidden");
    enableActions(true);
    message("Generated — siap diedit. Save Project untuk menyimpan ke file.");
    captureCount++;
    emit("schematic:captured", { svg: state.getSnapshot().generatedSvg, parameters: generatedParameters, status: generatedStatus });
  };
  window.addEventListener("schematic:generated", capture);
  window.addEventListener("schematic:before-generate", event => {
    if (!bypass && (applied || dialog.open)) {
      event.preventDefault();
      stale = JSON.stringify(readParameters()) !== JSON.stringify(generatedParameters);
      message(stale ? "Parameter berubah. Hasil manual dipertahankan; klik Generate Ulang untuk menggantinya." : "Hasil manual aktif.");
    }
  });
  $("editor-toolbar").hidden = false;
  capture();

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function loadEditor() {
    if (readyPromise) return readyPromise;
    const frame = $("svg-editor-frame");
    readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Editor belum siap. Periksa server/vendor SVG-Edit.")), 45000);
      frame.onload = async () => {
        try {
          if (!frame.contentWindow.schematicEditorReady) throw new Error("Bridge editor tidak tersedia.");
          const api = await frame.contentWindow.schematicEditorReady;
          clearTimeout(timeout); resolve(api);
        } catch (error) { clearTimeout(timeout); reject(error); }
      };
      frame.src = "editor.html";
    }).catch(error => { readyPromise = null; throw error; });
    return readyPromise;
  }
  async function openEditor() {
    const token = ++session;
    dialog.showModal(); $("apply-schematic").disabled = true;
    $("editor-loading").hidden = false; $("editor-loading").textContent = "Memuat editor...";
    try {
      editorApi = await loadEditor();
      if (token !== session || !dialog.open) return;
      let svg = state.getDisplaySvg(); if (!svg) { capture(); svg = state.getDisplaySvg(); } if (!svg) throw new Error("Gambar schematic belum siap."); editorApi.load(svg);
      $("apply-schematic").disabled = false; $("editor-loading").hidden = true;
    } catch (error) { $("editor-loading").textContent = error.message; }
  }
  $("edit-schematic").addEventListener("click", openEditor);
  function cancel() {
    session++; dialog.close(); message("Edit dibatalkan; schematic sebelumnya tetap tersedia.");
    emit("schematic:editor-cancelled");
  }
  $("cancel-schematic").addEventListener("click", cancel);
  dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
  $("apply-schematic").addEventListener("click", () => {
    try {
      state.applyEditedSvg(validateSvg(editorApi.getSvg()));
      applied = true; unsavedManual = true; showEdited(); dialog.close(); session++;
      message("Hasil manual diterapkan. Klik Save Project agar tersimpan ke file.");
      emit("schematic:applied", { svg: state.getDisplaySvg() });
    } catch (error) { $("editor-loading").hidden = false; $("editor-loading").textContent = error.message; }
  });
  $("regenerate-schematic").addEventListener("click", () => {
    if (applied && !confirm("Generate ulang akan mengganti hasil edit manual. Simpan proyek terlebih dahulu bila diperlukan. Lanjutkan?")) return;
    bypass = true;
    try { window.dispatchEvent(new CustomEvent("schematic:regenerate")); }
    finally { bypass = false; }
    // Only capture(), after a successful render, clears the manual revision.
  });
  // Host-driven generate (embed bridge). The host asks its own user before
  // replacing a manual revision, so no confirm() here.
  function regenerateFromHost({ replaceManualEdit = false } = {}) {
    if (applied && !replaceManualEdit) {
      stale = JSON.stringify(readParameters()) !== JSON.stringify(generatedParameters);
      message(stale ? "Parameter berubah. Hasil manual dipertahankan; klik Generate Ulang untuk menggantinya." : "Hasil manual aktif.");
      return { generated: false, blocked: true, stale };
    }
    const before = captureCount;
    bypass = true;
    try { window.dispatchEvent(new CustomEvent("schematic:regenerate")); }
    finally { bypass = false; }
    return { generated: captureCount !== before, blocked: false, stale: false, status: $("status").textContent };
  }
  $("download-svg").addEventListener("click", () => download("schematic.svg", state.getDisplaySvg(), "image/svg+xml"));
  $("save-project").addEventListener("click", () => {
    const project = { format: "pole-schematic", version: 1, savedAt: new Date().toISOString(),
      parameters: generatedParameters, draftParameters: readParameters(), generatedStatus,
      ...state.getSnapshot() };
    download("schematic-project.json", JSON.stringify(project, null, 2), "application/json");
    unsavedManual = false;
    message("Download proyek dimulai. File berisi parameter serta SVG generated dan edited.");
  });
  // Shared by Open Project and the embed bridge (OPEN_PROJECT).
  function restoreProject(project, { askConfirm = true, protectSnapshot = true } = {}) {
    if (!project || project.format !== "pole-schematic" || project.version !== 1) throw new Error("Versi/format proyek tidak didukung.");
    const generated = validateSvg(project.generatedSvg);
    const edited = project.editedSvg === null ? null : validateSvg(project.editedSvg);
    const validParameters = values => {
      if (!values || typeof values !== "object") throw new Error("Parameter proyek tidak valid.");
      for (const node of inputs()) {
        if (typeof values[node.id] !== "string") throw new Error(`Parameter hilang: ${node.id}`);
        if (node.tagName === "SELECT" && ![...node.options].some(option => option.value === values[node.id])) throw new Error(`Pilihan tidak valid: ${node.id}`);
      }
    };
    validParameters(project.parameters);
    validParameters(project.draftParameters ?? project.parameters);
    if (askConfirm && state.getDisplaySvg() && !confirm("Buka proyek ini dan ganti schematic saat ini?")) return false;
    state.setGeneratedSvg(generated); if (edited !== null) state.applyEditedSvg(edited);
    generatedParameters = project.parameters; generatedStatus = String(project.generatedStatus ?? "");
    for (const node of inputs()) node.value = (project.draftParameters ?? project.parameters)[node.id];
    applied = protectSnapshot; // Protect an opened snapshot, even if it has no manual edits yet.
    unsavedManual = false;
    stale = JSON.stringify(readParameters()) !== JSON.stringify(generatedParameters);
    showEdited(); enableActions(true); $("status").textContent = generatedStatus;
    message(stale ? "Proyek dibuka. Parameter draft berbeda; generate ulang bila diperlukan." : "Proyek dibuka; hasil tersimpan ditampilkan.");
    return true;
  }
  $("open-project").addEventListener("click", () => $("project-file").click());
  $("project-file").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("File proyek terlalu besar.");
      const project = JSON.parse(await file.text());
      restoreProject(project);
    } catch (error) { message(`Gagal membuka proyek: ${error.message}`); }
    finally { event.target.value = ""; }
  });
  // Narrow API for schematic_embed.js; DrawingEngine stays untouched.
  window.schematicHost = Object.freeze({
    version: 1,
    readParameters,
    getSnapshot: () => ({ ...state.getSnapshot(), parameters: generatedParameters, status: generatedStatus, applied, stale }),
    regenerate: regenerateFromHost,
    restoreProject: (project, options = {}) => restoreProject(project, { ...options, askConfirm: false }),
    openEditor
  });
  emit("schematic:host-ready");
  window.addEventListener("beforeunload", event => {
    if (dialog.open || unsavedManual) { event.preventDefault(); event.returnValue = ""; }
  });
}

if (typeof document !== "undefined") initSchematicEditor();
