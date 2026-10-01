"use strict";       //Make javascript code more strict and avoid some silent errors.(should declare variables, no duplicate params, etc.)

// Model: actual engineering dimensions in mm, independent of the screen.
// Put the size of shape into parameters object.
//default values for the rectangle, in mm. The drawing will be scaled to fit on A4 paper.
// event use const, property change is allowed. parameters.width = 8000; --> bisa
const parameters = {
  // Read the latest HTML values whenever these properties are accessed.
  get poleCount() {
    return Number(document.getElementById("pole-count").value);
  },

  get poles() {
    return Array.from({ length: this.poleCount }, (_, index) => {
      const prefix = `pole-${index + 1}`;
      const type = document.getElementById(`${prefix}-type`).value;
      const lowerDiameter = document.getElementById(`${prefix}-diameter`).valueAsNumber;
      const upperDiameter = type === "tapered"
        ? document.getElementById(`${prefix}-upper-diameter`).valueAsNumber
        : lowerDiameter;

      return {
        name: document.getElementById(`${prefix}-name`).value,
        material: document.getElementById(`${prefix}-material`).value,
        type,
        // Straight uses the lower diameter for both ends; tapered reads each end.
        Upper_D: upperDiameter,
        Lower_D: lowerDiameter,
        thickness: document.getElementById(`${prefix}-thickness`).valueAsNumber,
        height: document.getElementById(`${prefix}-height`).valueAsNumber,
        quantity: document.getElementById(`${prefix}-quantity`).valueAsNumber
      };
    });
  }
};





// NS = Name Space for SVG elements.
const NS = "http://www.w3.org/2000/svg";
// DOM elements, tempat untuk menampilkan gambar dan menerima input dari user.
const content = document.getElementById("drawing-content");
// form yang memuat input panjang dan tinggi.
const form = document.getElementById("parameters");
// paragraf untuk menampilkan ukuran, skala, atau pesan kesalahan.
const status = document.getElementById("status");
// ungsi format() menyiapkan angka untuk ditampilkan.
const format = (value) => Number(value.toFixed(2)).toLocaleString("en-US", {useGrouping: false});
// useGrouping:false agar tidak ada pemisah ribuan, misal 1000 menjadi 1000 bukan 1,000. Dalam gambar engineering tidak ada pemisah ribuan


// Small drawing engine. SVG viewBox units represent mm on the A4 paper.
// class mengelompokkan data dan fungsi yang saling berkaitan.
// Setiap instance DrawingEngine menyimpan:
// root: Grup SVG tujuan
// origin: posisi titik engineering (0, 0) pada kertas
// scale; rasio ukuran kertas terhadap gambar sebenarnya
// this berarti: object DrawingEngine yang sedang menjalankan method tersebut.
class DrawingEngine {
  // PROPERTY in Class DrawingEngine
  constructor(root, origin, scale) {
    this.root = root;
    this.origin = origin;
    this.scale = scale; // paper mm / actual mm
    this.dimensionSegments = []; // Paper coordinates, used to avoid leader collisions.
    this.diameterAnnotations = [];
    this.collectDimensions = false;
  }
  
  // ///////////METHOD in Class DrawingEngine////////////////////////////////
  // Engineering: +Y up. SVG: +Y down. Only this function converts coordinates.
  // origin = { x: 100, y: 200 };
  // scale = 0.5;
  // toSvg(20, 30);
  // Hasil: { x: 110, y: 185 }
  // xMm dan yMm adalah parameter method toSvg().
  // x dan y adalah property dari object yang dikembalikan/direturn oleh toSvg().
  toSvg(xMm, yMm) {
    return { 
      x: this.origin.x + xMm * this.scale, 
      y: this.origin.y - yMm * this.scale,
     };
  }

  // Method element: Method umum untuk membuat elemen SVG.
  // tag: nama tag SVG, misalnya "line".
  // attributes: objek berisi atribut SVG.
  // text: isi tulisan, jika elemennya <text>.
  element(tag, attributes, text) {
    // Membuat elemen SVG menggunakan namespace SVG.
    // Contoh jika tag === "line": -->  <line></line>
    const node = document.createElementNS(NS, tag);
    // Mengubah setiap properti objek attributes menjadi atribut SVG.
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    // Contoh objek:
    // {
    //   x1: 10,
    //   y1: 20,
    //   class: "object-line"
    // }
    // Object.entries() mengubahnya menjadi pasangan:
    // [
    //   ["x1", 10],
    //   ["y1", 20],
    //   ["class", "object-line"]
    // ]
    // Setelah loop, hasil SVG-nya: --> <line x1="10" y1="20" class="object-line"></line>
    // [key, value] disebut array destructuring.
    if (text !== undefined) node.textContent = text;
    // Jika argumen text diberikan, masukkan teks ke elemen.
    // element("text", { x: 10, y: 20 }, "Hello");
    // Menghasilkan: --> <text x="10" y="20">Hello</text>
    // Pemeriksaan menggunakan !== undefined, sehingga teks kosong "" tetap dianggap nilai yang valid.
    this.root.appendChild(node);
    // Memasukkan elemen baru ke elemen SVG induk.
    return node;
  }

