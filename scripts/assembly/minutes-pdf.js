const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT_MARGIN = 51;
const RIGHT_MARGIN = 51;
const TOP_MARGIN = 58;
const BOTTOM_MARGIN = 63;
const CHAR_MAP = new Map([
  [0x20ac, 128], [0x201a, 130], [0x0192, 131], [0x201e, 132],
  [0x2026, 133], [0x2020, 134], [0x2021, 135], [0x02c6, 136],
  [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140],
  [0x017d, 142], [0x2018, 145], [0x2019, 146], [0x201c, 147],
  [0x201d, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151],
  [0x02dc, 152], [0x2122, 153], [0x0161, 154], [0x203a, 155],
  [0x0153, 156], [0x017e, 158], [0x0178, 159]
]);

function winAnsiHex(value) {
  let result = '';
  for (const char of String(value || '').normalize('NFC')) {
    const cp = char.codePointAt(0);
    const byte = (cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) ? cp : CHAR_MAP.get(cp) ?? 63;
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
}

function printableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function drawText(text, x, y, size, bold = false, color = '0.12 0.16 0.23') {
  return `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${winAnsiHex(text)}> Tj ET\n`;
}

function wrap(text, maxWidth, fontSize, bold, measure) {
  const words = printableText(text).split(' ').filter(Boolean);
  const rows = [];
  let line = '';
  const fits = candidate => measure(candidate, fontSize, bold) <= maxWidth;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) rows.push(line);
    if (fits(word)) {
      line = word;
      continue;
    }
    let part = '';
    for (const character of word) {
      if (part && !fits(part + character)) {
        rows.push(part);
        part = character;
      } else {
        part += character;
      }
    }
    line = part;
  }
  if (line) rows.push(line);
  return rows;
}

async function getSignatureImage(doc) {
  const image = doc.querySelector('.assembly-signature-image');
  if (!image?.src?.startsWith('data:image/')) return null;
  try {
    if (!image.complete) await image.decode();
    const width = Math.min(image.naturalWidth, 1200);
    const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
    if (!Number.isFinite(width) || width <= 0 || height > 1500) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const base64 = canvas.toDataURL('image/jpeg', 0.91).split(',')[1];
    const decoded = atob(base64);
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    return { bytes, width, height };
  } catch (_) {
    return null;
  }
}

