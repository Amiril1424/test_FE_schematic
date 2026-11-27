# V2 installation rules (stage 1)

- G.L. remains (0, 0), engineering Y positive upward.
- Input pole heights retain their above-ground meaning. Installation depth adds a below-ground portion, rather than subtracting from the top elevation.
- installation.type: on-gl, embedment, baseplate-under-gl.
- installation.depth: mm, 0 for on-gl; finite and strictly positive otherwise.
- On GL: pole bottom/baseplate at GL, as before.
- Embedment: pole extends to y=-depth, no baseplate.
- Baseplate under GL: pole extends to y=-depth; baseplate at its bottom.
- Confirmed: the buried extension has a constant diameter equal to the lowest section's diameter at GL, including when that section is tapered. Taper is not extrapolated underground.
- Arm/OHW elevations remain relative to GL.

Future dimensions (notes only, no dimension implementation): On GL retains existing H rules. Embedment assigns H indices to above-GL total and above-GL segments; depth and full length have no H index. Under GL assigns H to total and lowest segment including depth; standalone depth has no H index. For two 2000 mm sections: embedment depth 1000 gives H1=4000, H2=2000, H3=2000, unindexed total=5000; under-GL depth 300 gives H1=4300, H2=2000, H3=2300. Opening at GL elevation 750 measures 1050 from the under-GL datum when depth=300.

The global origin always stays at GL. `reference.point` and `crossSection` are at GL for On GL/Embedment, at y=-depth for Under GL. `baseplate.bottomCenter` explicitly refers to the underside of the plate, not its midplane or upper face. Plate thickness/shape is not implemented yet. `elevationFromReference` and `elevationToGL` convert engineering elevations to/from this local datum without scaling. Arm/OHW input elevations remain GL-relative.

Current HTML preview still uses the legacy On GL engine. These inputs are read by the V2 form adapter; stage 1 does not render the new installation geometry.

## Stage 2 geometry API

`buildPoleGeometry(project)` validates the project and returns engineering data only.
Segments retain input order (top to bottom), with a separate below-GL extension
referencing the lowest pole ID. Each includes elevations, endpoint diameters and
four outline vertices. Bounds cover the pole shaft only; baseplate dimensions
and other components are not yet included. Baseplate is currently an attachment
bottom-face center at the installation bottom, or null for embedment.

`getPoleSectionAtHeight`, `getPoleDiameterAtHeight`, and `getPoleSurfacePoint`
share one section lookup. At exact joints the largest diameter wins by default
(upper section on a tie). Explicit `upper`/`lower` queries remain available for
section-specific geometry. Outside the shaft they
return null, rather than extrapolating. Invalid height/side arguments throw.

`createPaperTransform({ scale: 1 / 50, originOnPaper: { x: 105, y: 250 } })`
maps engineering mm/Y-up to paper mm/Y-down via `toPaper`, with inverse
`toEngineering`. Length conversion uses `lengthToPaper`/`lengthToEngineering`.
Paper text/arrow sizes remain paper values. Automatic scale selection, SVG
rendering, dimensions, and leader placement are deferred to later stages.

Under GL correction (2026-11-27): Arm tip and OHW input heights, like Direct Object,
are measured from the baseplate underside. Convert to GL engineering Y by subtracting
depth once; dimension labels retain the input height. On GL/embedment remain GL-based.
For a short lowest straight Under GL section (less than 12 mm on paper), place G.L.
text to the right of the pole/baseplate envelope. Object-height columns share the
8 mm paper spacing and use the closest uniform bundle clearing existing annotations.

LATEST RULE - supersedes earlier additive Under GL examples:
Baseplate Under GL pole inputs include the buried portion. H1=sum(pole heights),
not sum+depth. GL remains Y=0; baseplate bottom=-depth; top=sum-depth.
Depth is taken from the lowest input segment; it must leave positive height above GL.
Embedment retains its separate added depth rule. Arm/OHW/DO heights remain measured
from baseplate bottom for Under GL. Example 8000+400, depth300: H1=8400,
H2=8000,H3=400,topY=8100,baseY=-300.
Base diameter prefers Q4 below the plate. Arm rows use a separate 10 mm paper offset.
Diameter witnesses may cross pole outlines, but must avoid annotation text and arrows.