  paperLine(a, b, className = "dimension-line") {
    if (this.collectDimensions) this.dimensionSegments.push({ a, b });
    // Nilai default className adalah "dimension-line" jika tidak diberikan argumen ketiga.
    return this.element("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: className });
  }

  drawLine(a, b, className = "object-line") {
    return this.paperLine(this.toSvg(a.x, a.y), this.toSvg(b.x, b.y), className);
  }

  drawPolyline(points, className = "object-line") {
    return this.element("polyline", {
      points: points.map(({ x, y }) => { const p = this.toSvg(x, y); return `${p.x},${p.y}`; }).join(" "),
      class: className,
    });
  }

  drawText(x, y, text, className = "drawing-text", attributes = {}) {
    return this.element("text", { x, y, class: className, ...attributes }, text);
  }

  // Leader target and elbow use engineering mm (Y up).
  // Shelf width and text spacing use paper mm, so annotations stay readable.
  drawLeader(target, elbow, topText, bottomText = "", shelfWidth = 0, textAlign = "center") {
    const tip = this.toSvg(target.x, target.y);
    const bend = this.toSvg(elbow.x, elbow.y);
    const direction = bend.x >= tip.x ? 1 : -1;

    const top = this.drawText(bend.x, bend.y - 2, topText, "drawing-text", {
      "text-anchor": "middle"
    });
    const bottom = bottomText === "" ? null : this.drawText(
      bend.x, bend.y + 5, bottomText, "drawing-text", { "text-anchor": "middle" }
    );

    // Fit the longest label with 1 paper mm of padding at each end.
    const textPadding = 1;
    const width = Math.max(
      shelfWidth,
      top.getComputedTextLength() + textPadding * 2,
      bottom ? bottom.getComputedTextLength() + textPadding * 2 : 0
    );
    const end = { x: bend.x + direction * width, y: bend.y };
    const textX = textAlign === "left"
      ? Math.min(bend.x, end.x) + textPadding
      : (bend.x + end.x) / 2;
    const textAnchor = textAlign === "left" ? "start" : "middle";
    top.setAttribute("x", textX);
    top.setAttribute("text-anchor", textAnchor);
    if (bottom) {
      bottom.setAttribute("x", textX);
      bottom.setAttribute("text-anchor", textAnchor);
    }

    this.paperLine(tip, bend, "dimension-line");
    this.paperLine(bend, end, "dimension-line");
    this.drawArrow(tip, Math.atan2(bend.y - tip.y, bend.x - tip.x));
  }

  // Straight pole: diameter × thickness above the shelf, material below.
  drawStraightPoleLeader(target, elbow, diameter, thickness, material, shelfWidth = 0) {
    const thicknessText = Number.isFinite(thickness) && thickness > 0
      ? thickness.toFixed(1)
      : "?";
    this.drawLeader(
      target,
      elbow,
      `Ø${format(diameter)} × t${thicknessText}`,
      material,
      shelfWidth
    );
  }

  // Object name: one line above the shelf. Default name for now: Lighting.
  drawObjectLeader(target, elbow, name = "Lighting", shelfWidth = 0) {
    const fittedElbow = this.fitObjectLeader(target, elbow, name, shelfWidth);
    this.drawLeader(target, fittedElbow, name, "", shelfWidth);
  }

  // Shorten the diagonal without changing its angle. Test the diagonal,
  // horizontal shelf and text against dimension lines already drawn.
  fitObjectLeader(target, elbow, name, shelfWidth) {
    if (this.dimensionSegments.length === 0) return elbow;
    const tip = this.toSvg(target.x, target.y);
    const bend = this.toSvg(elbow.x, elbow.y);
    const label = this.drawText(0, 0, name);
    const textWidth = label.getComputedTextLength();
    const textBox = label.getBBox();
    label.remove();
    const width = Math.max(shelfWidth, textWidth + 2);
    const side = bend.x >= tip.x ? 1 : -1;
    const textClearance = 1.5; // Paper mm around the text.
    const lineClearance = 0.3; // Thin lines need less clearance than text.

    const pointDistance = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    const segmentsNear = (a, b, c, d, clearance) => {
      const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const crosses = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
      return crosses || Math.min(pointDistance(a, c, d), pointDistance(b, c, d),
        pointDistance(c, a, b), pointDistance(d, a, b)) < clearance;
    };

    // Prefer the original length. Reduce both X and Y together if obstructed.
    let chosenFactor = 1;
    for (let step = 0; step <= 16; step++) {
      const factor = 1 - step * 0.05;
      const candidate = { x: tip.x + (bend.x - tip.x) * factor, y: tip.y + (bend.y - tip.y) * factor };
      const end = { x: candidate.x + side * width, y: candidate.y };
      const textX = (candidate.x + end.x) / 2;
      const left = textX - textWidth / 2;
      const right = textX + textWidth / 2;
      const top = candidate.y - 2 + textBox.y;
      const bottom = top + textBox.height;
      const corners = [{x:left,y:top}, {x:right,y:top}, {x:right,y:bottom}, {x:left,y:bottom}];
      const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
      const blocked = this.dimensionSegments.some(({ a, b }) =>
        segmentsNear(tip, candidate, a, b, lineClearance) ||
        segmentsNear(candidate, end, a, b, lineClearance) ||
        inside(a) || inside(b) || corners.some((p, i) =>
          segmentsNear(p, corners[(i + 1) % 4], a, b, textClearance))
      );
      if (!blocked) {
        chosenFactor = factor;
        break;
      }
    }
    return {
      x: target.x + (elbow.x - target.x) * chosenFactor,
      y: target.y + (elbow.y - target.y) * chosenFactor
    };
  }

  // Arrow size remains constant on paper, regardless of model scale.
  drawArrow(tip, direction) {
    const length = 2.5;
    const halfWidth = 0.65;
    for (const side of [-1, 1]) {
      this.paperLine(tip, {
        x: tip.x + Math.cos(direction) * length - Math.sin(direction) * halfWidth * side,
        y: tip.y + Math.sin(direction) * length + Math.cos(direction) * halfWidth * side,
      });
    }
  }

  // Endpoints in model mm; annotation offset in paper mm.
  drawDimension(a, b, orientation, offset, label, dimensionPosition) {
    const start = this.toSvg(a.x, a.y);
    const end = this.toSvg(b.x, b.y);
    const horizontal = orientation === "horizontal";
    const p = horizontal ? { x: start.x, y: start.y + offset } : { x: start.x + offset, y: start.y };
    const q = horizontal ? { x: end.x, y: end.y + offset } : { x: end.x + offset, y: end.y };
    // Optional fixed dimension position in paper units, independent of object edges.
    if (dimensionPosition !== undefined) {
      if (horizontal) {
        p.y = q.y = dimensionPosition;
      } else {
        p.x = q.x = dimensionPosition;
      }
    }
    const sign = Math.sign(offset);
    const objectGap = 30 * this.scale; // 30 mm engineering, converted to paper mm.
    for (const [anchor, target] of [[start, p], [end, q]]) {
      this.paperLine(
        { x: anchor.x + (horizontal ? 0 : sign * objectGap), y: anchor.y + (horizontal ? sign * objectGap : 0) },
        { x: target.x + (horizontal ? 0 : sign * 2), y: target.y + (horizontal ? sign * 2 : 0) },
      );
    }
    this.paperLine(p, q);
    const angle = Math.atan2(q.y - p.y, q.x - p.x);
    this.drawArrow(p, angle);
    this.drawArrow(q, angle + Math.PI);
    const x = (p.x + q.x) / 2 - (horizontal ? 0 : 2);
    const y = (p.y + q.y) / 2 - (horizontal ? 2 : 0);
    this.drawText(x, y, label, "drawing-text", {
      "text-anchor": "middle",
      ...(horizontal ? {} : { transform: `rotate(-90 ${x} ${y})` }),
    });
  }

  // Diameter and y use engineering mm; rise uses paper mm.
  drawDiameterDimension(diameter, y, direction, rise = 18) {
    const left = this.toSvg(-diameter / 2, y);
    const right = this.toSvg(diameter / 2, y);
    const label = this.drawText(0, 0, `Ø${format(diameter)}`);
    const textWidth = label.getComputedTextLength();
    const textBox = label.getBBox();
    const distance = Math.max(rise, diameter * this.scale / 2 + 8);
    const preferredUp = direction === "up";
    // Try the requested quadrant, then the other side, then opposite Y.
    const choices = [[1, preferredUp], [-1, preferredUp], [1, !preferredUp], [-1, !preferredUp]];
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const lineHitsBox = (a, b, box) => {
      let lo = 0, hi = 1;
      for (const [axis, min, max] of [["x", box.left, box.right], ["y", box.top, box.bottom]]) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-9) {
          if (a[axis] < min || a[axis] > max) return false;
        } else {
          const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
          lo = Math.max(lo, Math.min(t1, t2));
          hi = Math.min(hi, Math.max(t1, t2));
          if (lo > hi) return false;
        }
      }
      return true;
    };
    let selected;
    for (const [side, up] of choices) {
      const dx = side * distance, dy = up ? -distance : distance;
      const p = { x: left.x + dx, y: left.y + dy };
      const q = { x: right.x + dx, y: right.y + dy };
      const outside = !up && textWidth + 2 > q.x - p.x;
      const textX = outside ? (side > 0 ? q.x + 4 : p.x - 4) : (p.x + q.x) / 2;
      const anchor = outside ? (side > 0 ? "start" : "end") : "middle";
      const textLeft = anchor === "start" ? textX : anchor === "end" ? textX - textWidth : textX - textWidth / 2;
      const box = { left: textLeft - 1.5, right: textLeft + textWidth + 1.5,
        top: p.y - 2 + textBox.y - 1.5, bottom: p.y - 2 + textBox.y + textBox.height + 1.5 };
      const segments = [[left, p], [right, q], [{x:p.x-5,y:p.y}, {x:q.x+5,y:q.y}]];
      let score = this.diameterAnnotations.filter(previous =>
        intersects(box, previous.box) || previous.segments.some(([a,b]) => lineHitsBox(a,b,box)) ||
        segments.some(([a,b]) => lineHitsBox(a,b,previous.box))).length;
      // Avoid the existing height dimensions too, particularly on the left.
      score += this.dimensionSegments.filter(({a,b}) => lineHitsBox(a,b,box)).length;
      if (box.left < 5 || box.right > 205 || box.top < 5 || box.bottom > 292) score += 100;
      if (!selected || score < selected.score) selected = { dx, dy, textX, anchor, box, segments, score };
      if (score === 0) break;
    }
    // Equal horizontal/vertical displacement guarantees a 45-degree angle.
    const { dx, dy } = selected;
    const length = Math.hypot(dx, dy);
    const unitX = dx / length;
    const unitY = dy / length;
    const gap = 30 * this.scale;
    const p = { x: left.x + dx, y: left.y + dy };
    const q = { x: right.x + dx, y: right.y + dy };

