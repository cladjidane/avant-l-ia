// Fabrique les fichiers Word et Excel de test dans fixtures/.
// Usage : node scripts/make-fixtures.mjs
// Les fichiers sont écrits à la main (XML) pour contrôler les cas difficiles :
// nom coupé en plusieurs morceaux de styles différents, en-tête, commentaire,
// métadonnées, formule, texte enrichi.
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const core = (creator, modifier) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Devis Kerboul</dc:title><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${modifier}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-11-02T09:00:00Z</dcterms:created></cp:coreProperties>`;

const app = (company) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Company>${company}</Company></Properties>`;

async function makeDocx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`);
  const run = (text, bold = false) =>
    `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const body = [
    `<w:p>${run('Bonjour Sophie,')}</w:p>`,
    // « Kerboul » est coupé en deux morceaux, dont un en gras, et « Le Gall » aussi.
    `<w:p>${run('Suite à notre rendez-vous de mardi chez Menuiserie ')}${run('Le ', true)}${run('Gall à Plouider, je vous confirme le devis de ')}${run('18 450 €', true)}${run(' pour les fenêtres de la maison de M. ')}<w:commentRangeStart w:id="0"/>${run('Ker', true)}${run('boul')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>${run(', 12 rue de Brest.')}</w:p>`,
    `<w:p>${run('Son fils, qui est le seul kiné de la commune, souhaite un paiement en trois fois.')}</w:p>`,
    `<w:p>${run('Vous pouvez me joindre au 06 12 34 56 78 ou à yann.legall@menuiserie-legall.fr.')}</w:p>`,
    `<w:p>${run('Yann Le Gall', true)}${run(', gérant')}</w:p>`,
  ].join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/></w:sectPr></w:body></w:document>`);
  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W}"><w:p>${run('Menuiserie Le Gall')}<w:r><w:tab/></w:r>${run('SIRET 732 829 320 00074')}</w:p></w:hdr>`);
  zip.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Yann Le Gall" w:initials="YLG" w:date="2026-11-02T10:00:00Z"><w:p>${run('Vérifier avec M. Kerboul.')}</w:p></w:comment></w:comments>`);
  zip.file('docProps/core.xml', core('Yann Le Gall', 'Sophie Tanguy'));
  zip.file('docProps/app.xml', app('Menuiserie Le Gall'));
  writeFileSync(new URL('../fixtures/devis-le-gall.docx', import.meta.url), await zip.generateAsync({ type: 'nodebuffer' }));
}

async function makeXlsx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets><sheet name="Clients" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`);
  const strings = [
    'Nom', 'Téléphone', 'Mail', 'Montant', 'Libellé',
    'Kerboul', '06 12 34 56 78', 'yann.legall@menuiserie-legall.fr',
    'Le Bihan', '02 61 91 12 34', 'contact@iroise-chiffres.example',
  ];
  const si = strings.map((s) => `<si><t>${s}</t></si>`).join('');
  // Texte enrichi : « Madame Anne » en gras, « Le Bihan, Brest » normal.
  const rich = '<si><r><rPr><b/></rPr><t xml:space="preserve">Client Madame Anne </t></r><r><t>Le Bihan, 29200 Brest</t></r></si>';
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length + 1}" uniqueCount="${strings.length + 1}">${si}${rich}</sst>`);
  const s = (ref, idx, style = 0) => `<c r="${ref}" t="s"${style ? ` s="${style}"` : ''}><v>${idx}</v></c>`;
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1">${s('A1', 0, 1)}${s('B1', 1, 1)}${s('C1', 2, 1)}${s('D1', 3, 1)}${s('E1', 4, 1)}</row>
<row r="2">${s('A2', 5)}${s('B2', 6)}${s('C2', 7)}<c r="D2"><v>18450</v></c><c r="E2" t="str"><f>"Devis "&amp;A2</f><v>Devis Kerboul</v></c></row>
<row r="3">${s('A3', 8)}${s('B3', 9)}${s('C3', 10)}<c r="D3"><v>1250.5</v></c><c r="E3" t="inlineStr"><is><t>Relance de Mme Le Bihan</t></is></c></row>
<row r="4">${s('A4', 11)}<c r="D4"><f>SUM(D2:D3)</f><v>19700.5</v></c></row>
</sheetData></worksheet>`);
  zip.file('docProps/core.xml', core('Yann Le Gall', 'Yann Le Gall'));
  zip.file('docProps/app.xml', app('Menuiserie Le Gall'));
  writeFileSync(new URL('../fixtures/clients-le-gall.xlsx', import.meta.url), await zip.generateAsync({ type: 'nodebuffer' }));
}

// PDF minimal à une page, texte en Helvetica avec l'encodage Windows (accents, €).
function makePdf() {
  const lines = [
    'Bonjour Sophie,',
    'Suite à notre rendez-vous chez Menuiserie Le Gall à Plouider, je vous confirme',
    'le devis de 18 450 € pour la maison de M. Kerboul, 12 rue de Brest.',
    'Vous pouvez me joindre au 06 12 34 56 78 ou à yann.legall@menuiserie-legall.fr.',
    'Yann Le Gall, gérant',
  ];
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = ['BT', '/F1 11 Tf', '14 TL', '60 760 Td', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n');
  const toBytes = (t) => Buffer.from(t.replace(/€/g, '\x80'), 'latin1');
  const streamBytes = toBytes(stream);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let size = parts[0].length;
  objects.forEach((obj, i) => {
    offsets.push(size);
    const body = obj === null
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`), streamBytes, Buffer.from('\nendstream\nendobj\n')])
      : Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`);
    parts.push(body);
    size += body.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  writeFileSync(new URL('../fixtures/mail-le-gall.pdf', import.meta.url), Buffer.concat(parts));
}

await makeDocx();
await makeXlsx();
makePdf();
console.log('fixtures/devis-le-gall.docx, clients-le-gall.xlsx et mail-le-gall.pdf écrits.');
