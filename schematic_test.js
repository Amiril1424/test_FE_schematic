"use strict";

// Model: actual engineering dimensions in mm, independent of the screen.
const parameters = { width: 6000, height: 4000 };
const NS = "http://www.w3.org/2000/svg";
const content = document.getElementById("drawing-content");
const form = document.getElementById("parameters");
const status = document.getElementById("status");
const format = (value) => Number(value.toFixed(2)).toLocaleString("id-ID");

// Small drawing engine. SVG viewBox units represent mm on the A4 paper.
class DrawingEngine {
  constructor(root, origin, scale) {
    this.root = root;
    this.origin = origin;
    this.scale = scale; // paper mm / actual mm
  }

  // Engineering: +Y up. SVG: +Y down. Only this function converts coordinates.
  toSvg(xMm, yMm) {
    return { x: this.origin.x + xMm * this.scale, y: this.origin.y - yMm * this.scale };
  }

  element(tag, attributes, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    this.root.appendChild(node);
    return node;
  }

  paperLine(a, b, className = "dimension-line") {
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
  drawDimension(a, b, orientation, offset, label) {
    const start = this.toSvg(a.x, a.y);
    const end = this.toSvg(b.x, b.y);
    const horizontal = orientation === "horizontal";
    const p = horizontal ? { x: start.x, y: start.y + offset } : { x: start.x + offset, y: start.y };
    const q = horizontal ? { x: end.x, y: end.y + offset } : { x: end.x + offset, y: end.y };
    const sign = Math.sign(offset);
    for (const [anchor, target] of [[start, p], [end, q]]) {
      this.paperLine(
        { x: anchor.x + (horizontal ? 0 : sign), y: anchor.y + (horizontal ? sign : 0) },
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
}

function drawRectangle(engine, model) {
  const w = model.width;
  const h = model.height;
  engine.drawPolyline([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: 0 }]);
  const extension = 5 / engine.scale;
  engine.drawLine({ x: w / 2, y: -extension }, { x: w / 2, y: h + extension }, "centerline");
  engine.drawLine({ x: -extension, y: h / 2 }, { x: w + extension, y: h / 2 }, "centerline");
  engine.drawDimension({ x: 0, y: 0 }, { x: w, y: 0 }, "horizontal", 14, `${format(w)} mm`);
  engine.drawDimension({ x: 0, y: 0 }, { x: 0, y: h }, "vertical", -14, `${format(h)} mm`);
}

function render(model) {
  content.replaceChildren();
  // Fit actual geometry into a 140 × 170 mm drawing area on the paper.
  const scale = Math.min(140 / model.width, 170 / model.height);
  const origin = { x: 110 - model.width * scale / 2, y: 148 + model.height * scale / 2 };
  const engine = new DrawingEngine(content, origin, scale);
  engine.drawText(16, 20, "Rectaangular with Parametric Dimensions", "drawing-text heading");
  engine.drawText(16, 28, "Model units: mm | A4 portrait | Automatic scale", "drawing-text note");
  drawRectangle(engine, model);

  // Local axes show the engineering origin. Their displayed length is fixed.
  const axisLength = 10 / scale;
  engine.drawLine({ x: 0, y: 0 }, { x: axisLength, y: 0 }, "axis-line");
  engine.drawLine({ x: 0, y: 0 }, { x: 0, y: axisLength }, "axis-line");
  engine.drawText(origin.x + 11, origin.y - 1, "X →", "drawing-text axis-label");
  engine.drawText(origin.x + 1, origin.y - 11, "Y ↑", "drawing-text axis-label");
  engine.drawText(origin.x + 2, origin.y + 6, "(0, 0)", "drawing-text axis-label");
  engine.drawText(16, 269, `Scale ≈ 1 : ${format(1 / scale)} | Length ${format(model.width)} mm × Height ${format(model.height)} mm`, "drawing-text note");
  // engine.drawText(16, 276, "Thick: object · Thin: dimension · Long-dash-dot: centerline", "drawing-text note");
  status.textContent = `Size: ${format(model.width)} × ${format(model.height)} mm. Drawing scale ≈ 1 : ${format(1 / scale)}.`;
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", () => {
  if (!form.checkValidity()) {
    status.textContent = "Enter length and height between 1 and 100,000 mm. The last drawing is still displayed.";
    return;
  }
  parameters.width = document.getElementById("width").valueAsNumber;
  parameters.height = document.getElementById("height").valueAsNumber;
  render(parameters);
});

render(parameters);