    // Parallel diagonal extension lines with a 30 engineering mm gap.
    for (const [anchor, end] of [[left, p], [right, q]]) {
      this.paperLine(
        { x: anchor.x + unitX * gap, y: anchor.y + unitY * gap },
        { x: end.x + unitX * 1.5, y: end.y + unitY * 1.5 }
      );
    }

    // Outside arrows keep small diameters readable.
    this.paperLine({ x: p.x - 5, y: p.y }, { x: q.x + 5, y: q.y });
    this.drawArrow(p, Math.PI);
    this.drawArrow(q, 0);
    label.setAttribute("x", selected.textX);
    label.setAttribute("y", p.y - 2);
    label.setAttribute("text-anchor", selected.anchor);
    this.diameterAnnotations.push(selected);
  }

  drawArc(start, end, radius, sweep = 1, className = "object-line") {
  const p1 = this.toSvg(start.x, start.y);
  const p2 = this.toSvg(end.x, end.y);

  const r = radius * this.scale;

    return this.element("path", {
      d: `M ${p1.x} ${p1.y}
          A ${r} ${r} 0 0 ${sweep} ${p2.x} ${p2.y}`,
      class: className
    });
  } 
}

// Draw Objects here:
// Pole
// origin or basepoint of pole at center of page (0,0)
function drawPole(engine, model) {
  let currentY = 0;

  for (const pole of [...model.poles].reverse()) {
    const Up_D = pole.Upper_D;
    const Low_D = pole.Lower_D;
    const h = pole.height;

    engine.drawPolyline([
      { x: -Low_D / 2, y: currentY },
      { x:  Low_D / 2, y: currentY },
      { x:  Up_D / 2, y: currentY + h },
      { x: -Up_D / 2, y: currentY + h },
      { x: -Low_D / 2, y: currentY }
    ]);
    currentY += h;
  }
}

