# Pole Schematic

Engineering parameter form, JavaScript SVG Drawing Engine, and an embedded SVG-Edit editor.
The main branch includes the editor integration and leader placement fixes.

## Clone and run

Install Git and Node.js 22 LTS, then run:

```sh
git clone https://github.com/Amiril1424/test_FE_schematic.git
cd test_FE_schematic
npm start
```

Open http://127.0.0.1:8080. In Windows PowerShell, use `npm.cmd start` if execution policy blocks `npm`.
Do not open index.html through file://; JavaScript modules require an HTTP server.
The runtime needs no npm install: SVG-Edit assets are included locally under vendor/svgedit.

1. Fill valid pole/arm parameters to generate the drawing.
2. Edit Schematic opens a copy in SVG-Edit; Apply to Schematic updates the preview.
3. Save Project downloads parameters and SVG revisions as JSON; Open Project restores them.
4. Download SVG exports an A4 drawing for embedding in a report.
5. Generate Ulang replaces manual edits only after confirmation. Save a project first if needed.

## Tests

Keep `npm start` running in one terminal. In another:

```sh
npm ci
npm run test:editor
npm run test:leaders
```

Tests require installed Microsoft Edge. For Chrome, set BROWSER_CHANNEL=chrome in your shell.
Both test suites use http://127.0.0.1:8080 and save screenshots under ignored test-results/.
Keep Git tags when cloning: the editor regression test compares object outlines against the stable tag.

## Team integration

- Drawing engine: schematic_test.js; editor lifecycle/state/persistence: schematic_editor.js.
- Host the app as a separate route or iframe initially. No React adapter or postMessage parameter API is implemented yet.
- The report can embed the final SVG on its second A4 page, using editedSvg when present and generatedSvg otherwise.
- JSON saving is local download, not backend persistence. The team must connect its backend separately.
- See docs/svg-editor-integration.md for implementation and test details. Its original branch notes describe the integration history; main now contains that work.

## Original version

The tag schematic-before-svg-editor retains the pre-editor version at 69a1b79.
Inspect it in a separate folder without overwriting current work:

```sh
git worktree add ../schematic-stable schematic-before-svg-editor
```

To disable editor controls temporarily on the current app, open http://127.0.0.1:8080/?editor=off.
If this repository is private, grant teammates GitHub repository access before they clone it.
