"use strict";       //Make javascript code more strict and avoid some silent errors.(should declare variables, no duplicate params, etc.)

// Model: actual engineering dimensions in mm, independent of the screen.
// Put the size of shape into parameters object.
//default values for the rectangle, in mm. The drawing will be scaled to fit on A4 paper.
// event use const, property change is allowed. parameters.width = 8000; --> bisa
const parameters = { width: 139.8, height: 5000 }; 
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

// Draw Objects here:
// Pole
function drawPole(engine, model) {
  const w = model.width;
  const h = model.height;
  engine.drawPolyline([
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
    { x: 0, y: 0 }
  ]);
}


























function render(model) {
  content.replaceChildren();
  // Fit actual geometry into a 140 × 170 mm drawing area on the paper.
  const scale = Math.min(140 / model.width, 170 / model.height);
  const origin = { x: 110 - model.width * scale / 2, y: 148 + model.height * scale / 2 };
  const engine = new DrawingEngine(content, origin, scale);
  engine.drawText(16, 20, "Pole with Parametric Dimensions", "drawing-text heading");
  engine.drawText(16, 28, "Model units: mm | A4 portrait | Automatic scale", "drawing-text note");
  drawPole(engine, model);

  engine.drawText(16, 269, `Scale ≈ 1 : ${format(1 / scale)} | Length ${format(model.width)} mm × Height ${format(model.height)} mm`, "drawing-text note");
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
