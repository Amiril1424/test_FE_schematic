Archived development previews

previews/ contains the superseded stage-by-stage HTML demonstrations.
Use /final_preview.html for the current complete V2 drawing.

These pages are not application entry points or integration dependencies.
They remain regression fixtures: tests deliberately open them at their new paths.
Do not remove them without updating the corresponding tests.

All root JavaScript modules are still used by V1, V2, or the SVG editor.
In particular, schematic_geometry_preview.js is used by schematic_final.js:
its name does NOT mean that it is obsolete.

The original V1 engine is also still used by index.html and must remain active
until the form/editor have been migrated to V2.
