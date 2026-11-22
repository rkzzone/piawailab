'use strict';
/* =========================================================
   CORE — helpers, ikon, pemuat library, PDF utilities, UI dasar
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
const baseName = n => String(n).replace(/\.[^.]+$/, '');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 2 : 1)} MB`;
const cleanName = (s, fallback) => (String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/\.(pdf|png|jpe?g|webp|zip|txt)$/i, '') || fallback);
const isPdf = f => extOf(f.name) === 'pdf' || f.type === 'application/pdf';
const isImage = f => /^image\//.test(f.type) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(extOf(f.name));
const toBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(Error('Gambar terlalu besar untuk diproses browser.')), type, q));
const u8 = b => b instanceof Uint8Array ? b : new Uint8Array(b);
const copyBytes = b => (b instanceof ArrayBuffer ? new Uint8Array(b.slice(0)) : new Uint8Array(b));
const store = { // localStorage dengan prefiks; migrasi otomatis dari nama lama (rapipdf:)
  get(k, d) {
    try {
      let v = localStorage.getItem('piawailab:' + k);
      if (v == null) { const o = localStorage.getItem('rapipdf:' + k); if (o != null) { localStorage.setItem('piawailab:' + k, o); localStorage.removeItem('rapipdf:' + k); v = o; } }
      return v == null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('piawailab:' + k, JSON.stringify(v)); } catch { } },
  clearAll() { try { Object.keys(localStorage).filter(k => /^(piawailab|rapipdf):/.test(k)).forEach(k => localStorage.removeItem(k)); } catch { } }
};
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
async function decodeImage(src) { // File/Blob -> HTMLImageElement (orientation EXIF diterapkan browser)
  const url = URL.createObjectURL(src); const img = new Image(); img.src = url;
  try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  return img;
}

/* ---------- ikon (gaya garis) ---------- */
const ICONS = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  merge: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><path d="M7 16v1a2 2 0 0 0 2 2h1M17 8V7a2 2 0 0 0-2-2h-1"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  organize: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  pdf2img: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="10" cy="12" r="1.6"/><path d="m19 17-2.5-2.5L10 21"/>',
  img2pdf: '<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><circle cx="12" cy="8" r="1.5"/><path d="m21 13-3-3-6 6"/>',
  word: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 12l1.2 5 1.3-4 1.3 4 1.2-5"/>',
  text: '<path d="M4 7V5h16v2M9 20h6M12 5v15"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  drop: '<path d="M12 21.5a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 12.5 5 14.5a7 7 0 0 0 7 7z"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/>',
  sign: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  wand: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.9L12 16.5l-1.8-4.9L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.1 2.2.9-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.9z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  chevd: '<path d="m6 9 6 6 6-6"/>',
  chevl: '<path d="m15 18-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  grid: '<circle cx="5" cy="5" r="1.4"/><circle cx="12" cy="5" r="1.4"/><circle cx="19" cy="5" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/><circle cx="5" cy="19" r="1.4"/><circle cx="12" cy="19" r="1.4"/><circle cx="19" cy="19" r="1.4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  zip: '<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  bolt: '<path d="M13 2 4 14h8l-1 8 9-12h-8z"/>',
  infinity: '<path d="M12 12c-2-2.7-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.3 6-4zm0 0c2 2.7 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.3-6 4z"/>',
  offline: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 9.5 5.2M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-1.7-1.3M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  type: '<path d="M4 7V5h16v2M9 20h6M12 5v15"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  sortaz: '<path d="M3 6h9M3 12h6M3 18h3M17 5v14M14 16l3 3 3-3"/>',
  select: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="m8 12 3 3 5-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  excel: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M3 15h18M9 3v18"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.file}</svg>`;

/* ---------- toast & modal ---------- */
function toast(msg, type = 'info', action) {
  const box = $('#toasts');
  const t = el(`<div class="toast ${type}">${ic(type === 'err' ? 'alert' : type === 'ok' ? 'check' : 'info')}<span></span></div>`);
  t.querySelector('span').textContent = msg;
  if (action) { const b = el(`<button>${esc(action.label)}</button>`); b.onclick = () => { action.run(); t.remove(); }; t.append(b); }
  box.append(t); while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => t.remove(), action ? 7000 : 4200);
}
function modal({ title, body, actions = [], wide = false, onOpen }) {
  return new Promise(resolve => {
    const bg = el(`<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3></h3><button class="icon-btn" data-x aria-label="Tutup">${ic('x')}</button></div><div class="modal-b"></div><div class="modal-f"></div></div></div>`);
    bg.querySelector('h3').textContent = title;
    const b = bg.querySelector('.modal-b'); typeof body === 'string' ? b.innerHTML = body : b.append(body);
    const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = actions.find(a => a.primary); if (p) { e.preventDefault(); run(p); } } };
    const run = async a => { const v = a.value ? await a.value(bg) : a.result; if (v === false) return; close(v ?? a.result ?? true); };
    for (const a of actions) { const btn = el(`<button class="btn ${a.primary ? 'btn-main' : 'btn-line'}">${esc(a.label)}</button>`); btn.onclick = () => run(a); bg.querySelector('.modal-f').append(btn); }
    if (!actions.length) bg.querySelector('.modal-f').remove();
    bg.querySelector('[data-x]').onclick = () => close(null);
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(bg);
    onOpen?.(bg, close);
    setTimeout(() => bg.querySelector('input:not([type=hidden]),textarea')?.focus(), 30);
  });
}
async function askPassword(name, wrong) {
  return modal({
    title: 'PDF dilindungi kata sandi',
    body: `<p><b>${esc(name)}</b> terkunci. Masukkan kata sandinya untuk membuka file ini di perangkat Anda.</p>
      <input class="inp" type="password" id="pwAsk" placeholder="Kata sandi PDF" autocomplete="off">
      ${wrong ? '<p style="color:var(--danger);font-size:12.5px;margin:8px 0 0">Kata sandi salah. Coba lagi.</p>' : ''}`,
    actions: [{ label: 'Lewati file' , result: null }, { label: 'Buka', primary: true, value: bg => bg.querySelector('#pwAsk').value || false }]
  });
}

/* ---------- pemuat library (lokal dulu, CDN sebagai cadangan) ---------- */
const VENDOR = 'vendor/';
const LIBS = {
  pdfjs: { file: 'pdf.min.js', cdn: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', test: () => window.pdfjsLib },
  pdflib: { file: 'pdf-lib.min.js', cdn: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js', test: () => window.PDFLib },
  jszip: { file: 'jszip.min.js', cdn: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', test: () => window.JSZip },
  xlsx: { file: 'xlsx.full.min.js', cdn: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', test: () => window.XLSX },
  h2c: { file: 'html2canvas.min.js', cdn: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', test: () => window.html2canvas },
  docx: { file: 'docx-preview.min.js', cdn: 'https://unpkg.com/docx-preview@0.3.6/dist/docx-preview.min.js', test: () => window.docx?.renderAsync && window.docx, deps: ['jszip'] },
  mediabunny: { file: 'mediabunny.min.js', cdn: 'https://cdn.jsdelivr.net/npm/mediabunny@1.66.2/dist/bundles/mediabunny.min.cjs', test: () => window.Mediabunny },
  qpdf: { file: 'qpdf.js', cdn: 'https://cdn.jsdelivr.net/npm/@soulehshaikh99/qpdf-wasm@0.4.1/dist/qpdf.js', test: () => window.Module },
};
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const scripts = {};
function loadScript(src) {
  return scripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => { delete scripts[src]; s.remove(); rej(Error('Gagal memuat ' + src)); };
    document.head.append(s);
  });
}
const libCache = {};
function lib(key) {
  return libCache[key] ||= (async () => {
    const L = LIBS[key];
    for (const d of L.deps || []) await lib(d);
    if (!L.test()) { try { await loadScript(VENDOR + L.file); } catch { } }
    if (!L.test()) { try { await loadScript(L.cdn); } catch { } }
    if (!L.test()) { delete libCache[key]; throw Error('Komponen pemroses gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'); }
    return L.test();
  })();
}
let sharedWorker = null;
const pdfjs = () => libCache.pdfjsReady ||= (async () => {
  const L = await lib('pdfjs');
  if (location.protocol === 'file:') {
    // Browser tidak bisa membuat Worker dari file:// → muat kode worker lokal sebagai teks lalu jalankan dari Blob (tetap offline & tetap di thread terpisah)
    try {
      await loadScript(VENDOR + 'pdf.worker.src.js');
      const url = URL.createObjectURL(new Blob([window.PDFJS_WORKER_SRC], { type: 'text/javascript' })); window.PDFJS_WORKER_SRC = null;
      L.GlobalWorkerOptions.workerSrc = url;
      try { sharedWorker = new L.PDFWorker({ port: new Worker(url) }); } catch { /* fallback: pdf.js menjalankan worker di thread utama */ }
    } catch { L.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js'; }
  } else L.GlobalWorkerOptions.workerSrc = new URL(VENDOR + 'pdf.worker.min.js', location.href).href;
  return L;
})();
async function openPdf(bytes, password) {
  const L = await pdfjs();
  // data font standar & CMap: lokal saat lewat http(s); dari CDN saat dibuka langsung dari file:// (browser memblokir fetch file://)
  const base = location.protocol === 'file:' ? (navigator.onLine ? PDFJS_CDN : null) : new URL(VENDOR, location.href).href;
  return L.getDocument({ data: copyBytes(bytes), password, ...(sharedWorker ? { worker: sharedWorker } : {}), isEvalSupported: false, ...(base ? { cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/' } : {}), verbosity: 0 }).promise;
}
async function renderPage(page, { width, scale, maxSide = 4000, bg = '#fff' } = {}) {
  const base = page.getViewport({ scale: 1 });
  let s = scale ?? (width ? width / base.width : 1);
  s = Math.min(s, maxSide / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale: s });
  const c = canvas(vp.width, vp.height); const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: bg }).promise;
  return c;
}

/* qpdf (WebAssembly) — enkripsi, dekripsi, optimasi lossless */
let qpdfWasmUrl;
async function qpdfWasm() {
  if (qpdfWasmUrl) return qpdfWasmUrl;
  try {
    await loadScript(VENDOR + 'qpdf.wasm.js');
    const blob = await (await fetch('data:application/wasm;base64,' + window.QPDF_WASM_B64)).blob();
    window.QPDF_WASM_B64 = null;
    qpdfWasmUrl = URL.createObjectURL(new Blob([blob], { type: 'application/wasm' }));
  } catch { qpdfWasmUrl = 'https://cdn.jsdelivr.net/npm/@soulehshaikh99/qpdf-wasm@0.4.1/dist/qpdf.wasm'; }
  return qpdfWasmUrl;
}
async function qpdf(args, input) {
  const factory = await lib('qpdf'); const wasm = await qpdfWasm();
  const q = await factory({ locateFile: () => wasm, print: () => { }, printErr: () => { } });
  q.FS.writeFile('/in.pdf', u8(input));
  let code; try { code = q.callMain(args); } catch (e) { code = typeof e?.status === 'number' ? e.status : 2; }
  let out = null; try { out = q.FS.readFile('/out.pdf'); } catch { }
  return { code, out };
}

/* pdf-lib: muat untuk diedit; PDF dengan pembatasan (owner password) dibuka otomatis via qpdf */
async function loadForEdit(bytes) {
  const { PDFDocument } = await lib('pdflib');
  try { return await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (!/encrypt/i.test(e?.message || '')) throw e;
    const { code, out } = await qpdf(['--decrypt', '/in.pdf', '/out.pdf'], bytes);
    if ((code !== 0 && code !== 3) || !out) throw Error('PDF terenkripsi. Buka dulu dengan alat Unlock PDF.');
    return PDFDocument.load(out, { updateMetadata: false });
  }
}
async function savePdf(doc) {
  doc.setProducer('PiawaiLab'); doc.setModificationDate(new Date());
  return new Blob([await doc.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

/* Buka PDF dari File: menangani PDF berpassword (minta sandi lalu dekripsi via qpdf) */
async function readPdfFile(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  let password, wrong = false;
  for (; ;) {
    try {
      const doc = await openPdf(bytes, password);
      if (password) { // simpan versi tanpa sandi agar bisa diedit
        const { code, out } = await qpdf([`--password=${password}`, '--decrypt', '/in.pdf', '/out.pdf'], bytes);
        if ((code === 0 || code === 3) && out) bytes = out;
      }
      return { bytes, doc, decrypted: !!password };
    } catch (e) {
      if (e?.name === 'PasswordException') {
        wrong = e.code === 2;
        password = await askPassword(file.name, wrong);
        if (!password) throw Object.assign(Error('Dilewati — file terkunci.'), { skipped: true });
        continue;
      }
      if (e?.name === 'InvalidPDFException') throw Error('File PDF rusak atau bukan PDF yang valid.');
      throw e;
    }
  }
}

/* Koordinat "visual" (seperti yang terlihat, origin kiri-atas, satuan pt) → koordinat PDF, memperhitungkan CropBox & /Rotate */
function pageGeom(page) {
  const box = page.getCropBox(); const R = ((page.getRotation().angle % 360) + 360) % 360;
  const { x: ox, y: oy, width: W, height: H } = box;
  const VW = R % 180 ? H : W, VH = R % 180 ? W : H;
  const map = (u, v) => R === 0 ? [ox + u, oy + H - v] : R === 90 ? [ox + v, oy + u] : R === 180 ? [ox + W - u, oy + v] : [ox + W - v, oy + H - u];
  // titik jangkar kiri-bawah untuk objek tegak berukuran w×h di posisi visual (x,y)
  const place = (x, y, w, h) => { const [px, py] = map(x, y + h); return { x: px, y: py, rotate: R }; };
  return { R, VW, VH, map, place };
}

/* simpan file: dialog "Simpan sebagai" (jika didukung & diaktifkan) atau unduhan biasa */
async function saveBlob(blob, name) {
  if (window.showSaveFilePicker && store.get('askLocation', true)) {
    try {
      const ext = '.' + extOf(name);
      const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'File', accept: { [blob.type || 'application/octet-stream']: [ext] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      toast(`Tersimpan: ${h.name}`, 'ok'); return true;
    } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000); return true;
}

/* parsing rentang halaman: "1-3, 5, 8-" → [[0,1,2],[4],[7..n-1]] */
function parseRanges(str, max) {
  const groups = [];
  for (const part of String(str).split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*(?:-\s*(\d*|z|akhir))?$/i);
    if (!m) throw Error(`Rentang "${part}" tidak valid. Contoh: 1-3, 5, 8-`);
    let a = m[1] ? +m[1] : 1, b = m[2] === undefined ? a : (m[2] === '' || /z|akhir/i.test(m[2]) ? max : +m[2]);
    if (!m[1] && m[2] === undefined) continue;
    if (a < 1 || b < 1 || a > max) throw Error(`Halaman ${a} di luar jangkauan (1–${max}).`);
    b = Math.min(b, max); const g = [];
    for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) g.push(i - 1);
    groups.push(g);
  }
  if (!groups.length) throw Error('Masukkan rentang halaman.');
  return groups;
}

/* gambar: normalisasi untuk PDF (orientasi EXIF, format yang bisa disematkan) */
function jpegOrientation(buf) {
  const v = new DataView(buf); if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return 1;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const marker = v.getUint16(o), len = v.getUint16(o + 2);
    if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
      const t = o + 10, le = v.getUint16(t) === 0x4949, n = v.getUint16(t + v.getUint32(t + 4, le), le);
      for (let i = 0; i < n; i++) { const e = t + v.getUint32(t + 4, le) + 2 + i * 12; if (e + 10 > v.byteLength) break; if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le); }
      return 1;
    }
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
    o += 2 + len;
  }
  return 1;
}
async function normalizeImage(file, maxSide = 6000) {
  const buf = await file.arrayBuffer();
  const type = file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' })[extOf(file.name)] || '';
  const img = await decodeImage(new Blob([buf], { type }));
  const w = img.naturalWidth, h = img.naturalHeight;
  const big = Math.max(w, h) > maxSide;
  const oriented = type === 'image/jpeg' && jpegOrientation(buf) > 1;
  if ((type === 'image/jpeg' || type === 'image/png') && !big && !oriented) return { bytes: new Uint8Array(buf), mime: type, w, h, img };
  const s = Math.min(1, maxSide / Math.max(w, h)), c = canvas(w * s, h * s), ctx = c.getContext('2d');
  const keepAlpha = type !== 'image/jpeg';
  if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const mime = keepAlpha ? 'image/png' : 'image/jpeg';
  const blob = await toBlob(c, mime, .92);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, w: c.width, h: c.height, img };
}
async function videoPoster(file, w = 160) {
  const v = document.createElement('video'), url = URL.createObjectURL(file);
  v.muted = true; v.preload = 'metadata'; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(Error('video')); setTimeout(() => rej(Error('timeout')), 6000); });
    v.currentTime = Math.min(1, (v.duration || 2) / 3); await new Promise(r => { v.onseeked = r; setTimeout(r, 2500); });
    const k = w / v.videoWidth, c = canvas(v.videoWidth * k, v.videoHeight * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return URL.createObjectURL(await toBlob(c, 'image/jpeg', .8));
  } finally { URL.revokeObjectURL(url); }
}
async function thumbFrom(source, w = 320) {
  const s = Math.min(1, w / (source.naturalWidth || source.width));
  const c = canvas((source.naturalWidth || source.width) * s, (source.naturalHeight || source.height) * s);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return URL.createObjectURL(await toBlob(c, 'image/jpeg', .8));
}
async function zipOutputs(outputs, name) {
  const JSZip = await lib('jszip'); const z = new JSZip(); const used = new Set();
  for (const o of outputs) { let n = o.name, i = 2; while (used.has(n)) n = `${baseName(o.name)} (${i++}).${extOf(o.name)}`; used.add(n); z.file(n, o.blob); }
  return { name, blob: await z.generateAsync({ type: 'blob', compression: 'STORE' }) };
}
