// Runs in its own same-origin iframe; editor styles cannot affect the schematic.
window.schematicEditorReady = (async () => {
  const { default: Editor } = await import("./vendor/svgedit/Editor.js");
  const editor = new Editor(document.getElementById("container"));
  editor.setConfig({
    allowInitialUserOverride: false,
    noDefaultExtensions: true,
    extensions: [], userExtensions: [],
    noStorageOnLoad: true,
    imgPath: "./images/",
    dimensions: [210, 297],
    initFill: { color: "none", opacity: 1 },
    initStroke: { color: "111111", opacity: 1, width: 0.18 },
    lang: "en"
  });
  await editor.init();
  await new Promise(resolve => editor.ready(resolve));
  editor.svgCanvas.setSvgOption("round_digits", 5);
  // The host owns persistence and unsaved-change prompts.
  window.onbeforeunload = null;
  return {
    load(svg) {
      editor.loadSvgString(svg);
      const resolution = editor.svgCanvas.getResolution();
      const area = editor.workarea;
      const zoom = Math.min((area.clientWidth - 90) / resolution.w, (area.clientHeight - 60) / resolution.h);
      editor.zoomImage(zoom / resolution.zoom);
    },
    getSvg() { return editor.svgCanvas.getSvgString(); }
  };
})();
window.schematicEditorReady.catch(error => { document.body.textContent = `Editor gagal dimuat: ${error.message}`; });
