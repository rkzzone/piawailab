/* =========================================================
   TOOLS — definisi alat & fungsi pemrosesan
   ========================================================= */
const range = (a, b) => { if (b == null) [a, b] = [0, a]; return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i); };
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const FONT_STACK = '"Plus Jakarta Sans", PJS, Arial, sans-serif';

/* ---------- kompresi ---------- */
const COMP = { strong: { max: 1100, q: .5, dpi: 96, imgMax: 1600 }, balanced: { max: 1600, q: .66, dpi: 130, imgMax: 2400 }, quality: { max: 2300, q: .8, dpi: 180, imgMax: 3400 } };
async function qpdfOptimize(bytes) {
  const { code, out } = await qpdf(['/in.pdf', '--object-streams=generate', '--compression-level=9', '--recompress-flate', '/out.pdf'], bytes);
  if ((code !== 0 && code !== 3) || !out) throw Error('Optimasi struktur gagal.');
  return new Blob([out], { type: 'application/pdf' });
}
async function recompressImages(bytes, cfg, prog) {
  const L = await lib('pdflib'); const { PDFName: N, PDFRawStream, PDFArray, PDFBool, decodePDFRawStream } = L;
  const doc = await loadForEdit(bytes), ctx = doc.context;
  const num = (d, k) => { const v = d.lookup(N.of(k)); return v?.asNumber ? v.asNumber() : undefined; };
  const colorKind = d => {
    const cs = d.lookup(N.of('ColorSpace'));
    if (cs === N.of('DeviceRGB') || cs === N.of('CalRGB')) return 'rgb';
    if (cs === N.of('DeviceGray') || cs === N.of('CalGray')) return 'gray';
    if (cs instanceof PDFArray) { const k = cs.lookup(0); if (k === N.of('ICCBased')) { const n = cs.lookup(1)?.dict?.lookup(N.of('N'))?.asNumber?.(); return n === 3 ? 'rgb' : n === 1 ? 'gray' : 'x'; } if (k === N.of('CalRGB')) return 'rgb'; if (k === N.of('CalGray')) return 'gray'; }
    return 'x';
  };
  const cand = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue; const d = obj.dict;
    if (d.lookup(N.of('Subtype')) !== N.of('Image') || d.lookup(N.of('ImageMask')) === PDFBool.True || d.has(N.of('Decode'))) continue;
    const w = num(d, 'Width'), h = num(d, 'Height'), bpc = num(d, 'BitsPerComponent');
    if (!w || !h || w * h < 200 * 200) continue;
    // rantai filter: mis. [/ASCII85Decode /DCTDecode] (umum di PDF dari ReportLab dkk.)
    const fl = d.lookup(N.of('Filter')), chain = fl instanceof PDFArray ? fl.asArray().map(x => ctx.lookup(x)) : fl ? [fl] : [];
    const f = chain[chain.length - 1], pre = chain.slice(0, -1);
    if (pre.some(x => x !== N.of('ASCII85Decode') && x !== N.of('ASCIIHexDecode') && x !== N.of('FlateDecode') && x !== N.of('LZWDecode'))) continue;
    const dct = f === N.of('DCTDecode'), flate = f === N.of('FlateDecode'); if (!dct && !flate) continue;
    const cs = colorKind(d); if (cs === 'x') continue;
    if (flate) { if (bpc !== 8) continue; const dp = d.lookup(N.of('DecodeParms')); if (dp instanceof PDFArray || (dp && (dp.lookup(N.of('Predictor'))?.asNumber?.() || 1) > 1)) continue; }
    cand.push({ ref, obj, w, h, dct, cs, pre });
  }
  let saved = 0;
  for (let i = 0; i < cand.length; i++) {
    const c = cand[i]; await prog.check?.();
    prog(i / Math.max(1, cand.length) * .85, `Mengoptimalkan gambar ${i + 1} dari ${cand.length}…`);
    try {
      let src;
      if (c.dct) {
        const jpg = c.pre.length ? decodePDFRawStream(PDFRawStream.of(ctx.obj({ Filter: c.pre }), c.obj.contents)).decode() : c.obj.contents;
        src = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
      }
      else {
        const raw = decodePDFRawStream(c.obj).decode(), comps = c.cs === 'rgb' ? 3 : 1;
        if (raw.length < c.w * c.h * comps) continue;
        const id = new ImageData(c.w, c.h), d = id.data;
        for (let p = 0, q = 0; p < c.w * c.h; p++, q += comps) { const o = p * 4; d[o] = raw[q]; d[o + 1] = raw[q + (comps === 3 ? 1 : 0)]; d[o + 2] = raw[q + (comps === 3 ? 2 : 0)]; d[o + 3] = 255; }
        src = canvas(c.w, c.h); src.getContext('2d').putImageData(id, 0, 0);
      }
      const k = Math.min(1, cfg.max / Math.max(c.w, c.h)), cv = canvas(c.w * k, c.h * k), g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); if (cfg.gray) g.filter = 'grayscale(1)';
      g.drawImage(src, 0, 0, cv.width, cv.height); src.close?.();
      const jb = new Uint8Array(await (await toBlob(cv, 'image/jpeg', cfg.q)).arrayBuffer());
      if (jb.length >= c.obj.contents.length * .9) continue;
      const ns = ctx.stream(jb, { Type: 'XObject', Subtype: 'Image', Width: cv.width, Height: cv.height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
      const sm = c.obj.dict.get(N.of('SMask')); if (sm) ns.dict.set(N.of('SMask'), sm);
      ctx.assign(c.ref, ns); saved++;
    } catch { /* gambar yang tidak bisa didekode dibiarkan apa adanya */ }
  }
  prog(.9, 'Menyimpan…');
  return { blob: await savePdf(doc), images: cand.length, saved };
}
async function rasterPdf(f, cfg, prog) {
  const { PDFDocument } = await lib('pdflib'); const out = await PDFDocument.create();
  for (let i = 1; i <= f.pages; i++) {
    await prog.check?.(); prog((i - 1) / f.pages, `Merender halaman ${i} dari ${f.pages}…`);
    const page = await f.doc.getPage(i), vp = page.getViewport({ scale: 1 });
    let c = await renderPage(page, { scale: cfg.dpi / 72, maxSide: 3600 });
    if (cfg.gray) { const g = canvas(c.width, c.height), x = g.getContext('2d'); x.filter = 'grayscale(1)'; x.drawImage(c, 0, 0); c = g; }
    const img = await out.embedJpg(new Uint8Array(await (await toBlob(c, 'image/jpeg', cfg.q)).arrayBuffer()));
    out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
  }
  return savePdf(out);
}
async function compressImage(f, o) {
  const lvl = o.level === 'lossless' ? { imgMax: 1e9, q: .92 } : COMP[o.level];
  const img = await decodeImage(f.file), w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, lvl.imgMax / Math.max(w, h));
  const ext = extOf(f.name), fmt = o.imgFmt === 'same' ? (ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg') : o.imgFmt;
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[fmt];
  const c = canvas(w * k, h * k), g = c.getContext('2d');
  if (fmt === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  if (o.gray) g.filter = 'grayscale(1)';
  g.drawImage(img, 0, 0, c.width, c.height);
  return { blob: await toBlob(c, type, fmt === 'png' ? undefined : lvl.q), ext: fmt };
}
function finalizeOut(f, blob, name) {
  if (blob.size >= f.size) return { name: f.name, blob: f.file, before: f.size, after: f.size, same: true };
  return { name, blob, before: f.size, after: blob.size };
}

/* ---------- watermark & nomor halaman ---------- */
async function makeStamp(o) {
  const key = JSON.stringify([o.kind, o.text, o.size, o.color, o.angle, o.scale, o.image?.name, o.image?.size]);
  if (makeStamp.cache?.key === key) return makeStamp.cache.v;
  const th = -o.angle * Math.PI / 180, cos = Math.abs(Math.cos(th)), sin = Math.abs(Math.sin(th));
  let c, sizeAt;
  if (o.kind === 'image') {
    if (!o.image) throw Error('Pilih gambar/logo untuk watermark.');
    const img = await decodeImage(o.image), s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    c = canvas(iw * cos + ih * sin, iw * sin + ih * cos); const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(th); g.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    sizeAt = VW => { const k = (o.scale / 100 * VW) / iw; return [c.width * k, c.height * k]; };
  } else {
    const text = (o.text || '').trim(); if (!text) throw Error('Tulis teks watermark.');
    const S = 4, fs = o.size * S; const m = canvas(10, 10).getContext('2d'); m.font = `800 ${fs}px ${FONT_STACK}`;
    const tw = m.measureText(text).width, tH = fs * 1.2;
    c = canvas(tw * cos + tH * sin + 8, tw * sin + tH * cos + 8); const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(th); g.font = m.font; g.fillStyle = o.color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 0);
    sizeAt = () => [c.width / S, c.height / S];
  }
  const v = { c, sizeAt }; makeStamp.cache = { key, v }; return v;
}
function stampPlaces(o, VW, VH, w, h) {
  if (o.layout !== 'tile') return [[(VW - w) / 2, (VH - h) / 2]];
  const gx = w + Math.max(36, w * .3), gy = h + Math.max(36, h * .5), out = [];
  for (let y = -h / 3, row = 0; y < VH; y += gy, row++) for (let x = (row % 2 ? -gx / 2 : 0); x < VW; x += gx) out.push([x, y]);
  return out;
}
const NUM_FMT = [['{n}', '1'], ['Halaman {n}', 'Halaman 1'], ['{n} / {t}', '1 / 10'], ['Halaman {n} dari {t}', 'Halaman 1 dari 10'], ['- {n} -', '- 1 -']];
function numText(o, i, count) {
  const skip = o.skipFirst ? 1 : 0; if (i < skip) return null;
  const n = (+o.start || 1) + i - skip, t = (+o.start || 1) + count - skip - 1;
  return o.fmt.replace('{n}', n).replace('{t}', t);
}
function numPos(o, VW, VH, tw, size) {
  const m = +o.margin, col = o.pos[1], row = o.pos[0];
  return [col === 'l' ? m : col === 'c' ? (VW - tw) / 2 : VW - m - tw, row === 't' ? m + size * .72 : VH - m];
}

