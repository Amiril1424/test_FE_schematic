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
  drawPole(engine, model);
  drawBaseplate(engine, model);
  drawOpeningBox(engine, model);
  drawAdapterTop(engine, model);
  drawLightingSchematic(engine, model);
  drawPoleCenterLine(engine, model);
  drawOpeningBoxCenterLine(engine, model);

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
