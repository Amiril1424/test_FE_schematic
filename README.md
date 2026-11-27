# Schematic V2 - Panduan integrasi iframe untuk frontend tim

Frontend React tim menjadi sumber input engineering. Schematic menerima parameter
melalui postMessage, membuat SVG A4, dan menyediakan editor SVG manual.
V2 dibuka melalui `schematic_v2.html`; V1 tetap tersedia di `index.html`.

## 1. Jalankan dan deploy

```powershell
git clone https://github.com/Amiril1424/test_FE_schematic.git
cd test_FE_schematic
npm.cmd start
```

Buka http://127.0.0.1:8080/schematic_v2.html. Jangan membuka file HTML langsung.
`EADDRINUSE`: port sudah digunakan; periksa server yang berjalan.
`ERR_CONNECTION_REFUSED`: server lokal tidak menerima koneksi.

Deploy sebagai static site dengan struktur folder tetap. Sertakan semua modul V2,
CSS, `schematic_v2.html`, `editor.html`, `editor_bridge.js`, `schematic_editor.js`,
`schematic_embed.js`, dan `vendor/svgedit/`. Jangan deploy hanya satu file engine.
`node_modules` dan `test-results` tidak diperlukan pada hosting. Daftar lengkap:
[docs/integration-files.txt](docs/integration-files.txt).

Gunakan URL deployment untuk tim/pengguna lain: 127.0.0.1 mengarah ke komputer
masing-masing. Push Git tidak menjamin deployment hosting sudah selesai.

## 2. Alur integrasi dan lokasi mapping

```text
Form React tim
  -> adapter payload di React
  -> postMessage SET_PARAMETERS
  -> schematic_embed.js: applyParametersToForm()
  -> form internal iframe (disembunyikan pada mode embed)
  -> schematic_Lighting_1a.js: readProjectFromForm(), validateProject()
  -> schematic_v2_app.js -> schematic_final.js -> SVG
  -> SCHEMATIC_GENERATED / SCHEMATIC_APPLIED -> FE / backend / report
```

ID input React tidak perlu sama dengan ID HTML schematic. Tim menyamakan kontrak
payload, satuan, dan acuan tinggi. Jangan menghapus form internal: bridge saat ini
masih memakainya. Engine menerima data biasa, tetapi bridge belum langsung
mengirim payload ke engine tanpa perantara DOM.

## 3. Kontrak parameter

Kirim **snapshot lengkap setiap generate**, bukan patch parsial. Field yang tidak
dikirim dapat mempertahankan nilai lama pada form internal. Gunakan number tanpa
teks satuan; kirim array kosong `[]` untuk komponen yang tidak digunakan.

| Bagian | Field | Satuan / nilai |
| --- | --- | --- |
| installation | type, depth | on-gl / embedment / baseplate-under-gl; depth mm |
| poles | name, type, material, lowerDiameter, upperDiameter, thickness, upperThickness, height, quantity | Ukuran mm; type straight / tapered |
| arms | name, type, material, diameter, thickness, height, length, fixAngle, verticalAngle | mm dan degree; type straight |
| directObjects | name, areaFront, areaSide, height, quantity | Area m2; height mm |
| overheadWires | name, diameter, weight, height, span, fixAngle | mm; weight kg/m; sudut degree |

Batas bridge: 1-3 pole, 0-2 arm, 0-3 baris Direct Object, 0-4 OHW. Jumlah ditentukan
panjang array; kelebihan akan dipotong bridge. Quantity DO pada elevasi sama dijumlahkan,
maksimum 3 instance. Material harus sesuai pilihan form internal. Tambahan material
pada FE perlu ditambahkan juga pada pilihan internal schematic.

Gunakan ejaan `overheadWires`. Alias lama `overHeadWires` masih diterima, tetapi jangan
mengirim keduanya. Kirim `pole.type` eksplisit; jangan mengandalkan deteksi tipe dari
alias diameter lama.