function assemblePdf(pages, signatureImage) {
  const objects = [null];
  const addObject = value => (objects.push(value), objects.length - 1);
  const catalogId = addObject(null);
  const pagesId = addObject(null);
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const imageId = signatureImage ? addObject({
    dict: `/Type /XObject /Subtype /Image /Width ${signatureImage.width} /Height ${signatureImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
    stream: signatureImage.bytes
  }) : null;
  const pageIds = [];
  const encoder = new TextEncoder();
  for (const [index, page] of pages.entries()) {
    const footer = drawText(`Página ${index + 1} de ${pages.length}`, PAGE_WIDTH - RIGHT_MARGIN - 75, 35, 8, false, '0.42 0.47 0.54');
    const contentId = addObject({ dict: '', stream: encoder.encode(page.commands + footer) });
    const resources = `<< /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${imageId ? ` /XObject << /Sig ${imageId} 0 R >>` : ''} >>`;
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${contentId} 0 R >>`));
  }
  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const parts = [];
  const offsets = [0];
  let position = 0;
  const append = part => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    position += bytes.length;
  };
  append('%PDF-1.4\n%Condomit\n');
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = position;
    append(`${id} 0 obj\n`);
    const value = objects[id];
    if (typeof value === 'string') append(value + '\n');
    else {
      append(`<< ${value.dict} /Length ${value.stream.length} >>\nstream\n`);
      append(value.stream);
      append('\nendstream\n');
    }
    append('endobj\n');
  }
  const xrefOffset = position;
  append(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function saveMinutesAsPdf(doc, fileName) {
  if (!doc) throw new Error('O conteúdo da ata não está disponível para exportação.');
  const paragraphs = [...doc.querySelectorAll('.formal-minutes-body p')].map(el => printableText(el.textContent)).filter(Boolean);
  if (!paragraphs.length) throw new Error('A ata não possui texto para exportar.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador não suporta a exportação de PDF.');
  const measure = (str, size, bold) => {
    context.font = `${bold ? 'bold ' : ''}${size}px Arial`;
    return context.measureText(str).width;
  };
  const pages = [];
  let page;
  let y;
  const startPage = () => {
    page = { commands: '' };
    pages.push(page);
    y = PAGE_HEIGHT - TOP_MARGIN;
  };
  const ensure = height => { if (y - height < BOTTOM_MARGIN) startPage(); };
  const width = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
  const centered = (text, size, bold, spaceAfter = 8) => {
    const lines = wrap(text, width, size, bold, measure);
    ensure(lines.length * (size + 5) + spaceAfter);
    for (const line of lines) {
      const x = Math.max(LEFT_MARGIN, (PAGE_WIDTH - measure(line, size, bold)) / 2);
      page.commands += drawText(line, x, y, size, bold);
      y -= size + 5;
    }
    y -= spaceAfter;
  };
  const paragraph = (text, size = 10.7, lineHeight = 17.4, indent = 0, spaceAfter = 10, bold = false) => {
    const lines = wrap(text, width - indent - 2, size, bold, measure);
    for (const [i, line] of lines.entries()) {
      ensure(lineHeight);
      page.commands += drawText(line, LEFT_MARGIN + (i === 0 ? indent : 0), y, size, bold);
      y -= lineHeight;
    }
    y -= spaceAfter;
  };
  startPage();
  centered(printableText(doc.querySelector('.formal-condo-name')?.textContent), 11, true, 3);
  const address = printableText(doc.querySelector('.formal-condo-address')?.textContent);
  if (address) centered(address, 9, false, 17);
  else y -= 12;
  centered(printableText(doc.querySelector('.formal-minutes-heading h3')?.textContent), 15, true, 5);
  centered(printableText(doc.querySelector('.formal-minutes-subtitle')?.textContent), 10.6, true, 21);
  for (const text of paragraphs) paragraph(text, 10.7, 17.4, 21, 11);
  const signature = doc.querySelector('.formal-signature');
  const signatureImage = await getSignatureImage(doc);
  if (signature) {
    ensure(signatureImage ? 125 : 100);
    y -= 34;
    if (signatureImage) {
      const imgWidth = Math.min(155, signatureImage.width * 63 / signatureImage.height);
      const imgHeight = Math.min(63, imgWidth * signatureImage.height / signatureImage.width);
      const x = (PAGE_WIDTH - imgWidth) / 2;
      page.commands += `q ${imgWidth.toFixed(2)} 0 0 ${imgHeight.toFixed(2)} ${x.toFixed(2)} ${(y - imgHeight + 12).toFixed(2)} cm /Sig Do Q\n`;
      y -= imgHeight - 6;
    }
    const lineWidth = 260;
    const x = (PAGE_WIDTH - lineWidth) / 2;
    page.commands += `0.14 0.19 0.26 RG 0.7 w ${x.toFixed(2)} ${y.toFixed(2)} m ${(x + lineWidth).toFixed(2)} ${y.toFixed(2)} l S\n`;
    y -= 18;
    const signer = printableText(signature.querySelector('strong')?.textContent);
    centered(signer, 9.5, true, 2);
    signature.querySelectorAll('small').forEach(el => centered(printableText(el.textContent), 8, false, 1));
  }
  const note = printableText(doc.querySelector('.formal-minutes-note')?.textContent);
  if (note) {
    ensure(50);
    y -= 18;
    paragraph(note, 8.5, 12.5, 0, 0);
  }
  const pdf = assemblePdf(pages, signatureImage);
  const link = document.createElement('a');
  const url = URL.createObjectURL(pdf);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
