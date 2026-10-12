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

  get armCount() {
    return Number(document.getElementById("arm-count").value);
  },

  get arms() {
    // Read only the selected arms; 0 arms returns an empty array.
    return Array.from({ length: this.armCount }, (_, index) => {
      const prefix = `arm-${index + 1}`;
      return {
        name: document.getElementById(`${prefix}-name`).value,
        material: document.getElementById(`${prefix}-material`).value,
        type: document.getElementById(`${prefix}-type`).value,
        diameter: document.getElementById(`${prefix}-diameter`).valueAsNumber,
        thickness: document.getElementById(`${prefix}-thickness`).valueAsNumber,
        height: document.getElementById(`${prefix}-height`).valueAsNumber,
        length: document.getElementById(`${prefix}-length`).valueAsNumber,
        fixAngle: document.getElementById(`${prefix}-fix-angle`).value === ""
          ? 0 : document.getElementById(`${prefix}-fix-angle`).valueAsNumber,
        verticalAngle: document.getElementById(`${prefix}-vertical-angle`).value === ""
          ? 0 : document.getElementById(`${prefix}-vertical-angle`).valueAsNumber,
        // Temporary set adapter spec is like below, but can be changed in the future.
        adapterLength: 120,
        adapterDiameter: 60.5
      };
    });
  },

  get directObjectCount() {
    return Number(document.getElementById("do-count").value);
  },

  get directObject() {
    return Array.from({ length: this.directObjectCount }, (_, index) => {
      const prefix = `do-${index + 1}`;
      return {
        name: document.getElementById(`${prefix}-name`).value,
        height: document.getElementById(`${prefix}-height`).valueAsNumber,
        quantity: document.getElementById(`${prefix}-quantity`).valueAsNumber
      };
    });
  },

  get overHeadWireCount() {
    return Number(document.getElementById("ohw-count").value);
  },

  get overHeadWire() {
    return Array.from({ length: this.overHeadWireCount }, (_, index) => {
      const prefix = `ohw-${index + 1}`;
      return {
        name: document.getElementById(`${prefix}-name`).value,
        weight: document.getElementById(`${prefix}-weight`).valueAsNumber, // kg/m
        diameter: document.getElementById(`${prefix}-diameter`).valueAsNumber,
        height: document.getElementById(`${prefix}-height`).valueAsNumber,
        span: document.getElementById(`${prefix}-span`).valueAsNumber,
        fixAngle: document.getElementById(`${prefix}-fix-angle`).value === ""
          ? 0 : document.getElementById(`${prefix}-fix-angle`).valueAsNumber
      };
    });
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
    this.leaderAnnotations = [];
    this.pendingDiameterDimensions = [];
    this.deferDiameterDimensions = false;
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

    // Reserve the actual text and leader geometry for diameter placement.
    const boxes = [top, bottom].filter(Boolean).map(node => {
      const box = node.getBBox();
      return { left: box.x - 1.5, right: box.x + box.width + 1.5,
        top: box.y - 1.5, bottom: box.y + box.height + 1.5 };
    });
    this.leaderAnnotations.push({ boxes, segments: [[tip, bend], [bend, end]] });

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
  fitObjectLeader(target, elbow, name, shelfWidth, bottomText = "", textAlign = "center", options = {}) {
    this.lastLeaderFitBlocked = false;
    if (this.dimensionSegments.length === 0) return elbow;
    const tip = this.toSvg(target.x, target.y);
    const bend = this.toSvg(elbow.x, elbow.y);
    const label = this.drawText(0, 0, name);
    const textWidth = label.getComputedTextLength();
    const textBox = label.getBBox();
    label.remove();
    const lowerLabel = bottomText ? this.drawText(0, 0, bottomText) : null;
    const lowerWidth = lowerLabel ? lowerLabel.getComputedTextLength() : 0;
    const lowerBox = lowerLabel ? lowerLabel.getBBox() : null;
    if (lowerLabel) lowerLabel.remove();
    const width = Math.max(shelfWidth, textWidth + 2, lowerWidth + 2);
    const side = bend.x >= tip.x ? 1 : -1;
    const textClearance = options.textClearance ?? 1.5; // Paper mm around the text.
    const minFactor = options.minFactor ?? 0.2;
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
    this.lastLeaderFitBlocked = true;
    for (let step = 0; step <= 16; step++) {
      const factor = 1 - step * 0.05;
      if (factor < minFactor - 1e-9) break;
      const candidate = { x: tip.x + (bend.x - tip.x) * factor, y: tip.y + (bend.y - tip.y) * factor };
      const end = { x: candidate.x + side * width, y: candidate.y };
      const textX = textAlign === "left" ? Math.min(candidate.x, end.x) + 1 : (candidate.x + end.x) / 2;
      const widest = Math.max(textWidth, lowerWidth);
      const left = textAlign === "left" ? textX : textX - widest / 2;
      const right = left + widest;
      const top = candidate.y - 2 + textBox.y;
      const bottom = lowerBox ? candidate.y + 5 + lowerBox.y + lowerBox.height : top + textBox.height;
      const corners = [{x:left,y:top}, {x:right,y:top}, {x:right,y:bottom}, {x:left,y:bottom}];
      const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
      const candidateBounds = {
        left: Math.min(tip.x,candidate.x,end.x,left)-textClearance,
        right: Math.max(tip.x,candidate.x,end.x,right)+textClearance,
        top: Math.min(tip.y,candidate.y,top)-textClearance,
        bottom: Math.max(tip.y,candidate.y,bottom)+textClearance
      };
      const blocked = this.dimensionSegments.some(({ a, b }) => {
        // Cheap bounding-box rejection before the detailed intersection tests.
        if(Math.max(a.x,b.x)<candidateBounds.left || Math.min(a.x,b.x)>candidateBounds.right ||
           Math.max(a.y,b.y)<candidateBounds.top || Math.min(a.y,b.y)>candidateBounds.bottom) return false;
        return segmentsNear(tip, candidate, a, b, lineClearance) ||
        segmentsNear(candidate, end, a, b, lineClearance) ||
        inside(a) || inside(b) || corners.some((p, i) =>
          segmentsNear(p, corners[(i + 1) % 4], a, b, textClearance));
      }) || this.diameterAnnotations.some(({box}) =>
        left - textClearance < box.right && right + textClearance > box.left &&
        top - textClearance < box.bottom && bottom + textClearance > box.top
      ) || left < 5 || right > 205 || top < 5 || bottom > 292;
      if (!blocked) {
        chosenFactor = factor;
        this.lastLeaderFitBlocked = false;
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
    // Resolve diameter quadrants after leader positions are known.
    if (this.deferDiameterDimensions) {
      this.pendingDiameterDimensions.push([diameter, y, direction, rise]);
      return;
    }
    const left = this.toSvg(-diameter / 2, y);
    const right = this.toSvg(diameter / 2, y);
    const label = this.drawText(0, 0, `Ø${format(diameter)}`);
    const textWidth = label.getComputedTextLength();
    const textBox = label.getBBox();
    const distance = Math.max(rise, diameter * this.scale / 2 + 8);
    const preferredUp = direction === "up";
    // Try the requested quadrant, then the other side, then opposite Y.
    const choices = [[1, preferredUp], [-1, preferredUp], [-1, !preferredUp], [1, !preferredUp]];
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
      // Leaders are already placed: reject text overlap and extension lines
      // passing through either of their two text rows.
      score += this.leaderAnnotations.filter(leader =>
        leader.boxes.some(area => intersects(box, area) ||
          segments.some(([a,b]) => lineHitsBox(a,b,area))) ||
        leader.segments.some(([a,b]) => lineHitsBox(a,b,box))
      ).length;
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

// Taper ratio = (diameter bawah - diameter atas) / panjang total.
// Gunakan satuan yang sama untuk semua ukuran, misalnya mm.
function calculateTaperRatio(lowerDiameter, upperDiameter, totalLength) {
  if (![lowerDiameter, upperDiameter, totalLength].every(Number.isFinite) || totalLength <= 0) {
    throw new RangeError("Dimensions must be finite numbers and totalLength must be greater than zero.");
  }
  return (lowerDiameter - upperDiameter) / totalLength;
}

// Fix angle controls the side in this elevation view, without foreshortening.
function getArmDirection(fixAngle = 0) {
  if (!Number.isFinite(fixAngle) || fixAngle < 0 || fixAngle > 360) return null;
  return fixAngle > 90 && fixAngle <= 270 ? -1 : 1;
}


// Heights are measured from G.L.; Arm Length is the horizontal projection.
// A connection must fit entirely within one pole segment.
function getArmConnection(poles, arm) {
  if (getArmDirection(arm.fixAngle) === null) return null;
  const angle = arm.verticalAngle ?? 0;
  if (![arm.height, arm.diameter, arm.length, angle].every(Number.isFinite) ||
      arm.diameter <= 0 || arm.length <= 0 || Math.abs(angle) >= 90) return null;

  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const actualLength = arm.length / cos;
  const half = arm.diameter / 2;
  // Height specifies the arm tip, excluding the adapter and lighting.
  // Move the pole-axis start down/up to preserve that tip height as length changes.
  const startCenter = { x: 0, y: arm.height - actualLength * sin };
  const endCenter = { x: arm.length, y: arm.height };
  // Normal to the arm axis: diameter stays perpendicular to the arm.
  const offset = { x: -sin * half, y: cos * half };
  const endTop = { x: endCenter.x + offset.x, y: endCenter.y + offset.y };
  const endBottom = { x: endCenter.x - offset.x, y: endCenter.y - offset.y };

  let baseY = 0;
  for (const pole of [...poles].reverse()) {
    const topPoleY = baseY + pole.height;
    const ratio = calculateTaperRatio(pole.Lower_D, pole.Upper_D, pole.height);
    // Intersect each arm side with x = (Lower_D - ratio * (y - baseY)) / 2.
    const denominator = 2 * cos + ratio * sin;
    if (denominator > 1e-9) {
      const intersect = sign => {
        const x0 = sign * offset.x;
        const y0 = startCenter.y + sign * offset.y;
        const distance = (pole.Lower_D - ratio * (y0 - baseY) - 2 * x0) / denominator;
        return { x: x0 + distance * cos, y: y0 + distance * sin, distance };
      };
      const bottom = intersect(-1);
      const top = intersect(1);
      const fits = [bottom, top].every(point =>
        point.y >= baseY && point.y <= topPoleY &&
        point.distance >= 0 && point.distance < actualLength);
      if (fits) return { bottom, top, endBottom, endTop, actualLength, startCenter, endCenter, poles };
    }
    baseY = topPoleY;
  }
  return null;
}

function drawArm(engine, model) {
  for (const arm of model.arms ?? []) {
    const connection = getArmConnection(model.poles, arm);
    if (!connection) continue;
    const { bottom, top } = connection;
    const direction = getArmDirection(arm.fixAngle);
    const p = engine.toSvg(direction * bottom.x, bottom.y);
    const q = engine.toSvg(direction * top.x, top.y);
    const endBottom = engine.toSvg(direction * connection.endBottom.x, connection.endBottom.y);
    const endTop = engine.toSvg(direction * connection.endTop.x, connection.endTop.y);
    // Keep a valid circular arc even when an inclined connection is wider.
    const chord = Math.hypot(top.x - bottom.x, top.y - bottom.y);
    const radius = Math.max(0.678 * arm.diameter, chord / 2) * engine.scale;

    // Mirroring the arm also reverses the arc sweep; white fill masks the pole.
    const sweep = direction === 1 ? 0 : 1;
    engine.element("path", {
      d: `M ${p.x} ${p.y}
          L ${endBottom.x} ${endBottom.y}
          L ${endTop.x} ${endTop.y}
          L ${q.x} ${q.y}
          A ${radius} ${radius} 0 0 ${sweep} ${p.x} ${p.y} Z`,
      class: "object-line arm-face"
    });
    drawArmRib(engine, arm, connection, direction);
    drawArmAdapter(engine, arm, connection, direction);
    drawArmLighting(engine, arm, connection, direction);
  }
}

// Make Adapter for lighting arm, for example make adapter 120
function drawArmAdapter(engine, arm, connection, direction) {
  const angle = arm.verticalAngle ?? 0;
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const axis = { x: cos, y: sin };
  const normal = { x: -sin, y: cos };
  const boxlength = arm.adapterLength ?? 120;
  const halfWidth = (arm.adapterDiameter ?? 60.5) / 2;

  const startCenter = connection.endCenter;
  const startTop = { x: startCenter.x + normal.x * halfWidth, y: startCenter.y + normal.y * halfWidth };
  const startBottom = { x: startCenter.x - normal.x * halfWidth, y: startCenter.y - normal.y * halfWidth };
  const endTop = { x: startTop.x + axis.x * boxlength, y: startTop.y + axis.y * boxlength };
  const endBottom = { x: startBottom.x + axis.x * boxlength, y: startBottom.y + axis.y * boxlength };

  const p1 = engine.toSvg(direction * startBottom.x, startBottom.y);
  const p2 = engine.toSvg(direction * startTop.x, startTop.y);
  const p3 = engine.toSvg(direction * endTop.x, endTop.y);
  const p4 = engine.toSvg(direction * endBottom.x, endBottom.y);

  engine.element("path", {
    d: `M ${p1.x} ${p1.y}
        L ${p2.x} ${p2.y}
        L ${p3.x} ${p3.y}
        L ${p4.x} ${p4.y}
        Z`,
    class: "object-line adapter-face"
  }); 
}


// Rib below one arm: 100 mm along the arm, 100 mm vertically down the pole.
function drawArmRib(engine, arm, connection, direction) {
  const ribLength = 100;
  const ribHeight = 100;
  const endFlat = 10;
  const reliefRadius = 25;
  const radians = (arm.verticalAngle ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const start = connection.bottom;
  const lowerY = start.y - ribHeight;
  if (lowerY < 0 || connection.actualLength - start.distance < ribLength) return;

  // Follow the actual pole profile, including a joint below the connection.
  let baseY = 0;
  const poleEdge = [];
  for (const pole of [...connection.poles].reverse()) {
    const topY = baseY + pole.height;
    const ratio = calculateTaperRatio(pole.Lower_D, pole.Upper_D, pole.height);
    const low = Math.max(lowerY, baseY), high = Math.min(start.y, topY);
    if (low < high) {
      for (const y of [low, high]) {
        poleEdge.push({ x: (pole.Lower_D - (y - baseY) * ratio) / 2, y });
      }
    }
    baseY = topY;
  }
  if (!poleEdge.length) return;
  const lower = poleEdge[0];
  const tip = { x: start.x + ribLength * cos, y: start.y + ribLength * sin };
  const armRelief = { x: start.x + reliefRadius * cos, y: start.y + reliefRadius * sin };
  // Locate the R25 endpoint on the pole edge nearest the connection.
  const beforeStart = poleEdge[poleEdge.length - 2];
  const edgeLength = Math.hypot(beforeStart.x - start.x, beforeStart.y - start.y);
  // Avoid extending a circular relief beyond a nearby step in the pole.
  if (edgeLength < reliefRadius) return;
  const poleRelief = {
    x: start.x + (beforeStart.x - start.x) * reliefRadius / edgeLength,
    y: start.y + (beforeStart.y - start.y) * reliefRadius / edgeLength
  };
  const points = [armRelief, tip,
    { x: tip.x + endFlat * sin, y: tip.y - endFlat * cos },
    { x: lower.x + endFlat, y: lower.y },
    ...poleEdge.slice(0, -1), poleRelief];
  const svg = points.map(point => engine.toSvg(direction * point.x, point.y));
  const radius = reliefRadius * engine.scale;
  engine.element("path", {
    d: `M ${svg[0].x} ${svg[0].y} ` +
      svg.slice(1).map(point => `L ${point.x} ${point.y}`).join(" ") +
      ` A ${radius} ${radius} 0 0 ${direction === 1 ? 0 : 1} ${svg[0].x} ${svg[0].y} Z`,
    class: "object-line"
  });
}

// Shared dimensions for pole-top and arm lighting schematics (engineering mm).
const LIGHTING_WIDTH = 600;
const LIGHTING_HEIGHT = 200;

function getArmLightingPoints(arm, connection, direction) {
  const radians = (arm.verticalAngle ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // Start at the arm end so the adapter enters the lighting housing.
  return [[0, -LIGHTING_HEIGHT / 2], [LIGHTING_WIDTH, -LIGHTING_HEIGHT / 2],
    [LIGHTING_WIDTH, LIGHTING_HEIGHT / 2], [0, LIGHTING_HEIGHT / 2]]
    .map(([along, across]) => ({
      x: direction * (connection.endCenter.x + along * cos - across * sin),
      y: connection.endCenter.y + along * sin + across * cos
    }));
}

function drawArmLighting(engine, arm, connection, direction) {
  const points = getArmLightingPoints(arm, connection, direction);
  // Outline only, keeping the adapter visible inside the housing.
  engine.drawPolyline([...points, points[0]], "lighting-line");
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
  const lengthAdapter = model.directObjectCount > 0 ? 120 : 0; // Top adapter only for Direct Object
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
  const lightingHeight = LIGHTING_HEIGHT; // Example height for the lighting schematic
  const lightingWidth = LIGHTING_WIDTH; // Example width for the lighting schematic

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
const CENTERLINE_EXTENSION = 100; // Engineering mm, shared by pole and arm.
// Draw Centerline for Pole
function drawPoleCenterLine(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const extension = CENTERLINE_EXTENSION; // drawLine() applies engine.scale.
  const lengthAdapter = model.directObjectCount > 0 ? 120 : 0; // Top adapter only for Direct Object

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


// Draw from the pole centerline through the arm tip, extending along its axis.
function drawArmCenterLine(engine, model) {
  for (const arm of model.arms ?? []) {
    const connection = getArmConnection(model.poles, arm);
    if (!connection) continue;
    const radians = (arm.verticalAngle ?? 0) * Math.PI / 180;
    const length = connection.actualLength + (arm.adapterLength ?? 120) + CENTERLINE_EXTENSION;
    const direction = getArmDirection(arm.fixAngle);
    engine.drawLine(
      connection.startCenter,
      { x: direction * length * Math.cos(radians), y: connection.startCenter.y + length * Math.sin(radians) },
      "center-line"
    );
  }
}

// -----------Draw Dimension Line---------------------
// Prepare labels in INPUT order (top to bottom), independently of drawing order.
// Set useHeightPrefix to false for projects that need numeric dimensions only.
// One shared order for all object heights, independent of input type.
function getObjectHeightOrder(model) {
  const sorted = [
    ...(model.arms ?? []).map((object, index) => ({ type: "arm", object, index })),
    ...(model.overHeadWire ?? []).map((object, index) => ({ type: "ohw", object, index }))
  ].filter(({ object }) => Number.isFinite(object.height) && object.height > 0)
    .sort((a, b) => b.object.height - a.object.height);
  // One dimension per elevation, even when Arm and OHW share that elevation.
  const unique = [];
  for (const item of sorted) {
    const previous = unique[unique.length - 1];
    if (!previous || Math.abs(previous.object.height - item.object.height) > 1e-6) {
      unique.push(item);
    } else if (item.type === "arm" &&
        (previous.type !== "arm" ||
          getArmDirection(item.object.fixAngle) * item.object.length >
          getArmDirection(previous.object.fixAngle) * previous.object.length)) {
      // Right-side dimensions use the rightmost arm tip as their shared reference.
      unique[unique.length - 1] = item;
    }
  }
  return unique;
}

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
    poles,
    objects: getObjectHeightOrder(model).map((item, index) => ({
      ...item,
      label: labelFor((multiplePoles ? model.poles.length + 2 : 2) + index, item.object.height)
    }))
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

// Center dimensions use full-size text, moving above the span when necessary.
function drawCenterHeightDimension(engine, start, end, dimensionX, value, boundaryLevels, occupied) {
  const p = engine.toSvg(start.x, start.y);
  const q = engine.toSvg(end.x, end.y);
  const valueNode = engine.drawText(0, 0, value);
  const noteNode = engine.drawText(0, 0, "(荷重中心高さ)");
  const textLength = Math.max(valueNode.getComputedTextLength(), noteNode.getComputedTextLength());
  // Text sits beside the dimension line, so it need not reserve arrow length.
  // Keep it centered whenever the scaled span fits the text plus 1 mm per end.
  const textEndGap = 1; // Paper mm.
  const availableSpan = Math.abs(p.y - q.y);
  const outside = textLength + textEndGap * 2 > availableSpan;
  let textY = (p.y + q.y) / 2;
  let anchor = "middle";
  if (outside) {
    anchor = "start"; // After -90 rotation, the text grows upward from this point.
    textY = q.y - 4;
    // Move the complete label above any joint or earlier center label it crosses.
    for (let pass = 0; pass < boundaryLevels.length + occupied.length + 2; pass++) {
      const joint = boundaryLevels.find(y => y >= textY - textLength - 2 && y <= textY + 2);
      const previous = occupied.find(r => textY + 2 > r.top && textY - textLength - 2 < r.bottom);
      if (joint === undefined && !previous) break;
      textY = Math.min(joint === undefined ? Infinity : joint - 4, previous ? previous.top - 4 : Infinity);
    }
  }
  for (const [node, x] of [[valueNode, dimensionX - 2], [noteNode, dimensionX + 4]]) {
    node.setAttribute("x", x);
    node.setAttribute("y", textY);
    node.setAttribute("text-anchor", anchor);
    node.setAttribute("transform", `rotate(-90 ${x} ${textY})`);
  }
  occupied.push({top: outside ? textY - textLength : textY - textLength / 2,
    bottom: outside ? textY : textY + textLength / 2});
  const gap = 25 * engine.scale;
  for (const point of [p, q]) {
    engine.paperLine({x:point.x-gap,y:point.y}, {x:dimensionX-2,y:point.y});
  }
  const lineTop = outside ? textY - textLength - 2 : q.y;
  engine.paperLine({x:dimensionX,y:outside ? p.y+3 : p.y}, {x:dimensionX,y:lineTop});
  engine.drawArrow({x:dimensionX,y:p.y}, outside ? Math.PI/2 : -Math.PI/2);
  engine.drawArrow({x:dimensionX,y:q.y}, outside ? -Math.PI/2 : Math.PI/2);
}

// Center height measured from each Tapered segment's own lower end.
function drawTaperCenterDimensions(engine, model, labels) {
  const poles = [...model.poles].reverse(); // Bottom to top, matching drawPole().
  const maxDiameter = Math.max(...poles.flatMap(pole => [pole.Lower_D, pole.Upper_D]));
  const offset = -40 + 8; // One 8 paper mm column inside the pole-length dimension.
  const dimensionX = engine.toSvg(-maxDiameter / 2, 0).x + offset;
  let bottomY = 0;
  let level = 0;
  const boundaryLevels = [engine.toSvg(0, 0).y];
  for (const pole of poles) {
    level += pole.height;
    boundaryLevels.push(engine.toSvg(0, level).y);
  }
  const occupied = [];

  for (const [index, pole] of poles.entries()) {
    if (pole.type === "tapered") {
      const centerHeight = centerPointTaperedPole(pole.Lower_D, pole.Upper_D, pole.height);
      const centerY = bottomY + centerHeight;
      const diameterAtCenter = pole.Lower_D +
        (pole.Upper_D - pole.Lower_D) * centerHeight / pole.height;
      // At the base, clear the baseplate; at joints, clear both touching poles.
      const lowerX = index === 0 ? getGroundReference(engine).left.x
        : -Math.max(pole.Lower_D, poles[index - 1].Upper_D) / 2;
      drawCenterHeightDimension(
        engine,
        { x: lowerX, y: bottomY },
        { x: -diameterAtCenter / 2, y: centerY },
        dimensionX, labels?.poles.get(pole)?.center ?? format(centerHeight), boundaryLevels, occupied
      );
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
// Horizontal arm length only: exclude adapter and lighting lengths.
// Arm height is measured from G.L. to the center of the arm tip.
function drawObjectHeightDimensions(engine, model, labels) {
  const objects = labels.objects;
  if (!objects.length) return;
  const bounds = getHorizontalDrawingBounds(model);
  const ground = getGroundReference(engine);
  const objectTop = engine.toSvg(0, Math.max(...objects.map(({ object }) => object.height))).y;
  const groundY = engine.toSvg(0, 0).y;
  // Leaders have priority. Reserve their actual text/shelf width before placing columns.
  let leaderRight = -Infinity;
  for (const leader of engine.leaderAnnotations) {
    for (const box of leader.boxes) {
      if (box.bottom >= objectTop && box.top <= groundY) leaderRight = Math.max(leaderRight, box.right);
    }
    for (const [a, b] of leader.segments) {
      if (Math.max(a.y, b.y) >= objectTop && Math.min(a.y, b.y) <= groundY) {
        leaderRight = Math.max(leaderRight, a.x, b.x);
      }
    }
  }
  const firstColumn = Math.max(
    Math.max(engine.toSvg(bounds.right, 0).x, engine.toSvg(ground.right.x, 0).x) + 12,
    leaderRight + 8 // Paper mm: room for the vertical dimension text as well.
  );
  objects.forEach(({ object, type, label }, index) => {
    // Tallest object is outermost, so shorter dimension lines do not cross it.
    const column = firstColumn + (objects.length - 1 - index) * 8;
    const connection = type === "arm" ? getArmConnection(model.poles, object) : null;
    const upperReference = connection
      ? { x: getArmDirection(object.fixAngle) * connection.endCenter.x, y: connection.endCenter.y }
      : { x: 0, y: object.height };
    engine.drawDimension(
      ground.right,
      upperReference,
      "vertical", 12, label, column
    );
  });
}

function drawDimensionArm(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const offset = 10; // Paper mm above the arm/lighting, independent of scale.
  const abovePoleOffset = 18; // Minimum paper mm above the pole top.
  const topClearance = 150; // Engineering mm between dimension and pole top.
  const occupiedArmLabels = [];
  const groups = [];
  const arms = [...(model.arms ?? [])].sort((a, b) => b.height - a.height);
  for (const arm of arms) {
    const connection = getArmConnection(model.poles, arm);
    if (!connection) continue;
    let group = groups[groups.length - 1];
    if (!group || Math.abs(group.height - arm.height) > 1e-6) {
      group = { height: arm.height, items: [] };
      groups.push(group);
    }
    group.items.push({ arm, connection, direction: getArmDirection(arm.fixAngle) });
  }

  groups.forEach((group, index) => {
    // Same-height arms share both their L index and their dimension level.
    const upperEdge = Math.max(...group.items.flatMap(({ arm, connection, direction }) => [
      connection.startCenter.y, connection.top.y, connection.endTop.y,
      ...getArmLightingPoints(arm, connection, direction).map(point => point.y)
    ]));
    const candidateY = upperEdge + offset / engine.scale;
    const abovePole = totalHeight - candidateY <= topClearance;
    const dimensionY = abovePole
      ? Math.max(candidateY, totalHeight + abovePoleOffset / engine.scale)
      : candidateY;
    let paperY = engine.toSvg(0, dimensionY).y;
    const oppositeArms = new Set(group.items.map(item => item.direction)).size === 2;
    const labels = group.items.map(({ arm }) => {
      const text = `L${index + 1}=${format(arm.length)}`;
      const probe = engine.drawText(0, 0, text);
      const width = probe.getComputedTextLength();
      probe.remove();
      return { text, width };
    });
    // Reserve 2.5 mm for each arrow plus 2 mm of text clearance.
    const outside = group.items.some(({ arm }, i) =>
      labels[i].width + 7 > arm.length * engine.scale);
    if (outside) {
      const center = engine.toSvg(0, abovePole ? totalHeight : Math.max(...group.items.map(item => item.connection.startCenter.y)));
      const gap = 30 * engine.scale;
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const obstacles = [...occupiedArmLabels, ...engine.leaderAnnotations.flatMap(leader => [
        ...leader.boxes,
        ...leader.segments.map(([a, b]) => ({ left: Math.min(a.x, b.x) - 1,
          right: Math.max(a.x, b.x) + 1, top: Math.min(a.y, b.y) - 1, bottom: Math.max(a.y, b.y) + 1 }))
      ])];
      const labelBoxes = y => group.items.map(({ connection, direction }, i) => {
        const end = engine.toSvg(direction * connection.endCenter.x, connection.endCenter.y);
        const x = end.x + direction * 4;
        return { left: (direction === 1 ? x : x - labels[i].width) - 1.5,
          right: (direction === 1 ? x + labels[i].width : x) + 1.5,
          top: y - 7, bottom: y };
      });
      // Raise the dimension in 8 paper mm steps until its outside labels clear leaders.
      while (paperY > 20 && labelBoxes(paperY).some(box => obstacles.some(area => overlaps(box, area)))) {
        paperY -= 8;
      }
      const reserved = labelBoxes(paperY);
      occupiedArmLabels.push(...reserved);
      // Diameter placement runs later and must also avoid these labels.
      engine.leaderAnnotations.push({ boxes: reserved, segments: [] });
      engine.paperLine({ x: center.x, y: center.y - gap }, { x: center.x, y: paperY - 2 });
      group.items.forEach(({ connection, direction }, i) => {
        const end = engine.toSvg(direction * connection.endCenter.x, connection.endCenter.y);
        const tip = { x: end.x, y: paperY };
        const textGap = 4; // Paper mm outside the outer arrow.
        const shelfEnd = end.x + direction * (textGap + labels[i].width + 2);
        engine.paperLine({ x: end.x, y: end.y - gap }, { x: end.x, y: paperY - 2 });
        engine.paperLine({ x: center.x, y: paperY }, { x: shelfEnd, y: paperY });
        // Tail points outwards; arrow tip points towards the measured span.
        engine.drawArrow(tip, direction === 1 ? 0 : Math.PI);
        engine.drawText(end.x + direction * textGap, paperY - 2, labels[i].text,
          "drawing-text", { "text-anchor": direction === 1 ? "start" : "end" });
      });
      if (oppositeArms) {
        engine.element("circle", { cx: center.x, cy: paperY, r: 0.65, fill: "#111" });
      } else {
        const direction = group.items[0].direction;
        const tail = { x: center.x - direction * 4, y: paperY };
        engine.paperLine(tail, { x: center.x, y: paperY });
        engine.drawArrow({ x: center.x, y: paperY }, direction === 1 ? Math.PI : 0);
      }
      return;
    }
    for (const { arm, connection, direction } of group.items) {
      engine.drawDimension(
        { x: 0, y: abovePole ? totalHeight : connection.startCenter.y },
        { x: direction * connection.endCenter.x, y: connection.endCenter.y },
        "horizontal", -offset, `L${index + 1}=${format(arm.length)}`, paperY
      );
    }
  });
}

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
// Place lighting leaders after objects and dimensions so actual SVG geometry is known.
// Cache each rendered node's geometry once per render. Straight edges need no sampling.
function getLeaderObstacles(engine) {
  engine.leaderGeometryCache ??= new WeakMap();
  const result = [];
  for (const node of engine.root.querySelectorAll("path, polyline, line, text")) {
    let segments = engine.leaderGeometryCache.get(node);
    if (!segments) {
      segments = [];
      const tag = node.tagName.toLowerCase();
      if (tag === "line") {
        segments.push({a:{x:node.x1.baseVal.value,y:node.y1.baseVal.value},b:{x:node.x2.baseVal.value,y:node.y2.baseVal.value}});
      } else if (tag === "polyline") {
        for (let i=1;i<node.points.numberOfItems;i++) segments.push({a:node.points.getItem(i-1),b:node.points.getItem(i)});
      } else if (tag === "text") {
        const b = node.getBBox(), matrix = node.transform.baseVal.consolidate()?.matrix;
        const corners = [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]]
          .map(([x,y]) => matrix ? {x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f} : {x,y});
        corners.forEach((a,i)=>segments.push({a,b:corners[(i+1)%4]}));
      } else {
        const length = node.getTotalLength(), count = Math.max(1,Math.ceil(length/0.5));
        let a = node.getPointAtLength(0);
        for(let i=1;i<=count;i++) { const b=node.getPointAtLength(length*i/count); segments.push({a,b}); a=b; }
      }
      engine.leaderGeometryCache.set(node,segments);
    }
    result.push(...segments);
  }
  return result;
}

// Cut only a small contact gap out of the outline touched by the arrow.
function allowLeaderContact(segments, tip) {
  return segments.flatMap(({a,b}) => {
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if (!len) return [];
    const t=((tip.x-a.x)*dx+(tip.y-a.y)*dy)/(len*len);
    const nearest=Math.max(0,Math.min(1,t));
    if(Math.hypot(a.x+nearest*dx-tip.x,a.y+nearest*dy-tip.y)>0.8) return [{a,b}];
    const lo=Math.max(0,t-0.8/len),hi=Math.min(1,t+0.8/len),parts=[];
    if(lo>0) parts.push({a,b:{x:a.x+lo*dx,y:a.y+lo*dy}});
    if(hi<1) parts.push({a:{x:a.x+hi*dx,y:a.y+hi*dy},b});
    return parts;
  });
}

// One shared specification leader when both arm specifications match.
function drawArmSpecificationLeader(engine, model) {
  // Share only when height/specification match and fix angles differ.
  const groups = [];
  for (const arm of model.arms ?? []) {
    let group = groups.find(items => items[0].diameter === arm.diameter &&
      items[0].thickness === arm.thickness && items[0].material === arm.material &&
      Math.abs(items[0].height - arm.height) <= 1e-6 &&
      items.every(item => (item.fixAngle ?? 0) !== (arm.fixAngle ?? 0)));
    if (!group) { group = []; groups.push(group); }
    group.push(arm);
  }
  for (const arms of groups) drawArmSpecificationGroup(engine, { ...model, arms });
}

function drawArmSpecificationGroup(engine, model) {
  const arms=model.arms ?? [];
  if(!arms.length) return;
  const first=arms[0];
  if(!Number.isFinite(first.thickness) || first.thickness<=0) return;
  const topText=`\u00d8${format(first.diameter)} \u00d7 t${first.thickness.toFixed(1)}`;
  const saved=engine.dimensionSegments,obstacles=getLeaderObstacles(engine);
  let placement;
  for(const arm of arms) {
    const connection=getArmConnection(model.poles,arm);
    if(!connection) continue;
    const direction=getArmDirection(arm.fixAngle);
    for(const fraction of [0.5,0.75,0.25,0.9,0.1]) {
      for(const edge of ["top","bottom"]) {
        const start=connection[edge],end=connection[edge==="top"?"endTop":"endBottom"];
        const target={x:direction*(start.x+(end.x-start.x)*fraction),y:start.y+(end.y-start.y)*fraction};
        engine.dimensionSegments=allowLeaderContact(obstacles,engine.toSvg(target.x,target.y));
        // Try the original diagonal first, then steeper routes past short-arm dimensions.
        for(const rise of [12,16,20]) {
          for(const slope of [1,2,4,8]) {
            for(const up of [1,-1]) {
              const elbow={x:target.x+direction*rise/slope/engine.scale,y:target.y+up*rise/engine.scale};
              const fitted=engine.fitObjectLeader(target,elbow,topText,0,arm.material,"center", {
                minFactor: 0.8, textClearance: 4
              });
              if(!engine.lastLeaderFitBlocked){placement={target,elbow:fitted};break;}
            }
            if(placement) break;
          }
          if(placement) break;
        }
        if(placement) break;
      }
      if(placement) break;
    }
    if(placement) break;
  }
  engine.dimensionSegments=saved;
  if(placement) engine.drawLeader(placement.target,placement.elbow,topText,first.material);
  else engine.unplacedArmSpecificationLeader=true;
}

function drawArmLightingLeader(engine, model) {
  for (const arm of model.arms ?? []) {
    const connection = getArmConnection(model.poles, arm);
    if (!connection) continue;
    const direction = getArmDirection(arm.fixAngle);
    const points = getArmLightingPoints(arm, connection, direction);
    const saved = engine.dimensionSegments;
    const obstacles = getLeaderObstacles(engine);
    let placement;
    // Try outside edge, upper edge, then lower edge, with multiple directions.
    for (const [i,j] of [[1,2],[2,3],[0,1]]) {
      const target = {x:(points[i].x+points[j].x)/2,y:(points[i].y+points[j].y)/2};
      const tip = engine.toSvg(target.x,target.y);
      // Allow only the intended arrow contact with the object's outline.
      engine.dimensionSegments = allowLeaderContact(obstacles, tip);
      for (const distance of [12,20,28]) {
        for (const [side,up] of [[direction,1],[-direction,1],[direction,-1],[-direction,-1]]) {
          const elbow = {x:target.x+side*distance/engine.scale,y:target.y+up*distance/engine.scale};
          const fitted = engine.fitObjectLeader(target,elbow,"\u706f\u5177",0,"","center", {
            textClearance: 4
          });
          if (!engine.lastLeaderFitBlocked) { placement={target,elbow:fitted}; break; }
        }
        if (placement) break;
      }
      if (placement) break;
    }
    engine.dimensionSegments = saved;
    if (placement) engine.drawLeader(placement.target,placement.elbow,"灯具");
    else engine.unplacedArmLightingLeaders = (engine.unplacedArmLightingLeaders ?? 0) + 1;
  }
}

function drawObjectLeader(engine, model) {
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const lightingHeight = LIGHTING_HEIGHT; // Match drawLightingSchematic().
  const lightingWidth = LIGHTING_WIDTH;
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
// Group connected segments in input order (top to bottom).
function groupConnectedPoles(model) {
  const groups = [];
  for (const [index, pole] of model.poles.entries()) {
    const group = groups[groups.length - 1];
    const previous = group?.members[group.members.length - 1].pole;
    const connected = previous && Math.abs(previous.Lower_D - pole.Upper_D) < 1e-9;
    const sameSpecification = previous && Object.is(previous.thickness, pole.thickness)
      && previous.material === pole.material;
    if (connected && sameSpecification) group.members.push({ pole, index });
    else groups.push({ members: [{ pole, index }] });
  }
  return groups;
}

function drawLeaderPoleTaperThickness(engine, model) {
  const groups = groupConnectedPoles(model);
  for (const group of groups) {
    if (!group.members.some(({pole}) => pole.type === "tapered")) continue;
    const { pole } = group.members.find(({ pole }) => pole.type === "tapered");
    const ratio = calculateTaperRatio(pole.Lower_D, pole.Upper_D, pole.height);
    // Preserve the project's existing five-decimal ratio comparison for isolated poles.
    const description = group.members.length > 1 || Number(ratio.toFixed(5)) !== 0.01
      ? "温間スピニングテーパー" : "1/100テーパー";
    const thicknessText = Number.isFinite(pole.thickness) && pole.thickness > 0
      ? pole.thickness.toFixed(1) : "?";
    const topText = `${description}(t${thicknessText})`;
    const bottomText = `(JIS G3444 ${pole.material})`;
    const leaderOffset = 12 / engine.scale;
    let placement;
    let fallback;
    // Prefer tapered segments; only then try other members of this connected group.
    const candidates = [
      ...group.members.filter(({ pole }) => pole.type === "tapered"),
      ...group.members.filter(({ pole }) => pole.type !== "tapered")
    ];
    for (const { pole: segment, index } of candidates) {
      const bottomY = model.poles.slice(index + 1).reduce((sum, item) => sum + item.height, 0);
      for (const fraction of [0.5, 0.65, 0.35, 0.8, 0.2]) {
        const diameter = segment.Lower_D + (segment.Upper_D - segment.Lower_D) * fraction;
        const target = { x: diameter / 2, y: bottomY + segment.height * fraction };
        const elbow = { x: target.x + leaderOffset, y: target.y + leaderOffset };
        const fitted = engine.fitObjectLeader(target, elbow, topText, 0, bottomText, "left");
        const candidate = { target, elbow: fitted };
        // Keep a fallback on Pole 1 of the group if no segment has sufficient space.
        if (!fallback || (index === group.members[0].index && fraction === 0.5)) fallback = candidate;
        // Reserve space for both text rows plus clearance, in paper mm.
        const textMargin = 7 / engine.scale;
        const fitsSegment = fitted.y + textMargin <= bottomY + segment.height &&
          fitted.y - textMargin >= bottomY;
        if (fitsSegment && !engine.lastLeaderFitBlocked) {
          placement = candidate;
          break;
        }
      }
      if (placement) break;
    }
    placement ??= fallback;
    engine.drawLeader(placement.target, placement.elbow, topText, bottomText, 0, "left");
  }
}

















// Horizontal extents in engineering mm, measured from the pole centerline.
function getHorizontalDrawingBounds(model) {
  const maxDiameter = Math.max(...model.poles.flatMap(pole => [pole.Upper_D, pole.Lower_D]));
  // Include the 350 mm baseplate and the lighting schematic (-100 to 500).
  let left = Math.max(maxDiameter / 2, 175);
  let right = Math.max(maxDiameter / 2, 175, model.directObjectCount > 0 ? LIGHTING_WIDTH - 100 : 0);
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  let minY = -CENTERLINE_EXTENSION;
  let maxY = totalHeight + (model.directObjectCount > 0
    ? Math.max(LIGHTING_HEIGHT, 120 + CENTERLINE_EXTENSION) : CENTERLINE_EXTENSION);
  for (const arm of model.arms ?? []) {
    const connection = getArmConnection(model.poles, arm);
    if (!connection) continue;
    const radians = (arm.verticalAngle ?? 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.abs(Math.sin(radians));
    const adapterLength = arm.adapterLength ?? 120;
    const adapterDiameter = arm.adapterDiameter ?? 60.5;
    const reach = Math.max(
      arm.length + sin * arm.diameter / 2,
      arm.length + cos * adapterLength + sin * adapterDiameter / 2,
      arm.length + cos * (adapterLength + CENTERLINE_EXTENSION)
    );
    if (getArmDirection(arm.fixAngle) === -1) left = Math.max(left, reach);
    else right = Math.max(right, reach);
    const direction = getArmDirection(arm.fixAngle);
    const lightingPoints = getArmLightingPoints(arm, connection, direction);
    for (const point of lightingPoints) {
      left = Math.max(left, -point.x);
      right = Math.max(right, point.x);
    }
    const signedSin = Math.sin(radians);
    const tipY = connection.endCenter.y + adapterLength * signedSin;
    const halfY = Math.abs(cos) * adapterDiameter / 2;
    const centerlineY = connection.endCenter.y + (adapterLength + CENTERLINE_EXTENSION) * signedSin;
    const heights = [connection.top.y, connection.bottom.y, connection.endTop.y,
      connection.endBottom.y, tipY - halfY, tipY + halfY, centerlineY,
      ...lightingPoints.map(point => point.y)];
    minY = Math.min(minY, ...heights);
    maxY = Math.max(maxY, ...heights);
  }
  for (const { object } of getObjectHeightOrder(model)) maxY = Math.max(maxY, object.height);
  return { left, right, minY, maxY };
}

// Fit the complete horizontal envelope, then move the pole origin within the page.
function getSchematicPageLayout(model) {
  const bounds = getHorizontalDrawingBounds(model);
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const radius = Math.max(...model.poles.flatMap(pole => [pole.Upper_D, pole.Lower_D])) / 2;
  const objectCount = getObjectHeightOrder(model).length;
  const columns = objectCount ? 12 + (objectCount - 1) * 8 : 0;
  const pageLeft = 10, pageRight = 200;
  const leaderSpace = 24; // Paper mm outside object geometry.
  const widths = scale => ({
    // Pole height dimensions extend 48 mm left of the pole, plus text clearance.
    left: Math.max(bounds.left * scale + leaderSpace, radius * scale + 56),
    right: Math.max(
      bounds.right * scale + leaderSpace + columns,
      175 * scale + 16 + columns,
      radius * scale + 56 + columns // Reserve space for pole specification leaders.
    )
  });
  const verticalScale = Math.min(170 / totalHeight,
    125 / (bounds.maxY - totalHeight / 2),
    110 / (totalHeight / 2 - bounds.minY));
  let low = 0, high = verticalScale;
  // Monotonic fit: find the largest scale fitting both sides together.
  for (let i = 0; i < 48; i++) {
    const candidate = (low + high) / 2;
    const width = widths(candidate);
    if (width.left + width.right <= pageRight - pageLeft) low = candidate;
    else high = candidate;
  }
  const scale = low;
  const width = widths(scale);
  const spare = pageRight - pageLeft - width.left - width.right;
  return {
    scale,
    origin: { x: pageLeft + width.left + spare / 2, y: 170 + totalHeight * scale / 2 }
  };
}

function render(model) {
  content.replaceChildren();
  
  // Total tinggi seluruh pole
  const totalHeight = model.poles.reduce((sum, pole) => sum + pole.height, 0);
  const MaxDiameter = Math.max(...model.poles.flatMap(pole => [pole.Upper_D, pole.Lower_D]));
  const { scale, origin } = getSchematicPageLayout(model);
  const engine = new DrawingEngine(content, origin, scale);
  engine.drawText(16, 20, "Pole with Parametric Dimensions", "drawing-text heading");
  engine.drawText(16, 28, "Model units: mm | A4 portrait | Automatic scale", "drawing-text note");
  // Draw Objects
  drawPole(engine, model);
  drawArm(engine, model);
  drawBaseplate(engine, model);
  drawOpeningBox(engine, model);
  if (model.directObjectCount > 0) {
    drawAdapterTop(engine, model);
    drawLightingSchematic(engine, model);
  }
  // Center lines
  drawPoleCenterLine(engine, model);
  drawArmCenterLine(engine, model);
  drawOpeningBoxCenterLine(engine, model);
  drawGroundReference(engine);
  // Dimension lines
  const heightLabels = createHeightDimensionLabels(model, true); // false = values without H.
  engine.deferDiameterDimensions = true;
  engine.collectDimensions = true;
  drawTaperCenterDimensions(engine, model, heightLabels);
  drawPoleDimensions(engine, model, heightLabels);
  drawOpeningBoxDimensions(engine, model);
  engine.collectDimensions = false;
  // Pole leaders (Straight only).
  drawPoleLeader(engine, model);
  drawLeaderPoleTaperThickness(engine, model);
  if (model.directObjectCount > 0) drawObjectLeader(engine, model);
  drawOpeningBoxLeader(engine, model);
  engine.collectDimensions = true;
  drawObjectHeightDimensions(engine, model, heightLabels);
  drawDimensionArm(engine, model);
  engine.collectDimensions = false;
  // Pick diameter quadrants only after measuring the final leader positions.
  engine.deferDiameterDimensions = false;
  engine.collectDimensions = true;
  for (const args of engine.pendingDiameterDimensions) {
    engine.drawDiameterDimension(...args);
  }
  engine.pendingDiameterDimensions = [];
  engine.collectDimensions = false;
  drawArmSpecificationLeader(engine, model);
  drawArmLightingLeader(engine, model);

  // engine.drawText(16, 269, `Scale ≈ 1 : ${format(1 / scale)} | Length ${format(model.Upper_D)} mm × Height ${format(model.height)} mm`, "drawing-text note");
  status.textContent = `Poles: ${model.poleCount} | Max diameter: ${format(MaxDiameter)} mm | Total height: ${format(totalHeight)} mm. Drawing scale ≈ 1 : ${format(1 / scale)}.`;
  if (engine.unplacedArmSpecificationLeader) status.textContent += " Arm specification leader: no clear position available.";
  if (engine.unplacedArmLightingLeaders) {
    status.textContent += ` ${engine.unplacedArmLightingLeaders} arm lighting leader(s): no clear position available.`;
  }
}

function updateDrawing() {
  // Optional editor bridge can protect a manual revision without changing geometry.
  if (!window.dispatchEvent(new CustomEvent("schematic:before-generate", { cancelable: true }))) return;
  // Capture the latest values from the getters for this render.
  const model = {
    poleCount: parameters.poleCount,
    poles: parameters.poles,
    armCount: parameters.armCount,
    arms: parameters.arms,
    directObjectCount: parameters.directObjectCount,
    directObject: parameters.directObject,
    overHeadWireCount: parameters.overHeadWireCount,
    overHeadWire: parameters.overHeadWire
  };

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

  for (const [index, arm] of model.arms.entries()) {
    if (!getArmConnection(model.poles, arm)) {
      status.textContent = `Arm ${index + 1}: enter a positive diameter and length, a fix angle from 0 to 360 degrees, and a vertical angle between -90 and 90 degrees (exclusive). The full connection must fit within one pole segment, and length must extend past the pole surface. The last drawing is kept if available.`;
      return;
    }
  }

  render(model);
  window.dispatchEvent(new CustomEvent("schematic:generated"));
}

// Coalesce typing and the following change event into one redraw.
let drawingTimer;
function scheduleDrawing() {
  clearTimeout(drawingTimer);
  drawingTimer = setTimeout(updateDrawing, 120);
}
form.addEventListener("input", scheduleDrawing);
form.addEventListener("change", scheduleDrawing);
window.addEventListener("schematic:regenerate", () => {
  clearTimeout(drawingTimer);
  updateDrawing();
});

updateDrawing();
