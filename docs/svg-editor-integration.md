# SVG-Edit integration

Stable baseline: tag `schematic-before-svg-editor`, commit `69a1b79`.
Integration branch: `feature/svg-editor`. Main remains unchanged.

## Run

From this repository run `npm.cmd start`, then open http://127.0.0.1:8080.
Node.js 22 is used locally. Runtime has no npm dependencies and no CDN requirement.
Use HTTP rather than double-clicking index.html because the editor uses JavaScript modules.
SVG-Edit is loaded only when Edit Schematic is clicked.

1. Fill engineering parameters and generate a valid drawing.
2. Click **Edit Schematic**. SVG-Edit opens a copy in an isolated iframe.
3. Select and move text, or edit individual lines/nodes. Use editor undo if needed.
4. Click **Apply to Schematic** to update the page, or **Cancel** to discard this editing session.
5. **Save Project** downloads JSON containing parameters, draft parameters, generated SVG and edited SVG.
6. **Open Project** restores the snapshot. **Download SVG** exports standalone A4 SVG for reuse in HTML.

Apply changes the in-memory preview only. Finish saving the downloaded file to retain your work.
Use the host buttons for persistence rather than SVG-Edit's built-in file menu.
Changing parameters after Apply retains manual edits and shows a stale notice.
Generate Ulang asks before replacing manual work. Invalid inputs retain the last manual drawing.
Closing/reloading warns when an editing session or unsaved applied changes exist.

## Implementation

- `schematic_editor.js`: state, standalone export, validation, preview and JSON persistence.
- `editor_bridge.js` / `editor.html`: lazy same-origin SVG-Edit and import/export bridge.
- `schematic_editor.css`: integration UI only.
- `schematic_test.js`: seven added lines for pre-generation, completed-generation and explicit regeneration events. Geometry unchanged.
- `vendor/svgedit`: upstream 7.4.2, pinned build recorded in SOURCE.md.

Exports bake CSS presentation attributes into vectors and set 210mm x 297mm plus viewBox.
SVG-Edit sometimes omits viewBox; validation restores it from numeric user-unit dimensions.
One named Schematic layer retains individually selectable elements. Leaders remain separate text/line/arrow elements, not parametric CAD annotations: moving text does not reconnect arrows automatically.
Japanese text uses installed system fonts; other computers may need compatible fonts.
Import supports vector shapes/text, not scripts, external images or arbitrary HTML. Keep the page A4 portrait.

## Tests

Start the server first, then run `npm.cmd ci` and `npm.cmd run test:editor`.
Tests use installed Microsoft Edge headlessly through Playwright. Set BROWSER_CHANNEL=chrome for Chrome.
The test command does not start a server or download a browser.

Verified 2026-10-12:

- Straight pole, DO=1: generate, import, move text using SVG-Edit, apply, cancel, save JSON, reload/open, download SVG, regenerate.
- Three pole segments including tapered, two opposite short arms, DO=0: roundtrip preserves element count, text, bounds (0.02 paper-unit tolerance), strokes, dashes, fills and fonts.
- Before editing, geometry matches the stable tag's engine exactly for the tapered/two-arm case.
- Invalid regeneration retains manual SVG; active/external SVG content is rejected.
- No browser JavaScript errors or failed resource requests in the regression case.
- A4, Japanese labels and dashed centerlines checked in browser screenshots.

Screenshots and sample files are written into ignored `test-results/`.
Tests cover representative cases, not every parameter combination or every SVG-Edit tool.

## Safe fallback

Open http://127.0.0.1:8080/?editor=off to use the engine without integration controls.
To run the original code in a separate folder without discarding current work:

```powershell
git worktree add ../schematic-stable schematic-before-svg-editor
```

No reset, deletion or overwriting is needed. Keep the stable tag and review the integration branch before merging into main.

## Leader layout follow-up

The drawing engine now reserves arm-length dimensions before taper thickness leaders.
Taper placement checks object outlines, existing text and dimension geometry with 4 paper mm text clearance, retaining the normal 12 mm diagonal components. It prefers the tapered segment and can use a matching connected straight segment when the taper is too short. An obstructed fallback is no longer drawn; status reports when no clear placement exists.
Arm specification leaders retain their shorter preferred routes and can try 28/36 mm rises when those routes are blocked.

Run `npm.cmd run test:leaders` with the server running. Cases cover the reported 6000 + 1997 mm pole, right 1000 mm arm at height 5001, left 180 mm arm at height 6001, two opposite 180 mm arms, and a short taper with connected straight segment. Final rendered obstacles are checked after all annotations exist; screenshots are saved in test-results.
The editor baseline comparison now checks object outlines, since annotation placement is intentionally changed. Other crowded combinations can still report an unplaced leader and may need manual finishing in SVG-Edit.