### Acuan engineering

- Pole diurutkan **paling atas ke bawah**. Height pole adalah panjang segmen.
- Under GL: total pole = jumlah height segmen; depth **tidak ditambahkan**.
  Contoh 8000 + 400, depth 300: H1=8400, top Y=8100, bawah baseplate Y=-300.
  Implementasi sekarang mensyaratkan depth lebih kecil dari height segmen terbawah.
- On GL: depth efektif 0. Embedment: height segmen adalah bagian di atas GL,
  sedangkan depth menjadi tambahan bagian tertanam.
- Height arm adalah center ujung arm; length adalah proyeksi horizontal dari
  centerline pole, tidak termasuk adapter/lighting.
- Under GL: height arm/OHW/DO diukur dari bawah baseplate. On GL/Embedment: dari GL.
  Engine mengurangi depth untuk koordinat GL; FE jangan menguranginya lagi.
- DO tepat di puncak memakai simbol lighting/adapter. Saat ini pole-top mendukung
  satu lighting. DO pada elevasi lain memakai box berdasarkan Area Front.
- Span OHW dalam mm: 10 meter dikirim `10000`; leader menampilkan meter.
- ID database FE belum diteruskan sebagai ID tetap: form membuat pole-1, arm-1,
  object-1, wire-1 berdasarkan urutan. Simpan mapping ID FE secara terpisah.
- `drawingSettings` belum dipetakan melalui SET_PARAMETERS.

### Contoh payload lengkap

```js
const parameters = {
  installation: { type: 'baseplate-under-gl', depth: 300 },
  poles: [
    { name: 'Upper', type: 'tapered', material: 'STK400',
      lowerDiameter: 165, upperDiameter: 85, thickness: 4,
      upperThickness: 4, height: 8000, quantity: 1 },
    { name: 'Lower', type: 'straight', material: 'STK400',
      lowerDiameter: 165, upperDiameter: 165, thickness: 4,
      upperThickness: 4, height: 400, quantity: 1 }
  ],
  arms: [
    { name: 'Arm 1', type: 'straight', material: 'STK400',
      diameter: 60.5, thickness: 3.8, height: 8300, length: 180,
      fixAngle: 0, verticalAngle: 5 }
  ],
  directObjects: [
    { name: 'Box', areaFront: 0.1, areaSide: 0.1, height: 4000, quantity: 1 }
  ],
  overheadWires: [
    { name: 'DV3.2-2C', diameter: 11.5, weight: 0.19,
      height: 6000, span: 10000, fixAngle: 0 }
  ]
};
```

## 4. Origin dan hosting iframe

Daftarkan origin FE produksi pada meta `schematic-parent-origins` di
`schematic_v2.html`. Origin lengkap dengan scheme/port, tanpa path. Wildcard pada
teks meta tidak diproses sebagai wildcard generik.

Bridge sekarang juga menerima query `parentOrigin`, localhost/127.0.0.1 semua port,
dan hostname berakhiran `.netlify.app`. Untuk produksi yang dibatasi, sesuaikan
allowlist di `schematic_embed.js` menjadi origin eksplisit. Atur header hosting/CSP
agar parent boleh memuat iframe dan editor lokal dapat dimuat. Jangan menambahkan
sandbox tanpa menguji kebutuhan script, same-origin, dialog dan download.

Gunakan targetOrigin spesifik saat mengirim pesan. Saat menerima pesan, cek
`event.origin` dan `event.source` terhadap iframe yang dimaksud.

## 5. Protokol postMessage

`version: 1` adalah versi protokol, **bukan** versi prototype.

| React ke iframe | Payload |
| --- | --- |
| SET_PARAMETERS | Seluruh parameter + replaceManualEdit: false |
| OPEN_EDITOR | {} - kirim setelah generate berhasil |
| GET_SNAPSHOT | {} |
| OPEN_PROJECT | { project: savedProject } - format proyek V2 lengkap |

