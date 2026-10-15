(function () {
  'use strict';

  const encoder = new TextEncoder();
  const escapeXML = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const dateLabel = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', {timeZone: 'UTC'});
  };

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createExcelZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const uint16 = (view, at, value) => view.setUint16(at, value, true);
    const uint32 = (view, at, value) => view.setUint32(at, value >>> 0, true);

    files.forEach(([path, xml]) => {
      const name = encoder.encode(path);
      const data = encoder.encode(xml);
      const checksum = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      uint32(localView, 0, 0x04034b50);
      uint16(localView, 4, 20);
      uint16(localView, 6, 0x0800);
      uint16(localView, 8, 0);
      uint32(localView, 14, checksum);
      uint32(localView, 18, data.length);
      uint32(localView, 22, data.length);
      uint16(localView, 26, name.length);
      local.set(name, 30);
      parts.push(local, data);

      const directory = new Uint8Array(46 + name.length);
      const view = new DataView(directory.buffer);
      uint32(view, 0, 0x02014b50);
      uint16(view, 4, 20);
      uint16(view, 6, 20);
      uint16(view, 8, 0x0800);
      uint32(view, 16, checksum);
      uint32(view, 20, data.length);
      uint32(view, 24, data.length);
      uint16(view, 28, name.length);
      uint32(view, 42, offset);
      directory.set(name, 46);
      central.push(directory);
      offset += local.length + data.length;
    });

    const centralLength = central.reduce((count, bytes) => count + bytes.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    uint32(endView, 0, 0x06054b50);
    uint16(endView, 8, files.length);
    uint16(endView, 10, files.length);
    uint32(endView, 12, centralLength);
    uint32(endView, 16, offset);
    return new Blob([...parts, ...central, end], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  function makeSheet(residents) {
    const columns = ['Nome', 'Bloco', 'Apartamento', 'E-mail', 'Telefone', 'Situação', 'Vínculo', 'Entrada no condomínio'];
    const letter = (index) => String.fromCharCode(65 + index);
    const cell = (value, column, row, style) => `<c r="${letter(column)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXML(value)}</t></is></c>`;
    const header = `<row r="1" ht="34" customHeight="1">${columns.map((label, index) => cell(label, index, 1, 1)).join('')}</row>`;
    const body = residents.map((resident, index) => {
      const values = [resident.name, resident.block, resident.apartment, resident.email, resident.phone, resident.status === 'dependente' ? 'Dependente' : resident.status === 'inativo' ? 'Inativo' : 'Ativo', resident.role, dateLabel(resident.createdAt)];
      return `<row r="${index + 2}">${values.map((value, col) => cell(value, col, index + 2, index % 2 === 0 ? 2 : 0)).join('')}</row>`;
    }).join('');
    const widths = [32, 17, 16, 38, 21, 17, 17, 23].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    const bottom = Math.max(1, residents.length + 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols>${widths}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="A1:H${bottom}"/><pageMargins left="0.3" right="0.3" top="0.6" bottom="0.6" header="0.2" footer="0.2"/></worksheet>`;
  }

  function exportResidents(residents) {
    if (!Array.isArray(residents)) throw new Error('Lista de moradores indisponível.');
    const contents = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Moradores" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/><color rgb="FF334155"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF164596"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F6FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', makeSheet(residents)]
    ];
    const blob = createExcelZip(contents);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moradores-condomit-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.exportCondomitResidentsExcel = exportResidents;
})();