// Draw Baseplate 4 Rib
// for example make baseplate 350
function drawBaseplate(engine, model) {
  const baseplateWidth = 350; // Example width for the baseplate
  const baseplateThick = 25; // Example thickness for the baseplate
  const Low_D = model.poles[model.poles.length - 1].Lower_D; // The last pole is at the bottom, next to the baseplate.
  const RibHeight = 180; // Example height for the rib part
  const RibWidth = 80; // Example width for the rib part
  const RibThick = 12; // Example thickness for the rib part
  const ScallopRadius = 25; // Example radius for the scallop part

  engine.drawPolyline([
    // Base part
    { x: -baseplateWidth / 2, y: 0 },
    { x: baseplateWidth / 2, y: 0 },
    { x: baseplateWidth / 2, y: baseplateThick },
    { x: -baseplateWidth / 2, y: baseplateThick },
    { x: -baseplateWidth / 2, y: 0 }

  ], "object-line baseplate-face");

    // Rib Part Left Side
  engine.drawPolyline([
    { x: -baseplateWidth / 2 + 10, y: baseplateThick  },
    { x: -baseplateWidth / 2 + 10, y: baseplateThick + 20 },
    { x: -Low_D / 2 - 10, y: baseplateThick + RibHeight },
    { x: -Low_D / 2 , y: baseplateThick + RibHeight },
  ]);

    // Rib Part Right Side
  engine.drawPolyline([
    { x: baseplateWidth / 2 - 10, y: baseplateThick  },
    { x: baseplateWidth / 2 - 10, y: baseplateThick + 20 },
    { x: Low_D / 2 + 10, y: baseplateThick + RibHeight },
    { x: Low_D / 2 , y: baseplateThick + RibHeight },
  ]);

    // Rib Part Center
  engine.drawPolyline([
    { x: -RibThick / 2 , y: baseplateThick  },
    { x: -RibThick / 2, y: baseplateThick + RibHeight },
    { x: RibThick / 2, y: baseplateThick + RibHeight },
    { x: RibThick / 2 , y: baseplateThick  },
  ]);

  // Scallop left side
  engine.drawArc(
    { x: -Low_D / 2 - ScallopRadius, y: baseplateThick },
    { x: -Low_D / 2 , y: baseplateThick + ScallopRadius },
    ScallopRadius,
    1
  );

  // Scallop right side
  engine.drawArc(
    { x: Low_D / 2 + ScallopRadius, y: baseplateThick },
    { x: Low_D / 2 , y: baseplateThick + ScallopRadius },
    ScallopRadius,
    0
  );

}



// Taper ratio = (diameter bawah - diameter atas) / panjang total.
// Gunakan satuan yang sama untuk semua ukuran, misalnya mm.
function calculateTaperRatio(lowerDiameter, upperDiameter, totalLength) {
  if (![lowerDiameter, upperDiameter, totalLength].every(Number.isFinite) || totalLength <= 0) {
    throw new RangeError("Dimensions must be finite numbers and totalLength must be greater than zero.");
  }
  return (lowerDiameter - upperDiameter) / totalLength;
}

