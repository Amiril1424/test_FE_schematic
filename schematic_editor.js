// SVG editor integration boundary. Not loaded by index.html yet.
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
