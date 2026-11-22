/* =========================================================
   OFFICE → halaman gambar (Word, Excel/CSV, TXT/RTF)
   Setiap halaman dihasilkan sebagai JPEG + ukuran halaman (pt).
   ========================================================= */
const PX2PT = .75;
function offscreenHost() {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-30000px;top:0;background:#fff;color:#111';
  document.body.append(host); return host;
}
async function waitAssets(root) {
  await document.fonts?.ready;
  await Promise.all($$('img', root).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
}
async function rasterize(node, { scale = 2, pageHpx } = {}) {
  const h2c = await lib('h2c');
  const c = await h2c(node, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const pages = [];
  const wpx = node.offsetWidth, slice = pageHpx ? Math.round(pageHpx * scale) : c.height;
  for (let y = 0; y < c.height - 4; y += slice) {
    const hh = Math.min(slice, c.height - y), part = canvas(c.width, pageHpx ? slice : hh), ctx = part.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height); ctx.drawImage(c, 0, y, c.width, hh, 0, 0, c.width, hh);
    const blob = await toBlob(part, 'image/jpeg', .9);
    pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', w: part.width, h: part.height, ptW: wpx * PX2PT, ptH: (pageHpx || hh / scale) * PX2PT, thumbSrc: part });
  }
  return pages;
}
async function docxToPages(file, onStep) {
  const docx = await lib('docx'); await lib('h2c');
  const host = offscreenHost();
  try {
    await docx.renderAsync(await file.arrayBuffer(), host, host, { className: 'docx', inWrapper: false, ignoreWidth: false, ignoreHeight: false, breakPages: true, ignoreLastRenderedPageBreak: false, experimental: true, useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true });
    await waitAssets(host);
    const sections = $$('section.docx', host); const out = [];
    for (let i = 0; i < sections.length; i++) {
      onStep?.(`Merender halaman Word ${i + 1}/${sections.length}…`);
      const s = sections[i]; s.style.margin = '0'; s.style.boxShadow = 'none';
      const ph = parseFloat(s.style.minHeight) ? s.style.minHeight : getComputedStyle(s).minHeight;
      const pageH = (() => { const d = document.createElement('div'); d.style.height = ph; host.append(d); const v = d.offsetHeight; d.remove(); return v || s.offsetWidth * 1.4142; })();
      out.push(...await rasterize(s, { pageHpx: s.offsetHeight > pageH * 1.02 ? pageH : null }));
    }
    if (!out.length) throw Error('Dokumen Word kosong atau tidak dapat dibaca.');
    return out;
  } finally { host.remove(); }
}
function pageShell(wpx, hpx, pad) {
  const page = document.createElement('div');
  page.style.cssText = `width:${wpx}px;height:${hpx}px;padding:${pad}px;box-sizing:border-box;background:#fff;overflow:hidden;font:12px/1.45 Arial,Helvetica,sans-serif;color:#111;margin-bottom:10px`;
  const body = document.createElement('div'); body.style.cssText = `height:${hpx - pad * 2}px;overflow:hidden`;
  page.append(body); return { page, body };
}
async function flowToPages(nodes, { wpx = 794, hpx = 1123, pad = 64, wrap = n => n, onStep } = {}) {
  const host = offscreenHost(); const shells = [];
  const next = () => { const s = pageShell(wpx, hpx, pad); s.container = wrap(s.body); host.append(s.page); shells.push(s); return s; };
  try {
    let cur = next();
    for (const n of nodes) {
      cur.container.append(n);
      if (cur.body.scrollHeight > cur.body.clientHeight + 1 && cur.container.children.length > 1) { n.remove(); cur = next(); cur.container.append(n); }
    }
    const out = [];
    for (let i = 0; i < shells.length; i++) { onStep?.(`Merender halaman ${i + 1}/${shells.length}…`); out.push(...await rasterize(shells[i].page)); }
    return out;
  } finally { host.remove(); }
}
async function sheetToPages(file, onStep) {
  const XLSX = await lib('xlsx'); await lib('h2c');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const out = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws['!ref']) continue;
    const tmp = offscreenHost();
    tmp.innerHTML = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
    const table = tmp.querySelector('table'); if (!table) { tmp.remove(); continue; }
    table.style.cssText = 'border-collapse:collapse;font:11px/1.35 Arial,sans-serif;white-space:nowrap';
    $$('td,th', table).forEach(c => { c.style.cssText = 'border:1px solid #c9ced6;padding:4px 7px;vertical-align:top'; });
    const rows = $$('tr', table); if (!rows.length) { tmp.remove(); continue; }
    const tw = table.offsetWidth, landscape = tw > 680;
    const wpx = landscape ? 1123 : 794, hpx = landscape ? 794 : 1123, pad = 48, avail = wpx - pad * 2;
    const k = Math.min(1, avail / tw);
    const widths = (() => { let best = null; for (const r of rows) { const cells = [...r.children]; if (cells.some(c => c.colSpan > 1)) continue; if (!best || cells.length > best.length) best = cells; } return best?.map(c => c.offsetWidth); })();
    tmp.remove();
    const wrap = body => {
      body.style.height = `${(hpx - pad * 2) / k}px`; body.style.width = `${avail / k}px`; body.style.transform = `scale(${k})`; body.style.transformOrigin = '0 0';
      const title = document.createElement('div'); title.textContent = name; title.style.cssText = 'font:700 13px Arial;margin:0 0 8px;color:#333';
      const t = document.createElement('table'); t.style.cssText = table.style.cssText + ';table-layout:fixed';
      if (widths) { const cg = document.createElement('colgroup'); widths.forEach(w => { const c = document.createElement('col'); c.style.width = w + 'px'; cg.append(c); }); t.append(cg); }
      const tb = document.createElement('tbody'); t.append(tb); body.append(title, t);
      return tb;
    };
    out.push(...await flowToPages(rows.map(r => r.cloneNode(true)), { wpx, hpx, pad, wrap, onStep: s => onStep?.(`${name}: ${s}`) }));
  }
  if (!out.length) throw Error('Spreadsheet kosong.');
  return out;
}
async function textToPages(text, onStep) {
  await lib('h2c');
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => { const d = document.createElement('div'); d.style.cssText = 'white-space:pre-wrap;word-break:break-word;min-height:1.45em;font:12.5px/1.5 Consolas,"Courier New",monospace'; d.textContent = l; return d; });
  return flowToPages(lines, { onStep });
}
function rtfToText(rtf) {
  return rtf.replace(/\\par[d]?/g, '\n').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
async function officeToPages(file, onStep) {
  const ext = extOf(file.name);
  if (ext === 'docx') return docxToPages(file, onStep);
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return sheetToPages(file, onStep);
  if (ext === 'txt' || ext === 'md') return textToPages(await file.text(), onStep);
  if (ext === 'rtf') return textToPages(rtfToText(await file.text()), onStep);
  if (ext === 'pptx' || ext === 'ppt') throw Error('PowerPoint belum bisa dirender akurat di browser. Ekspor ke PDF dari PowerPoint, lalu tambahkan PDF-nya.');
  if (ext === 'doc') throw Error('Format .doc lama: simpan ulang sebagai .docx atau PDF dari Word.');
  throw Error('Format belum didukung.');
}
