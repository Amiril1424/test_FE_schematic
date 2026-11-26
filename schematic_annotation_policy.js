import { DIMENSION_STYLE } from './schematic_dimensions.js';
/** Cartesian quadrant order expressed in paper coordinates (SVG Y points down). */
export const ANNOTATION_QUADRANTS = Object.freeze([
  { id: 1, x: 1, y: -1 },
  { id: 2, x: -1, y: -1 },
  { id: 3, x: -1, y: 1 },
  { id: 4, x: 1, y: 1 }
]);
// Paper-mm horizontal/vertical projection: default diagonal 12.73 mm, minimum 5.66 mm.
export const DIAGONAL_RUNS = Object.freeze([9, 8, 7, 6, 5, 4]);
export const WIRE_DIAGONAL_RUNS = Object.freeze([...DIAGONAL_RUNS, 3, 2]);
// Congested leader fallback: previous maximum 32 mm is also halved to 16 mm.
// These are tried only after the normal-length choices in all four quadrants.
export const LEADER_FALLBACK_RUNS = Object.freeze([12, 16]);

/** Text spacing in paper mm, shared by measurement and SVG rendering. */
export const LEADER_TEXT_STYLE = Object.freeze({fontSize:DIMENSION_STYLE.fontSize, letterSpacing:0.12, wordSpacing:0.35, rowSpacing:4.7, aboveLineGap:1.3, belowLineBaseline:4.1});

export const LOWER_DIAMETER_RUNS = Object.freeze([12, 11, 10]);