| iframe ke React | Isi / tindakan |
| --- | --- |
| SCHEMATIC_READY | Host siap; belum berarti SVG dari input FE sudah dibuat |
| SCHEMATIC_GENERATED | payload.svg, parameters, isStale; cek juga blocked |
| SCHEMATIC_APPLIED | payload.svg hasil Apply; event tanpa requestId |
| SCHEMATIC_SNAPSHOT | payload.snapshot |
| SCHEMATIC_ERROR | payload.message |
| SCHEMATIC_EDITOR_CANCELLED | Hasil sebelumnya dipertahankan |

Jika `blocked: true`, hasil manual dipertahankan dan belum sesuai input baru.
Minta persetujuan user sebelum mengirim ulang `replaceManualEdit: true`.
Jangan menganggap semua SCHEMATIC_GENERATED sebagai sukses menghasilkan SVG baru.
Gunakan requestId untuk mencocokkan respons; jangan menumpuk request generate.

## 6. Contoh React

Parent menyediakan `parameters` dari adapter form tim. Contoh memakai tombol
Generate, memasang listener sebelum iframe dimuat, dan memeriksa sumber pesan.
Ganti URL lokal menjadi URL deployment saat integrasi produksi.

```jsx
import { useEffect, useRef, useState } from 'react';
const url = new URL('http://127.0.0.1:8080/schematic_v2.html');

export function SchematicV2({ parameters, onSvg }) {
  const frame = useRef(null);
  const pending = useRef(null);
  const output = useRef(onSvg);
  output.current = onSvg;
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function receive(event) {
      if (event.origin !== url.origin ||
          event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.version !== 1) return;
      if (data.type === 'SCHEMATIC_READY') setReady(true);
      else if (data.type === 'SCHEMATIC_APPLIED') {
        output.current(data.payload.svg, { edited: true });
      } else if (data.type === 'SCHEMATIC_GENERATED' &&
                 data.requestId === pending.current) {
        pending.current = null;
        setBusy(false);
        if (data.payload.blocked || data.payload.isStale) {
          setMessage('Hasil manual dipertahankan; parameter belum diterapkan.');
          return;
        }
        setGenerated(true);
        setMessage('Schematic siap.');
        output.current(data.payload.svg, { edited: false });
      } else if (data.type === 'SCHEMATIC_ERROR') {
        if (data.requestId === pending.current) {
          pending.current = null;
          setBusy(false);
        }
        setMessage(data.payload.message);
      }
    }
    window.addEventListener('message', receive);
    setMounted(true);
    return () => window.removeEventListener('message', receive);
  }, []);

  function send(type, payload, requestId = crypto.randomUUID()) {
    frame.current.contentWindow.postMessage(
      { version: 1, type, requestId, payload }, url.origin
    );
  }
  function generate(replaceManualEdit = false) {
    if (!ready || busy) return;
    if (replaceManualEdit && !window.confirm('Ganti hasil edit manual?')) return;
    const requestId = crypto.randomUUID();
    pending.current = requestId;
    setBusy(true);
    send('SET_PARAMETERS', { ...parameters, replaceManualEdit }, requestId);
  }
  return <>
    <button disabled={!ready || busy} onClick={() => generate()}>Generate</button>
    <button disabled={!ready || busy} onClick={() => generate(true)}>
      Generate ulang dan ganti hasil manual
    </button>
    <button disabled={!generated || busy} onClick={() => send('OPEN_EDITOR', {})}>
      Edit SVG
    </button>
    <p role="status">{message}</p>
    {mounted && <iframe ref={frame} src={url.href} title="Schematic V2"
      style={{ width: '100%', height: '100vh', border: 0 }} />}
  </>;
}
```