// Center point Tapered Pole
function centerPointTaperedPole(lowerDiameter, upperDiameter, totalLength) {
  if (
    ![lowerDiameter, upperDiameter, totalLength].every(Number.isFinite) || 
    lowerDiameter <= 0 ||
    upperDiameter <= 0 ||
    totalLength <= 0) {
    throw new RangeError("Dimensions must be finite numbers and totalLength must be greater than zero.");
  }
  return Math.round(
    (totalLength/3) * 
    (lowerDiameter + 2 * upperDiameter) / 
    (lowerDiameter + upperDiameter)
    );
}

// Draw Opening Part Box type
function drawOpeningBox(engine, model) {
  const Low_D = model.poles[model.poles.length - 1].Lower_D; // The last pole is at the bottom, next to the opening.
  const Upper_D = model.poles[model.poles.length - 1].Upper_D; // The last pole is at the bottom, next to the opening.
  const TaperRatio = calculateTaperRatio(Low_D, Upper_D, model.poles[model.poles.length - 1].height);
  
  const heightOpeningAtCenter = 750; // Example height for the opening from GL to center of opening
  const diameterPoleAtOpening = Low_D - heightOpeningAtCenter * TaperRatio; // The last pole is at the bottom, next to the opening.
  const openingCutHeight = 600; // Example height for the opening cut

  // Draw Box1
  engine.drawPolyline([
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter-openingCutHeight/2-40 },
    { x: -diameterPoleAtOpening/2-22.7+20, y: heightOpeningAtCenter-openingCutHeight/2-40 },
    { x: -diameterPoleAtOpening/2-22.7+20, y: heightOpeningAtCenter+openingCutHeight/2+40 },
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter+openingCutHeight/2+40 },
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter-openingCutHeight/2-40 },
  ], "object-line baseplate-face");

  // Draw Box2
  engine.drawPolyline([
    { x: -diameterPoleAtOpening/2-22.7+20, y: heightOpeningAtCenter-openingCutHeight/2-40 },
    { x: -diameterPoleAtOpening/2-22.7, y: heightOpeningAtCenter-openingCutHeight/2-40 },
    { x: -diameterPoleAtOpening/2-22.7, y: heightOpeningAtCenter+openingCutHeight/2+40-2 },
    { x: -diameterPoleAtOpening/2-22.7+20, y: heightOpeningAtCenter+openingCutHeight/2+40-2},
    { x: -diameterPoleAtOpening/2-22.7+20, y: heightOpeningAtCenter-openingCutHeight/2-40 },

  ]);

  // Draw Cover up plate
  engine.drawPolyline([
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter+openingCutHeight/2+40 },
    { x: -diameterPoleAtOpening/2-22.7-3.8, y: heightOpeningAtCenter+openingCutHeight/2+40 },
    { x: -diameterPoleAtOpening/2-22.7-3.8, y: heightOpeningAtCenter+openingCutHeight/2+40+4.5 },
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter+openingCutHeight/2+40+4.5 },
    { x: -diameterPoleAtOpening/2-22.7+61.2, y: heightOpeningAtCenter+openingCutHeight/2+40 },

  ]);

}

// Draw Adapter at top of pole
function drawAdapterTop(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const lengthAdapter = 120; // Example Length for the adapter
  const diameterAdapter = 60.5 // Example diameter for the adapter

  // Draw Adapter
  engine.drawPolyline([
    { x: -diameterAdapter/2, y: totalHeight },
    { x: diameterAdapter/2, y: totalHeight },
    { x: diameterAdapter/2, y: totalHeight + lengthAdapter },
    { x: -diameterAdapter/2, y: totalHeight + lengthAdapter },
    { x: -diameterAdapter/2, y: totalHeight }

  ]);
}

// Draw Schematic for Lighting
function drawLightingSchematic(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const lightingHeight = 200; // Example height for the lighting schematic
  const lightingWidth = 600; // Example width for the lighting schematic

  // Draw Lighting Schematic
  engine.drawPolyline([
    { x: -100, y: totalHeight },
    { x: lightingWidth - 100 , y: totalHeight},
    { x: lightingWidth - 100 , y: totalHeight + lightingHeight},
    { x: -100, y: totalHeight + lightingHeight},
    { x: -100, y: totalHeight }

  ], "lighting-line");
}

// --------------Center Line Function-----------------
// Draw Centerline for Pole
function drawPoleCenterLine(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const extension = 100; // Engineering mm; drawLine() applies engine.scale.
  const lengthAdapter = 120; // Example Length for the adapter

  engine.drawLine(
    { x: 0, y: -extension },
    { x: 0, y: totalHeight + extension + lengthAdapter },
    "center-line"
  );
}

// Draw Centerline for Opening Box
function drawOpeningBoxCenterLine(engine, model) {
  const extension = 100; // Engineering mm; drawLine() 
  const Low_D = model.poles[model.poles.length - 1].Lower_D;
  const Upper_D = model.poles[model.poles.length - 1].Upper_D; // The last pole is at the bottom, next to the opening.
  const TaperRatio = calculateTaperRatio(Low_D, Upper_D, model.poles[model.poles.length - 1].height);
  
  const heightOpeningAtCenter = 750; // Example height for the opening from GL to center of opening
  const diameterPoleAtOpening = Low_D - heightOpeningAtCenter * TaperRatio; // The last pole is at the bottom, next to the opening.
  
  engine.drawLine(
    { x: -diameterPoleAtOpening/2-22.7 - extension, y: heightOpeningAtCenter },
    { x: diameterPoleAtOpening/2 + extension, y: heightOpeningAtCenter },
    "center-line"
  );
}


