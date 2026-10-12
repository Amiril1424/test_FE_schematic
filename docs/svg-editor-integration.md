# SVG editor integration

Stable baseline: `schematic-before-svg-editor` (commit `69a1b79`).
Integration branch: `feature/svg-editor`.

`schematic_editor.js` is the integration boundary. It currently holds only
independent generated/edited SVG state. It is not loaded by `index.html`.
The existing DrawingEngine and rendering behavior are unchanged.

## Next implementation steps

1. Pin and host SVG-Edit locally with the application.
2. Export a standalone SVG with styles, physical A4 size, and named groups.
3. Load a copy into the editor on explicit user action.
4. Apply validated editor output to a separate final-preview state.
5. Save engineering parameters and both SVG versions in a project file.
6. Confirm regeneration explicitly when manual edits exist.

## Checks required before merging into main

- Existing parameter generation still works with the editor unopened.
- Opening and cancelling the editor preserves the current schematic.
- Text, arrow endpoints, A4 scale, Japanese text, fills and dashed lines
  survive an import/edit/export round trip.
- Apply updates the preview without destroying the generated baseline.
- Save and reopen preserve parameters and manual changes.
- Regeneration does not silently overwrite manual edits.
- Test representative straight/tapered poles, left/right arms and 0/1 DO.

Do not merge until these checks pass. The current scaffold does not implement
the SVG-Edit UI, Apply button, or persistent project saving.

To inspect the stable version without discarding current work, use a separate
worktree: `git worktree add ../schematic-stable schematic-before-svg-editor`.