Untuk produksi tambahkan timeout, reset ready/generated ketika iframe dimuat ulang,
validasi input dan status draft berubah. Jika auto-generate diperlukan, debounce
input dan hindari request bersamaan. OPEN_EDITOR sebaiknya dikirim setelah respons
generate sukses, bukan hanya READY. Jangan mengandalkan autoOpenEditor untuk menunggu
parameter FE.

## 7. Simpan proyek dan gunakan SVG pada report

Pada mode iframe, form dan tombol Save/Open/Download internal disembunyikan CSS.
FE menyediakan UI penyimpanan sendiri. Apply memperbarui preview, bukan backend.
Simpan input FE terbaru, parameter pembentuk gambar, generatedSvg, editedSvg, dan
status stale. Hasil manual tidak otomatis sesuai dengan parameter baru.

GET_SNAPSHOT mengembalikan `engine`, `engineeringProject`, `parameters`,
`generatedSvg`, `editedSvg`, `status`, `applied`, dan `stale` antara lain.
`parameters` adalah mapping ID form internal ke string, **bukan payload engineering**.
Jangan mengirim mapping tersebut sebagai SET_PARAMETERS.

Untuk OPEN_PROJECT, bentuk format proyek berikut dari snapshot:

```js
const projectFile = {
  format: 'pole-schematic', version: 1, engine: 'v2',
  parameters: snapshot.parameters,
  draftParameters: snapshot.parameters,
  engineeringProject: snapshot.engineeringProject,
  generatedStatus: snapshot.status,
  generatedSvg: snapshot.generatedSvg,
  editedSvg: snapshot.editedSvg ?? null
};
// send('OPEN_PROJECT', { project: projectFile });
```

Contoh ini memulihkan parameter pembentuk gambar. Simpan draft React terpisah bila
berbeda: GET_SNAPSHOT belum mengekspor draft internal lengkap. Restore dapat meminta
konfirmasi. Jika user membatalkan OPEN_PROJECT, bridge belum mengirim acknowledgment
pembatalan; FE perlu menangani timeout. Proyek V1 dibuka di V1, belum ada migrasi
otomatis ke V2.

Untuk report gunakan `editedSvg ?? generatedSvg` setelah memeriksa stale. SVG A4
berukuran 210mm x 297mm; tempatkan SVG pada halaman kedua setelah cover, bukan seluruh
iframe form/editor. Validasi/sanitasi SVG dari storage atau sumber lain sebelum
memasukkannya ke DOM report. Penyimpanan backend dan pipeline PDF ditangani tim FE/backend.

## 8. Tes penerimaan dan batas implementasi

1. Kirim payload contoh dan periksa H1=8400 pada Under GL.
2. Uji array kosong, batas jumlah, dan perpindahan installation.
3. Edit teks, Apply, dan terima SCHEMATIC_APPLIED.
4. Ubah input setelah edit: hasil manual tetap ada sampai penggantian disetujui.
5. Save/reload/restore, periksa SVG A4, font, garis putus-putus dan teks Jepang.
6. Periksa penolakan origin salah dan pesan error parameter.

Dengan server tetap berjalan dan Microsoft Edge terpasang:

```powershell
npm.cmd ci
npm.cmd run test:editor
node tests/v2-editor.cjs
node tests/v2-pole-chain.cjs
node tests/v2-under-gl-total.cjs
npm.cmd run test:v2
```

Suite V2 masih memiliki fixture lama yang perlu disesuaikan dengan aturan Under GL
terbaru. Kasus diameter atas masih dapat melaporkan `diameter-space`. Tes tertentu
lulus tidak berarti semua layout bebas masalah. Catatan aturan:
[installation](docs/v2-installation.md), [content parity](docs/v2-content-parity.txt).

Tag `schematic-before-svg-editor` tetap menjadi referensi V1. Gunakan V1 untuk JSON
V1 dan V2 untuk JSON V2. README ini mendokumentasikan implementasi sekarang;
penyesuaian dokumentasi tidak mengubah engine atau melakukan deploy otomatis.