// -----------Draw Dimension Line---------------------
// Prepare labels in INPUT order (top to bottom), independently of drawing order.
// Set useHeightPrefix to false for projects that need numeric dimensions only.
function createHeightDimensionLabels(model, useHeightPrefix = true) {
  const multiplePoles = model.poles.length > 1;
  const labelFor = (index, value, isCenter = false) => useHeightPrefix
    ? `H${index}${isCenter ? "'" : ""}=${format(value)}`
    : format(value);
  const poles = new Map();

  model.poles.forEach((pole, inputIndex) => {
    const heightIndex = multiplePoles ? inputIndex + 2 : 1;
    poles.set(pole, {
      length: labelFor(heightIndex, pole.height),
      center: pole.type === "tapered"
        ? labelFor(heightIndex, centerPointTaperedPole(pole.Lower_D, pole.Upper_D, pole.height), true)
        : null
    });
  });

  return {
    total: labelFor(1, model.poles.reduce((sum, pole) => sum + pole.height, 0)),
    poles
  };
}

// Shared engineering coordinates for the ground/reference line and dimensions.
function getGroundReference(engine) {
  const baseplateWidth = 350; // Match drawBaseplate().
  const extension = 16 / engine.scale; // 12 paper mm outside each baseplate edge.
  return {
    left: { x: -baseplateWidth / 2 - extension, y: 0 },
    right: { x: baseplateWidth / 2 + extension, y: 0 },
    baseplateRight: { x: baseplateWidth / 2, y: 0 }
  };
}

function drawGroundReference(engine) {
  const reference = getGroundReference(engine);
  engine.drawLine(reference.left, reference.right, "dimension-line");
  const left = engine.toSvg(reference.left.x, 0);
  const right = engine.toSvg(reference.right.x, 0);
  const arrowTip = engine.toSvg(reference.baseplateRight.x, 0);

  // G.L. has no arrow. The inspection arrow points left at the baseplate edge.
  engine.drawText(left.x + 1, left.y - 2, "G.L.");
  engine.drawArrow(arrowTip, 0);
  engine.drawText(right.x, right.y - 2, "検討部", "drawing-text", {
    "text-anchor": "end"
  });
}

// Draw Dimension for Pole
function drawPoleDimensions(engine, model, labels) {

  const poles = [...model.poles].reverse();
  let currentY = 0;
  const individualOffset = -40;
  const totalOffset = individualOffset - 8 ; // Total dimension line is slightly further out than individual dimensions.
  const overallMaxDiameter = Math.max(...poles.flatMap(pole => [pole.Lower_D, pole.Upper_D]));
  const dimensionX = engine.toSvg(-overallMaxDiameter / 2, 0).x + individualOffset;
  // Each joint uses the outermost edge of the two adjacent pole ends.
  // Both touching dimensions must leave the same 30 mm engineering gap.
  const boundaryX = [getGroundReference(engine).left.x]; // Shared lower reference.
  for (let index = 0; index < poles.length - 1; index++) {
    boundaryX.push(-Math.max(poles[index].Upper_D, poles[index + 1].Lower_D) / 2);
  }
  boundaryX.push(-poles[poles.length - 1].Upper_D / 2);

  // Dimension masing-masing section
  for (const [index, pole] of poles.entries()) {
    const h = pole.height;

    engine.drawDimension(
      { x: boundaryX[index], y: currentY},
      { x: boundaryX[index + 1], y: currentY + h},
      "vertical",
      individualOffset,
      labels?.poles.get(pole)?.length ?? format(h),
      dimensionX
    );
    currentY += h;
  }

  // Dimension total hanya untuk 2 pole atau lebih
  if (poles.length > 1) {
    const totalHeight = currentY;

    engine.drawDimension(
      { x: boundaryX[0], y: 0},
      { x: boundaryX[boundaryX.length - 1], y: totalHeight},
      "vertical",
      totalOffset,
      labels?.total ?? format(totalHeight),
      dimensionX + totalOffset - individualOffset
    );
  }

  // One Tapered pole enables diameter dimensions for the entire assembly.
  if (!poles.some(pole => pole.type === "tapered")) return;

  // Reversed order: bottom pole first, Pole 1 last (at the top).
  const riseFor = pole => Math.min(12, pole.height * engine.scale / 4);
  // Reserve the top-end position first; crowded joint labels try other quadrants.
  const topPole = poles[poles.length - 1];
  engine.drawDiameterDimension(topPole.Upper_D, currentY, "down", riseFor(topPole));
  engine.drawDiameterDimension(poles[0].Lower_D, 0, "up", riseFor(poles[0]));

  let jointY = 0;
  for (let index = 0; index < poles.length - 1; index++) {
    const lowerPole = poles[index];
    const upperPole = poles[index + 1];
    jointY += lowerPole.height;

    // Lower diameter of the upper pole: right/up (quadrant 1).
    engine.drawDiameterDimension(upperPole.Lower_D, jointY, "up", riseFor(upperPole));

    // Equal joint diameters share one label; unequal ones get a second label.
    if (Math.abs(upperPole.Lower_D - lowerPole.Upper_D) > 1e-9) {
      engine.drawDiameterDimension(lowerPole.Upper_D, jointY, "down", riseFor(lowerPole));
    }
  }

}