/* ---------- definisi alat ---------- */
const ACC = {
  pdf: { accept: '.pdf,application/pdf', test: isPdf, label: 'PDF' },
  img: { accept: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif', test: isImage, label: 'JPG · PNG · WEBP · GIF · BMP' },
  office: { accept: '.docx,.doc,.xlsx,.xls,.ods,.csv,.txt,.md,.rtf,.pptx,.ppt', test: f => ['docx', 'doc', 'xlsx', 'xls', 'ods', 'csv', 'txt', 'md', 'rtf', 'pptx', 'ppt'].includes(extOf(f.name)), label: 'WORD · EXCEL · CSV · TXT' },
};
const accept = (...k) => ({ accept: k.map(x => ACC[x].accept).join(','), test: f => k.some(x => ACC[x].test(f)), acceptLabel: k.map(x => ACC[x].label).join(' · ') });
const firstBase = s => baseName(s.files?.[0]?.name || s.sources?.[0]?.name || s.file?.name || 'rapipdf');
const nameOpt = (suffix, ext = '.pdf') => ({ type: 'name', k: 'name', suffix: ext, ph: (o, s) => firstBase(s) + suffix });

const CATS = [
  { id: 'organize', name: 'Atur & gabung' }, { id: 'optimize', name: 'Optimasi' }, { id: 'convert', name: 'Konversi' },
  { id: 'edit', name: 'Edit & tanda tangan' }, { id: 'security', name: 'Keamanan' }, { id: 'image', name: 'Gambar' },
];
const TOOLS = [
  {
    id: 'merge', cat: 'organize', name: 'Merge PDF', icon: 'merge', color: '#7a5af8', engine: PagesEngine, popular: true,
    desc: 'Gabungkan PDF, gambar & dokumen Office jadi satu PDF.', long: 'Gabungkan beberapa file menjadi satu PDF, lalu susun halamannya sesuka Anda.',
    ...accept('pdf', 'img', 'office'), action: 'Gabungkan PDF', sideTitle: 'Gabungkan', sideSub: 'Susun halaman, lalu simpan sebagai satu PDF.',
    perks: ['Atur urutan per halaman', 'Campur PDF, gambar, Word & Excel', 'Tanpa batas jumlah file'],
    defaults: { name: '', imgSize: 'fit', margin: 0, orient: 'auto' }, defName: s => s.sources.length > 1 ? 'rapipdf-gabungan' : firstBase(s) + '-gabungan',
    opts: [{ type: 'name', k: 'name', ph: (o, s) => s.sources.length > 1 ? 'rapipdf-gabungan' : firstBase(s) + '-gabungan' },
    { type: 'seg', k: 'imgSize', label: 'Ukuran halaman untuk gambar', options: [['fit', 'Sesuai gambar'], ['a4', 'A4'], ['letter', 'Letter']] },
    { type: 'seg', k: 'margin', num: true, label: 'Margin gambar', options: [[0, 'Tanpa'], [18, 'Kecil'], [40, 'Besar']], when: o => o.imgSize !== 'fit' },
    { type: 'note', text: 'Halaman PDF disalin apa adanya — teks tetap tajam & bisa dipilih.' }],
  },
  {
    id: 'organize', cat: 'organize', name: 'Atur halaman', icon: 'organize', color: '#9b51e0', engine: PagesEngine,
    desc: 'Urutkan ulang, hapus, dan putar halaman PDF.', long: 'Seret untuk mengubah urutan, hapus halaman yang tidak perlu, atau putar per halaman.',
    ...accept('pdf', 'img'), action: 'Simpan perubahan', sideTitle: 'Atur halaman', perks: ['Seret & lepas urutan halaman', 'Hapus atau putar beberapa halaman sekaligus', 'Kualitas asli tetap terjaga'],
    defaults: { name: '' }, defName: s => firstBase(s) + '-diatur', opts: [nameOpt('-diatur')],
  },
  {
    id: 'split', cat: 'organize', name: 'Split PDF', icon: 'split', color: '#0ea5a4', engine: FilesEngine, single: true,
    desc: 'Pisahkan halaman atau ekstrak rentang tertentu.', long: 'Pisahkan setiap halaman, potong per rentang, atau ambil halaman tertentu saja.',
    ...accept('pdf'), action: 'Pisahkan PDF', sideTitle: 'Cara memisahkan', perks: ['Per halaman, per N halaman, atau rentang', 'Ekstrak halaman pilihan', 'Hasil ZIP otomatis'],
    defaults: { mode: 'ranges', every: 1, ranges: '', extract: '' },
    opts: [{
      type: 'radio', k: 'mode', options: [
        { v: 'ranges', t: 'Rentang khusus', d: 'Setiap rentang jadi file sendiri. Contoh: 1-3, 4-8, 9-' },
        { v: 'extract', t: 'Ekstrak halaman', d: 'Gabungkan halaman pilihan ke satu PDF baru.' },
        { v: 'every', t: 'Setiap N halaman', d: 'Potong berurutan dengan jumlah halaman tetap.' },
        { v: 'each', t: 'Semua halaman', d: 'Setiap halaman jadi file PDF terpisah.' }]
    },
    { type: 'text', k: 'ranges', label: 'Rentang', ph: 'mis. 1-3, 4-8, 9-', when: o => o.mode === 'ranges', help: (o, s) => `Dokumen ini punya ${s.files[0]?.pages || '…'} halaman. "9-" artinya sampai akhir.` },
    { type: 'text', k: 'extract', label: 'Halaman yang diambil', ph: 'mis. 1, 3, 5-7', when: o => o.mode === 'extract', help: (o, s) => `Total ${s.files[0]?.pages || '…'} halaman.` },
    { type: 'number', k: 'every', label: 'Jumlah halaman per file', min: 1, when: o => o.mode === 'every' }],
    validate: (o, s) => { try { const n = s.files[0].pages; if (o.mode === 'ranges') parseRanges(o.ranges, n); if (o.mode === 'extract') parseRanges(o.extract, n); if (o.mode === 'every' && !(o.every >= 1)) return 'Isi jumlah halaman per file.'; } catch (e) { return e.message; } },
    async process(f, o, prog) {
      const { PDFDocument } = await lib('pdflib'); const n = f.pages, base = baseName(f.name);
      let groups;
      if (o.mode === 'each') groups = range(n).map(i => [i]);
      else if (o.mode === 'every') { const k = Math.max(1, o.every | 0); groups = []; for (let i = 0; i < n; i += k) groups.push(range(i, Math.min(n, i + k))); }
      else if (o.mode === 'ranges') groups = parseRanges(o.ranges, n);
      else groups = [parseRanges(o.extract, n).flat()];
      const src = await loadForEdit(f.bytes), outs = [];
      for (const [i, g] of groups.entries()) {
        await prog.check?.(); prog(i / groups.length, `Membuat file ${i + 1} dari ${groups.length}…`);
        const d = await PDFDocument.create(); (await d.copyPages(src, g)).forEach(p => d.addPage(p));
        const lbl = o.mode === 'extract' ? 'ekstrak' : g.length === 1 ? `hal-${g[0] + 1}` : `hal-${g[0] + 1}-${g[g.length - 1] + 1}`;
        outs.push({ name: `${base}-${lbl}.pdf`, blob: await savePdf(d) });
      }
      return outs;
    }
  },
  {
    id: 'rotate', cat: 'organize', name: 'Putar PDF', icon: 'rotate', color: '#3b82f6', engine: PagesEngine, sideButtons: true,
    desc: 'Putar semua atau sebagian halaman PDF.', long: 'Putar halaman satu per satu atau semuanya sekaligus — tanpa mengurangi kualitas.',
    ...accept('pdf'), action: 'Terapkan rotasi', sideTitle: 'Putar halaman', perks: ['Putar per halaman atau semuanya', 'Lossless — kualitas tidak berubah', 'Bookmark & tautan tetap ada'],
    defaults: { name: '' }, defName: s => firstBase(s) + '-diputar', opts: [nameOpt('-diputar')],
  },
  {
    id: 'compress', cat: 'optimize', name: 'Compress PDF', icon: 'compress', color: '#e5484d', engine: FilesEngine, popular: true,
    desc: 'Perkecil ukuran PDF & gambar dengan kualitas terkontrol.', long: 'Perkecil ukuran PDF dan gambar. Teks tetap tajam — hanya gambar di dalamnya yang dioptimalkan.',
    ...accept('pdf', 'img'), action: 'Kompres', sideTitle: 'Tingkat kompresi', perks: ['Teks tetap tajam & bisa dipilih', 'Bandingkan ukuran sebelum–sesudah', 'Proses banyak file sekaligus'],
    defaults: { level: 'balanced', gray: false, raster: false, imgFmt: 'same' },
    opts: [{
      type: 'radio', k: 'level', options: [
        { v: 'strong', t: 'Ekstrem', d: 'Ukuran paling kecil. Gambar lebih buram.' },
        { v: 'balanced', t: 'Disarankan', tag: 'Terbaik', d: 'Keseimbangan ukuran dan kualitas.' },
        { v: 'quality', t: 'Kualitas tinggi', d: 'Gambar tetap tajam, penghematan lebih kecil.' },
        { v: 'lossless', t: 'Tanpa kehilangan kualitas', d: 'Hanya optimasi struktur file. Aman untuk dokumen penting.' }]
    },
    { type: 'toggle', k: 'gray', label: 'Ubah gambar jadi hitam-putih', help: 'Cocok untuk dokumen hasil scan.', when: o => o.level !== 'lossless' },
    { type: 'toggle', k: 'raster', label: 'Ratakan halaman jadi gambar', help: 'Paling agresif untuk PDF scan, tetapi teks tidak bisa dipilih lagi.', when: (o, s) => o.level !== 'lossless' && s.files.some(f => f.pdf) },
    { type: 'seg', k: 'imgFmt', label: 'Format gambar hasil', options: [['same', 'Sama'], ['jpg', 'JPG'], ['webp', 'WEBP']], when: (o, s) => s.files.some(f => !f.pdf) }],
    async process(f, o, prog) {
      const base = baseName(f.name);
      if (!f.pdf) { prog(.3, 'Mengompres gambar…'); const r = await compressImage(f, o); return [finalizeOut(f, r.blob, `${base}-compressed.${r.ext}`)]; }
      let blob;
      if (o.level === 'lossless') { prog(.3, 'Mengoptimalkan struktur PDF…'); blob = await qpdfOptimize(f.bytes); }
      else if (o.raster) blob = await rasterPdf(f, { ...COMP[o.level], gray: o.gray }, prog);
      else {
        const r = await recompressImages(f.bytes, { ...COMP[o.level], gray: o.gray }, prog); blob = r.blob;
        try { prog(.93, 'Merapikan struktur…'); const q = await qpdfOptimize(await blob.arrayBuffer()); if (q.size < blob.size) blob = q; } catch { }
      }
      return [finalizeOut(f, blob, `${base}-compressed.pdf`)];
    }
  },
  {
    id: 'pdf-to-image', cat: 'convert', name: 'PDF ke JPG / PNG', icon: 'pdf2img', color: '#f59e0b', engine: FilesEngine, popular: true,
    desc: 'Ekspor halaman PDF menjadi gambar berkualitas tinggi.', long: 'Ubah setiap halaman PDF menjadi gambar JPG, PNG, atau WEBP dengan resolusi pilihan.',
    ...accept('pdf'), action: 'Konversi ke gambar', sideTitle: 'Opsi gambar', perks: ['JPG, PNG, atau WEBP', 'Hingga 300 DPI', 'Pilih halaman tertentu'],
    defaults: { fmt: 'jpg', dpi: 150, which: 'all', range: '' },
    opts: [{ type: 'seg', k: 'fmt', label: 'Format', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']] },
    { type: 'radio', k: 'dpi', num: true, label: 'Resolusi', options: [{ v: 96, t: 'Layar · 96 DPI', d: 'Ringan, untuk dibagikan di chat.' }, { v: 150, t: 'Standar · 150 DPI', d: 'Tajam dan ukuran wajar.' }, { v: 300, t: 'Cetak · 300 DPI', d: 'Detail maksimal, file besar.' }] },
    { type: 'seg', k: 'which', label: 'Halaman', options: [['all', 'Semua'], ['some', 'Pilih']] },
    { type: 'text', k: 'range', label: 'Halaman yang dikonversi', ph: 'mis. 1-3, 7', when: o => o.which === 'some' }],
    validate: (o, s) => { if (o.which === 'some') try { s.files.forEach(f => parseRanges(o.range, f.pages)); } catch (e) { return e.message; } },
    async process(f, o, prog) {
      const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[o.fmt], base = baseName(f.name);
      const idx = o.which === 'some' ? [...new Set(parseRanges(o.range, f.pages).flat())] : range(f.pages);
      const pad = String(f.pages).length, outs = [];
      for (const [k, i] of idx.entries()) {
        await prog.check?.(); prog(k / idx.length, `Merender halaman ${i + 1}…`);
        const c = await renderPage(await f.doc.getPage(i + 1), { scale: o.dpi / 72, maxSide: 9000 });
        outs.push({ name: `${base}-${String(i + 1).padStart(pad, '0')}.${o.fmt}`, blob: await toBlob(c, type, .92) });
      }
      return outs;
    }
  },
  {
    id: 'image-to-pdf', cat: 'convert', name: 'JPG / PNG ke PDF', icon: 'img2pdf', color: '#f97316', engine: PagesEngine, popular: true,
    desc: 'Jadikan foto & gambar sebagai dokumen PDF.', long: 'Ubah foto dan gambar menjadi PDF. Atur urutan, ukuran halaman, dan margin.',
    ...accept('img'), action: 'Konversi ke PDF', sideTitle: 'Tata letak halaman', perks: ['Orientasi foto ponsel otomatis benar', 'A4, Letter, atau sesuai gambar', 'Atur urutan dengan seret'],
    defaults: { name: '', imgSize: 'a4', orient: 'auto', margin: 18 }, defName: s => s.pages.length > 1 ? 'gambar-ke-pdf' : firstBase(s),
    opts: [{ type: 'seg', k: 'imgSize', label: 'Ukuran halaman', options: [['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Sesuai gambar']] },
    { type: 'seg', k: 'orient', label: 'Orientasi', options: [['auto', 'Otomatis'], ['portrait', 'Potret'], ['landscape', 'Lanskap']], when: o => o.imgSize !== 'fit' },
    { type: 'seg', k: 'margin', num: true, label: 'Margin', options: [[0, 'Tanpa'], [18, 'Kecil'], [40, 'Besar']], when: o => o.imgSize !== 'fit' },
    { type: 'name', k: 'name', ph: (o, s) => s.pages.length > 1 ? 'gambar-ke-pdf' : firstBase(s) }],
  },
  {
    id: 'office-to-pdf', cat: 'convert', name: 'Word & Excel ke PDF', icon: 'word', color: '#2563eb', engine: PagesEngine,
    desc: 'Konversi DOCX, XLSX, CSV, dan TXT ke PDF.', long: 'Ubah dokumen Word, spreadsheet Excel/CSV, dan teks menjadi PDF langsung di browser.',
    ...accept('office'), action: 'Buat PDF', sideTitle: 'Konversi Office',
    perks: ['DOCX, XLSX, XLS, CSV, TXT', 'Tabel lebar otomatis menyesuaikan', 'Gabungkan beberapa dokumen'],
    defaults: { name: '' }, defName: s => s.sources.length > 1 ? 'dokumen' : firstBase(s), opts: [{ type: 'name', k: 'name', ph: (o, s) => s.sources.length > 1 ? 'dokumen' : firstBase(s) },
    { type: 'note', tone: 'warn', text: 'Halaman dirender sebagai gambar, jadi teks tidak bisa dipilih. Untuk tata letak 100% akurat, gunakan "Simpan sebagai PDF" dari Word/Excel.' }],
  },
  {
    id: 'pdf-to-text', cat: 'convert', name: 'PDF ke Teks', icon: 'text', color: '#0284c7', engine: FilesEngine,
    desc: 'Ambil seluruh teks dari PDF ke file .txt.', long: 'Ekstrak teks dari PDF digital menjadi file teks biasa yang mudah disalin.',
    ...accept('pdf'), action: 'Ekstrak teks', sideTitle: 'Ekstrak teks', perks: ['Salin langsung ke clipboard', 'Pemisah per halaman', 'Proses banyak PDF'],
    defaults: { sep: true }, opts: [{ type: 'toggle', k: 'sep', label: 'Tandai awal setiap halaman', help: 'Tambahkan baris "— Halaman N —".' }, { type: 'note', text: 'PDF hasil scan (berupa gambar) tidak memiliki teks yang bisa diambil.' }],
    async process(f, o, prog) {
      let text = '';
      for (let i = 1; i <= f.pages; i++) {
        prog((i - 1) / f.pages, `Membaca halaman ${i}…`);
        const tc = await (await f.doc.getPage(i)).getTextContent();
        if (o.sep) text += `${i > 1 ? '\n\n' : ''}— Halaman ${i} —\n\n`; else if (i > 1) text += '\n\n';
        for (const it of tc.items) text += (it.str || '') + (it.hasEOL ? '\n' : '');
      }
      text = text.replace(/[ \t]+\n/g, '\n');
      return [{ name: baseName(f.name) + '.txt', blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), text, empty: !text.replace(/— Halaman \d+ —|\s/g, '') }];
    }
  },
  { id: 'sign', cat: 'edit', name: 'Tanda tangan PDF', icon: 'sign', color: '#e11d48', engine: null, single: true, popular: true, desc: 'Gambar, ketik, atau unggah tanda tangan lalu tempel.', long: 'Buat tanda tangan, lalu tempatkan di halaman mana pun. Tambahkan juga teks atau tanggal.', ...accept('pdf'), action: 'Simpan PDF bertanda tangan', perks: ['Gambar, ketik, atau unggah', 'Seret & ubah ukuran bebas', 'Tambah teks dan tanggal'], defaults: { name: '' } },
  {
    id: 'watermark', cat: 'edit', name: 'Watermark PDF', icon: 'drop', color: '#6366f1', engine: FilesEngine, preview: (ctx, p, o) => drawStampPreview(ctx, p, o),
    desc: 'Tambahkan watermark teks atau logo.', long: 'Beri tanda pada setiap halaman dengan teks atau logo — atur posisi, sudut, dan transparansi.',
    ...accept('pdf'), action: 'Tambah watermark', sideTitle: 'Watermark', perks: ['Teks atau logo', 'Satu di tengah atau pola berulang', 'Pratinjau langsung'],
    defaults: { kind: 'text', text: 'RAHASIA', size: 64, color: '#e0393e', opacity: 22, angle: 35, layout: 'center', image: null, scale: 40 },
    opts: [{ type: 'seg', k: 'kind', label: 'Jenis', options: [['text', 'Teks'], ['image', 'Gambar / logo']] },
    { type: 'text', k: 'text', label: 'Teks watermark', maxlength: 80, when: o => o.kind === 'text' },
    { type: 'range', k: 'size', label: 'Ukuran huruf', min: 16, max: 160, fmt: v => v + ' pt', when: o => o.kind === 'text' },
    { type: 'color', k: 'color', label: 'Warna', presets: ['#e0393e', '#111827', '#6a4cff', '#0ea5a4', '#9ca3af'], when: o => o.kind === 'text' },
    { type: 'file', k: 'image', label: 'Gambar / logo', accept: 'image/png,image/jpeg,image/webp', help: 'PNG transparan memberi hasil terbaik.', when: o => o.kind === 'image' },
    { type: 'range', k: 'scale', label: 'Lebar logo', min: 10, max: 100, fmt: v => v + '%', when: o => o.kind === 'image' },
    { type: 'range', k: 'opacity', label: 'Transparansi', min: 5, max: 100, fmt: v => v + '%' },
    { type: 'range', k: 'angle', label: 'Sudut', min: -90, max: 90, fmt: v => v + '°' },
    { type: 'seg', k: 'layout', label: 'Penempatan', options: [['center', 'Tengah'], ['tile', 'Pola berulang']] }],
    validate: o => o.kind === 'text' ? (!o.text.trim() && 'Tulis teks watermark.') : (!o.image && 'Pilih gambar/logo watermark.'),
    async process(f, o, prog) {
      const { degrees } = await lib('pdflib'); const doc = await loadForEdit(f.bytes), st = await makeStamp(o);
      const img = await doc.embedPng(new Uint8Array(await (await toBlob(st.c)).arrayBuffer()));
      const pages = doc.getPages();
      pages.forEach((pg, i) => {
        prog(i / pages.length, `Halaman ${i + 1} dari ${pages.length}…`);
        const g = pageGeom(pg), [w, h] = st.sizeAt(g.VW);
        for (const [x, y] of stampPlaces(o, g.VW, g.VH, w, h)) { const p = g.place(x, y, w, h); pg.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.rotate), opacity: o.opacity / 100 }); }
      });
      return [{ name: baseName(f.name) + '-watermark.pdf', blob: await savePdf(doc) }];
    }
  },
  {
    id: 'page-numbers', cat: 'edit', name: 'Nomor halaman', icon: 'hash', color: '#06b6d4', engine: FilesEngine, preview: (ctx, p, o) => drawNumPreview(ctx, p, o),
    desc: 'Tambahkan nomor halaman ke PDF.', long: 'Tambahkan nomor halaman dengan posisi, format, dan ukuran yang bisa diatur.',
    ...accept('pdf'), action: 'Tambah nomor', sideTitle: 'Nomor halaman', perks: ['6 posisi & 5 format', 'Lewati halaman sampul', 'Pratinjau langsung'],
    defaults: { pos: 'bc', fmt: '{n}', start: 1, skipFirst: false, size: 11, margin: 28, color: '#333333' },
    opts: [{ type: 'pos', k: 'pos', label: 'Posisi', allowed: ['tl', 'tc', 'tr', 'bl', 'bc', 'br'] },
    { type: 'select', k: 'fmt', label: 'Format', options: NUM_FMT },
    { type: 'number', k: 'start', label: 'Mulai dari angka', min: 0 },
    { type: 'toggle', k: 'skipFirst', label: 'Lewati halaman pertama', help: 'Halaman sampul tidak diberi nomor.' },
    { type: 'range', k: 'size', label: 'Ukuran huruf', min: 7, max: 28, fmt: v => v + ' pt' },
    { type: 'seg', k: 'margin', num: true, label: 'Jarak dari tepi', options: [[18, 'Dekat'], [28, 'Sedang'], [44, 'Jauh']] },
    { type: 'color', k: 'color', label: 'Warna', presets: ['#333333', '#000000', '#6a4cff', '#e0393e'] }],
    async process(f, o, prog) {
      const { StandardFonts, degrees } = await lib('pdflib'); const doc = await loadForEdit(f.bytes), font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages(), col = hexRgb(o.color);
      pages.forEach((pg, i) => {
        prog(i / pages.length, `Halaman ${i + 1}…`); const text = numText(o, i, pages.length); if (!text) return;
        const g = pageGeom(pg), tw = font.widthOfTextAtSize(text, o.size), [u, v] = numPos(o, g.VW, g.VH, tw, o.size), [x, y] = g.map(u, v);
        pg.drawText(text, { x, y, size: o.size, font, color: col, rotate: degrees(g.R) });
      });
      return [{ name: baseName(f.name) + '-bernomor.pdf', blob: await savePdf(doc) }];
    }
  },
  { id: 'crop', cat: 'edit', name: 'Crop PDF', icon: 'crop', color: '#10b981', engine: null, single: true, desc: 'Potong area halaman, termasuk deteksi otomatis.', long: 'Tarik kotak untuk memotong halaman — atau biarkan RapiPDF mendeteksi area kosong.', ...accept('pdf'), action: 'Crop PDF', perks: ['Tarik kotak secara visual', 'Deteksi margin kosong otomatis', 'Semua halaman atau satu halaman'], defaults: { scope: 'all', name: '' } },
  {
    id: 'protect', cat: 'security', name: 'Protect PDF', icon: 'lock', color: '#334155', engine: FilesEngine,
    desc: 'Kunci PDF dengan kata sandi AES-256.', long: 'Lindungi PDF dengan kata sandi dan enkripsi AES-256. Atur juga izin cetak dan salin.',
    ...accept('pdf'), action: 'Lindungi PDF', sideTitle: 'Kata sandi', perks: ['Enkripsi AES-256', 'Batasi cetak, salin, edit', 'Sandi tidak pernah meninggalkan perangkat'],
    defaults: { pw: '', pw2: '', print: true, copy: true, edit: true },
    opts: [{
      type: 'password', k: 'pw', label: 'Kata sandi', ph: 'Minimal 6 karakter', extra: () => `<div class="strength"><i></i></div><small class="str-t"></small>`,
      live: (box, o) => {
        const p = o.pw; let sc = 0; if (p.length >= 6) sc++; if (p.length >= 10) sc++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) sc++; if (/\d/.test(p)) sc++; if (/[^A-Za-z0-9]/.test(p)) sc++;
        const lv = [['', '#0000'], ['Lemah', '#e0393e'], ['Lemah', '#e0393e'], ['Cukup', '#f59e0b'], ['Kuat', '#14a058'], ['Sangat kuat', '#14a058']][p ? Math.max(1, sc) : 0];
        const bar = $('.strength i', box); if (bar) { bar.style.width = (p ? Math.max(1, sc) : 0) * 20 + '%'; bar.style.background = lv[1]; } const tx = $('.str-t', box); if (tx) tx.textContent = lv[0];
      }
    },
    { type: 'password', k: 'pw2', label: 'Ulangi kata sandi', ph: 'Ketik ulang kata sandi' },
    { type: 'title', text: 'Izin untuk pembaca' },
    { type: 'toggle', k: 'print', label: 'Boleh mencetak' }, { type: 'toggle', k: 'copy', label: 'Boleh menyalin teks & gambar' }, { type: 'toggle', k: 'edit', label: 'Boleh mengubah dokumen' },
    { type: 'note', tone: 'warn', text: 'Simpan kata sandi Anda baik-baik — tanpa kata sandi, PDF tidak dapat dibuka.' }],
    validate: o => o.pw.length < 6 ? 'Kata sandi minimal 6 karakter.' : o.pw !== o.pw2 ? 'Kedua kata sandi belum sama.' : null,
    async process(f, o, prog) {
      prog(.2, 'Mengenkripsi dengan AES-256…');
      const restrict = !(o.print && o.copy && o.edit);
      const owner = restrict ? Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('') : o.pw;
      const args = ['/in.pdf', '--encrypt', `--user-password=${o.pw}`, `--owner-password=${owner}`, '--bits=256'];
      if (!o.print) args.push('--print=none'); if (!o.copy) args.push('--extract=n'); if (!o.edit) args.push('--modify=none');
      args.push('--', '/out.pdf');
      const { code, out } = await qpdf(args, f.bytes);
      if ((code !== 0 && code !== 3) || !out) throw Error('Enkripsi gagal untuk ' + f.name);
      return [{ name: baseName(f.name) + '-terkunci.pdf', blob: new Blob([out], { type: 'application/pdf' }) }];
    }
  },
  {
    id: 'unlock', cat: 'security', name: 'Unlock PDF', icon: 'unlock', color: '#64748b', engine: FilesEngine,
    desc: 'Hapus kata sandi & batasan dari PDF milik Anda.', long: 'Hapus kata sandi dan batasan cetak/salin dari PDF yang Anda punya aksesnya.',
    ...accept('pdf'), action: 'Buka kunci', sideTitle: 'Buka kunci', perks: ['Hapus kata sandi pembuka', 'Hapus batasan cetak & salin', 'Diproses lokal sepenuhnya'],
    defaults: {}, opts: [{ type: 'note', text: 'Jika PDF memakai kata sandi pembuka, Anda sudah diminta memasukkannya saat file ditambahkan. Batasan cetak/salin dihapus otomatis.' }],
    async process(f, o, prog) {
      prog(.3, 'Membuka kunci…'); const name = baseName(f.name) + '-terbuka.pdf';
      if (f.decrypted) return [{ name, blob: new Blob([f.bytes], { type: 'application/pdf' }) }];
      const chk = await qpdf(['--is-encrypted', '/in.pdf'], f.bytes);
      if (chk.code === 2) { toast(`${f.name} tidak terkunci — tidak ada yang perlu dibuka.`); return [{ name: f.name, blob: f.file, same: true }]; }
      const { code, out } = await qpdf(['--decrypt', '/in.pdf', '/out.pdf'], f.bytes);
      if ((code !== 0 && code !== 3) || !out) throw Error('Tidak dapat membuka kunci ' + f.name + '.');
      return [{ name, blob: new Blob([out], { type: 'application/pdf' }) }];
    }
  },
  { id: 'studio', cat: 'image', name: 'Studio gambar', icon: 'wand', color: '#c026d3', engine: null, single: true, popular: true, isNew: true, desc: 'Hapus latar dengan AI, ganti latar, crop & ubah ukuran.', long: 'Hapus latar dengan AI di perangkat, ganti dengan warna atau foto, sesuaikan warna, potong, dan ubah ukuran.', ...accept('img'), action: 'Simpan gambar', perks: ['Hapus latar dengan AI', 'Ganti latar warna atau foto', 'Ekspor PNG, JPG, WEBP'], defaults: {} },
];
const T = Object.fromEntries(TOOLS.map(t => [t.id, t]));
TOOLS.forEach(t => t.defName ||= s => firstBase(s));

/* pratinjau langsung untuk watermark & nomor halaman */
async function drawStampPreview(ctx, p, o) {
  if (o.kind === 'image' && !o.image) return;
  const st = await makeStamp(o), [w, h] = st.sizeAt(p.VW);
  ctx.globalAlpha = o.opacity / 100;
  for (const [x, y] of stampPlaces(o, p.VW, p.VH, w, h)) ctx.drawImage(st.c, x * p.k, y * p.k, w * p.k, h * p.k);
  ctx.globalAlpha = 1;
}
function drawNumPreview(ctx, p, o) {
  const text = numText(o, 0, p.total); if (!text) return;
  ctx.font = `${o.size * p.k}px Helvetica, Arial, sans-serif`; ctx.fillStyle = o.color;
  const tw = ctx.measureText(text).width / p.k, [u, v] = numPos(o, p.VW, p.VH, tw, o.size);
  ctx.fillText(text, u * p.k, v * p.k);
}
