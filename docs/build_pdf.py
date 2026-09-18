"""Build the complete explanation PDF; libraries live in the temporary directory."""
from pathlib import Path
import os
import sys
import re
from html import escape
import textwrap

sys.path.insert(0, str(Path(os.environ['TEMP']) / 'schematic-pdf-libs'))
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted
from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
source = (HERE / 'penjelasan_javascript.md').read_text(encoding='utf-8')
output = HERE / 'Penjelasan_JavaScript_Schematic.pdf'
fonts = Path('C:/Windows/Fonts')
for name, filename in [('Body', 'arial.ttf'), ('BodyBold', 'arialbd.ttf'), ('Mono', 'consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='Body', boldItalic='BodyBold')

INK = colors.HexColor('#15253b')
BLUE = colors.HexColor('#235a87')
PALE = colors.HexColor('#f1f5f9')
width = A4[0] - 100
styles = {
    'body': ParagraphStyle('Body', fontName='Body', fontSize=10, leading=15, textColor=INK, spaceAfter=8),
    'heading': ParagraphStyle('Heading', fontName='BodyBold', fontSize=14, leading=19, textColor=BLUE, spaceBefore=16, spaceAfter=12, keepWithNext=True),
    'code': ParagraphStyle('Code', fontName='Mono', fontSize=8, leading=11, textColor=INK),
    'table': ParagraphStyle('Cell', fontName='Body', fontSize=9, leading=13, textColor=INK),
    'title': ParagraphStyle('Title', fontName='BodyBold', fontSize=27, leading=34, textColor=INK, spaceAfter=18),
    'subtitle': ParagraphStyle('Subtitle', fontName='Body', fontSize=13, leading=20, textColor=BLUE, spaceAfter=18),
}

def inline(s):
    rendered = []
    cursor = 0
    for match in re.finditer(r'\*\*(.+?)\*\*|`([^`]+)`', s):
        rendered.append(escape(s[cursor:match.start()]))
        if match.group(1) is not None:
            rendered.append('<b>' + inline(match.group(1)) + '</b>')
        else:
            rendered.append('<font name="Mono" size="9">' + escape(match.group(2)) + '</font>')
        cursor = match.end()
    rendered.append(escape(s[cursor:]))
    return ''.join(rendered)

def para(s, style='body'):
    return Paragraph(inline(s), styles[style])

expected = []
story = [Spacer(1, 45), para('PENJELASAN JAVASCRIPT', 'subtitle'),
         para('Drawing engine SVG parametrik', 'title'),
         para('Panduan lengkap schematic_test.js', 'subtitle'),
         para('Koordinat engineering · Parameter ukuran · SVG pada halaman A4'),
         Spacer(1, 18),
         para('Dokumen ini memuat seluruh penjelasan dari percakapan sebelumnya, termasuk 14 bagian, potongan kode, tabel, diagram teks, dan contoh perhitungan. Isi penjelasan dipertahankan; tata letaknya disesuaikan untuk PDF.'),
         para('Catatan versi: contoh dalam penjelasan menggunakan parameter awal 6000 × 4000 mm dan format angka id-ID. File kerja yang diperiksa pada 18 September 2026 sudah menggunakan parameter 139.8 × 5000 mm, format en-US tanpa pemisah ribuan, serta beberapa label berbahasa Inggris. Penjelasan sebelumnya tetap disalin utuh sesuai permintaan.'),
         para('Potongan kode menjelaskan bagian tertentu. Beberapa cuplikan sengaja hanya menampilkan sebagian fungsi dan bukan program mandiri.'),
         Spacer(1, 15), para('Disusun: 18 September 2026'), PageBreak(),
         para('Isi dokumen', 'heading')]

headings = re.findall(r'^\*\*(\d+\..+)\*\*$', source, re.M)
assert len(headings) == 14
for title in headings:
    story.append(para(title))
story.append(PageBreak())

def plain(s):
    return re.sub(r'`([^`]+)`', r'\1', s.replace('**', ''))

lines = source.splitlines()
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith('```'):
        language = line[3:] or 'code'
        i += 1
        code = []
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i])
            i += 1
        assert i < len(lines), 'Unclosed code block'
        expected.append('\n'.join(code))
        rows = [[Paragraph(escape(language.upper()), ParagraphStyle('Lang', fontName='BodyBold', fontSize=7, leading=10, textColor=BLUE))]]
        for code_line in code:
            wrapped = textwrap.wrap(code_line, width=96, replace_whitespace=False, drop_whitespace=False) or [' ']
            for segment in wrapped:
                assert pdfmetrics.stringWidth(segment, 'Mono', 8) < width - 20
                rows.append([Preformatted(segment, styles['code'])])
        block = Table(rows, colWidths=[width], hAlign='LEFT')
        block.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), PALE),
            ('LINEBEFORE', (0, 0), (0, -1), 2, colors.HexColor('#b7cfe3')),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 6),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 1), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 0),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 7),
        ]))
        story.extend([block, Spacer(1, 10)])
        i += 1
        continue
    if line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [c.strip() for c in lines[i].strip('|').split('|')]
            if not all(re.fullmatch(r'[-:]+', c) for c in cells):
                expected.extend(plain(c) for c in cells)
                rows.append([para(c, 'table') for c in cells])
            i += 1
        table = Table(rows, colWidths=[width / len(rows[0])] * len(rows[0]), repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dfeaf4')),
            ('GRID', (0, 0), (-1, -1), .4, colors.HexColor('#c8d3de')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ]))
        story.extend([table, Spacer(1, 10)])
        continue
    if re.match(r'^\*\*\d+\.', line):
        title = line[2:-2]
        expected.append(plain(title))
        story.append(para(title, 'heading'))
        i += 1
        continue
    if line.startswith('- ') or re.match(r'^\d+\. ', line):
        expected.append(plain(line[2:] if line.startswith('- ') else line))
        story.append(para(('• ' + line[2:]) if line.startswith('- ') else line))
        i += 1
        continue
    paragraph = [line]
    i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('```', '|', '- ')) and not re.match(r'^(\*\*\d+\.|\d+\. )', lines[i]):
        paragraph.append(lines[i])
        i += 1
    text = ' '.join(paragraph)
    expected.append(plain(text))
    story.append(para(text))

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saved = []

    def showPage(self):
        self.saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self.saved)
        for state in self.saved:
            self.__dict__.update(state)
            self.setStrokeColor(colors.HexColor('#d6e0e8'))
            self.line(50, 39, A4[0] - 50, 39)
            self.setFont('Body', 8)
            self.setFillColor(colors.HexColor('#63758a'))
            self.drawString(50, 26, 'SCHEMATIC / Panduan JavaScript')
            self.drawRightString(A4[0] - 50, 26, f'{self._pageNumber} / {total}')
            super().showPage()
        super().save()

doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=50, leftMargin=50,
                        topMargin=45, bottomMargin=55, title='Penjelasan Lengkap JavaScript Schematic',
                        author='Codex', subject='Drawing engine SVG parametrik dan koordinat engineering')
doc.build(story, canvasmaker=NumberedCanvas)

reader = PdfReader(str(output))
extracted = '\n'.join(re.sub(r'SCHEMATIC / Panduan JavaScript\s*\d+ / \d+\s*$', '', page.extract_text()) for page in reader.pages)
normalize = lambda text: re.sub(r'\s+', '', text)
normalized_pdf = normalize(extracted)
missing = [part for part in expected if normalize(part) not in normalized_pdf]
assert not missing, 'Missing content: ' + repr(missing[:3])
assert all(abs(float(page.mediabox.width) - A4[0]) < 1 for page in reader.pages)
report = f'PDF: {output.name}\nPages: {len(reader.pages)}\nSections: {len(headings)}\nContent blocks verified: {len(expected)}\nMissing content blocks: {len(missing)}\nPage size: A4\nBytes: {output.stat().st_size}\n'
(HERE / 'pdf_verification.txt').write_text(report, encoding='utf-8')
print(report)