// Center height measured from each Tapered segment's own lower end.
function drawTaperCenterDimensions(engine, model, labels) {
  const poles = [...model.poles].reverse(); // Bottom to top, matching drawPole().
  const maxDiameter = Math.max(...poles.flatMap(pole => [pole.Lower_D, pole.Upper_D]));
  const offset = -40 + 8; // One 8 paper mm column inside the pole-length dimension.
  const dimensionX = engine.toSvg(-maxDiameter / 2, 0).x + offset;
  let bottomY = 0;

  for (const [index, pole] of poles.entries()) {
    if (pole.type === "tapered") {
      const centerHeight = centerPointTaperedPole(pole.Lower_D, pole.Upper_D, pole.height);
      const centerY = bottomY + centerHeight;
      const diameterAtCenter = pole.Lower_D +
        (pole.Upper_D - pole.Lower_D) * centerHeight / pole.height;
      // At the base, clear the baseplate; at joints, clear both touching poles.
      const lowerX = index === 0 ? getGroundReference(engine).left.x
        : -Math.max(pole.Lower_D, poles[index - 1].Upper_D) / 2;
      engine.drawDimension(
        { x: lowerX, y: bottomY },
        { x: -diameterAtCenter / 2, y: centerY },
        "vertical", offset, labels?.poles.get(pole)?.center ?? format(centerHeight), dimensionX
      );

      const textX = dimensionX + 4;
      const textY = engine.toSvg(0, bottomY + centerHeight / 2).y;
      const label = engine.drawText(textX, textY, "(荷重中心高さ)", "drawing-text", {
        "text-anchor": "middle",
        transform: `rotate(-90 ${textX} ${textY})`
      });
      // Keep the rotated note inside its own dimension span on short segments.
      const availableLength = Math.max(0.1, centerHeight * engine.scale - 4);
      const textLength = label.getComputedTextLength();
      if (textLength > availableLength) {
        label.setAttribute("font-size", `${3.5 * availableLength / textLength}px`);
        label.style.fontSize = `${3.5 * availableLength / textLength}px`;
      }
    }
    bottomY += pole.height;
  }
}

// Draw Dimension for Opening Box
function drawOpeningBoxDimensions(engine, model) {
  const bottomPole = model.poles[model.poles.length - 1];
  const heightOpeningAtCenter = 750; // Match drawOpeningBoxCenterLine().
  const extension = 100; // Engineering mm: opening centerline extension.
  const taperRatio = calculateTaperRatio(
    bottomPole.Lower_D,
    bottomPole.Upper_D,
    bottomPole.height
  );
  const diameterPoleAtOpening = bottomPole.Lower_D - heightOpeningAtCenter * taperRatio;
  const baseplatePoint = getGroundReference(engine).left;
  const centerlineEnd = {
    x: -diameterPoleAtOpening / 2 - 22.7 - extension,
    y: heightOpeningAtCenter
  };
  const individualOffset = -40; // Same reference as drawPoleDimensions().
  const dimensionSpacing = 8; // Paper mm between the pole and opening dimensions.
  const overallMaxDiameter = Math.max(...model.poles.flatMap(pole => [pole.Lower_D, pole.Upper_D]));
  // Only the bottom pole determines whether its center-height column is needed.
  const column = bottomPole.type === "tapered" ? 2 : 1;
  const offset = individualOffset + dimensionSpacing * column;
  const dimensionX = engine.toSvg(-overallMaxDiameter / 2, 0).x + offset;

  // drawDimension() supplies the 30 mm engineering gap at both anchors.
  engine.drawDimension(
    baseplatePoint,
    centerlineEnd,
    "vertical",
    offset,
    format(heightOpeningAtCenter),
    dimensionX
  );
}

// ----------------Draw Leader-----------------------
function drawPoleLeader(engine, model) {
  // Applies to one Straight pole or multiple poles that are all Straight.
  // If any pole is Tapered, omit all pole leaders for now.
  if (!model.poles.every(pole => pole.type === "straight")) return;

  const poles = [...model.poles].reverse(); // Same bottom-to-top order as drawPole().
  let currentY = 0;
  const leaderOffset = 12 / engine.scale; // 12 paper mm expressed in engineering mm.

  for (const pole of poles) {
    const target = {
      x: pole.Lower_D / 2,
      y: currentY + pole.height / 2
    };
    const elbow = {
      x: target.x + leaderOffset,
      y: target.y + leaderOffset
    };

    engine.drawStraightPoleLeader(
      target,
      elbow,
      pole.Lower_D,
      pole.thickness,
      pole.material
    );
    currentY += pole.height;
  }
}

// Draw Leader for Object
function drawObjectLeader(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const lightingHeight = 200; // Match drawLightingSchematic().
  const lightingWidth = 600;
  const leaderOffset = 12 / engine.scale; // 12 paper mm in engineering units.

  // Arrow touches the middle of the Lighting object's right edge.
  const target = {
    x: lightingWidth - 100,
    y: totalHeight + lightingHeight / 2
  };
  const elbow = {
    x: target.x + leaderOffset,
    y: target.y + leaderOffset
  };

  engine.drawObjectLeader(target, elbow, "灯具");
}

// Draw Leader for Opening Part
function drawOpeningBoxLeader(engine, model) {
  const bottomPole = model.poles[model.poles.length - 1];
  const heightOpeningAtCenter = 750; // Match drawOpeningBox().
  const taperRatio = calculateTaperRatio(
    bottomPole.Lower_D,
    bottomPole.Upper_D,
    bottomPole.height
  );
  const diameterPoleAtOpening = bottomPole.Lower_D - heightOpeningAtCenter * taperRatio;
  // Always try the normal 12 paper mm first. fitObjectLeader() checks actual
  // scaled dimension positions and measured text before shortening it.
  const leaderOffset = 12 / engine.scale;

  // Intersection of Box2's left side and the opening centerline.
  const target = {
    x: -diameterPoleAtOpening / 2 - 22.7,
    y: heightOpeningAtCenter
  };
  const elbow = {
    x: target.x - leaderOffset,
    y: target.y + leaderOffset
  };

  engine.drawObjectLeader(target, elbow, "開口部");
}

// Thickness/material leader for each Tapered pole, in bottom-to-top order.
function drawLeaderPoleTaperThickness(engine, model) {
  const poles = [...model.poles].reverse();
  const leaderOffset = 12 / engine.scale; // Paper mm converted to engineering mm.
  let bottomY = 0;

  for (const pole of poles) {
    if (pole.type === "tapered") {
      const ratio = calculateTaperRatio(pole.Lower_D, pole.Upper_D, pole.height);
      const roundedRatio = Number(ratio.toFixed(5));
      const description = roundedRatio === 0.01
        ? "1/100テーパー"
        : "温間スピニングテーパー";
      // thickness currently reads the Lower Thickness input.
      const thicknessText = Number.isFinite(pole.thickness) && pole.thickness > 0
        ? pole.thickness.toFixed(1)
        : "?";

      // Point to the right face at mid-height of this segment.
      const target = {
        x: (pole.Lower_D + pole.Upper_D) / 4,
        y: bottomY + pole.height / 2
      };
      const elbow = {
        x: target.x + leaderOffset,
        y: target.y + leaderOffset
      };
      engine.drawLeader(
        target,
        elbow,
        `${description}(t${thicknessText})`,
        `(JIS G3444 ${pole.material})`,
        0,
        "left"
      );
    }
    bottomY += pole.height;
  }
}

















function render(model) {
  content.replaceChildren();
  
  // Total tinggi seluruh pole
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  // Fit actual geometry into a 140 × 170 mm drawing area on the paper.
  const MaxDiameter = Math.max(
    ...model.poles.flatMap(pole => [pole.Upper_D, pole.Lower_D])
  );
  // Fit actual geometry into a 140 × 170 mm drawing area.
  const scale = Math.min(140 / MaxDiameter, 170 / totalHeight);
  // Engineering origin:
  // X = centerline of the pole
  // Y = bottom of the pole
  const origin = { x: 110, y: 170 + totalHeight * scale / 2 }; //--> sesuaikan dengan posisi kertas A4
  const engine = new DrawingEngine(content, origin, scale);
  engine.drawText(16, 20, "Pole with Parametric Dimensions", "drawing-text heading");
  engine.drawText(16, 28, "Model units: mm | A4 portrait | Automatic scale", "drawing-text note");
  // Draw Objects
  drawPole(engine, model);
  drawBaseplate(engine, model);
  drawOpeningBox(engine, model);
  drawAdapterTop(engine, model);
  drawLightingSchematic(engine, model);
  // Center lines
  drawPoleCenterLine(engine, model);
  drawOpeningBoxCenterLine(engine, model);
  drawGroundReference(engine);
  // Dimension lines
  const heightLabels = createHeightDimensionLabels(model, true); // false = values without H.
  engine.collectDimensions = true;
  drawTaperCenterDimensions(engine, model, heightLabels);
  drawPoleDimensions(engine, model, heightLabels);
  drawOpeningBoxDimensions(engine, model);
  engine.collectDimensions = false;
  // Pole leaders (Straight only).
  drawPoleLeader(engine, model);
  drawLeaderPoleTaperThickness(engine, model);
  drawObjectLeader(engine, model);
  drawOpeningBoxLeader(engine, model);

  // engine.drawText(16, 269, `Scale ≈ 1 : ${format(1 / scale)} | Length ${format(model.Upper_D)} mm × Height ${format(model.height)} mm`, "drawing-text note");
  status.textContent = `Poles: ${model.poleCount} | Max diameter: ${format(MaxDiameter)} mm | Total height: ${format(totalHeight)} mm. Drawing scale ≈ 1 : ${format(1 / scale)}.`;
}

function updateDrawing() {
  // Capture the latest values from the getters for this render.
  const model = { poleCount: parameters.poleCount, poles: parameters.poles };

  // Validate only selected rows; hidden rows must not block the drawing.
  for (let index = 0; index < model.poleCount; index++) {
    const pole = model.poles[index];
    const inputs = document.querySelectorAll(`#pole-step-${index + 1} input`);
    const validGeometry = [pole.Upper_D, pole.Lower_D, pole.height]
      .every(value => Number.isFinite(value) && value > 0);

    if (!validGeometry || !Array.from(inputs).every(input => input.checkValidity())) {
      status.textContent = `Pole ${index + 1}: enter a positive diameter and height, and check the other input values. The last drawing is kept if available.`;
      return;
    }
  }

  render(model);
}

form.addEventListener("input", updateDrawing);
form.addEventListener("change", updateDrawing);

updateDrawing();
