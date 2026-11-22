/* =========================================================
   ENGINE KHUSUS — Tanda tangan, Crop visual, Studio gambar
   ========================================================= */
function loadingBody(ui, msg = 'Membuka file…') { ui.body.innerHTML = `<div style="display:grid;place-items:center;height:340px;color:var(--muted);gap:10px;align-content:center;justify-items:center"><i class="spin" style="width:28px;height:28px;border-width:3px"></i>${esc(msg)}</div>`; ui.run.disabled = true; }
async function singlePdfAdd(s, files, t, reset) {
  reset(s); const file = files[0];
  try { const r = await readPdfFile(file); s.file = { name: file.name, size: file.size, bytes: r.bytes, doc: r.doc, pages: r.doc.numPages }; }
  catch (e) { if (!e.skipped) toast(`${file.name}: ${e.message}`, 'err'); s.stage = 'upload'; }
  rerender();
}
function trimCanvas(c, pad = 6) {
  const g = c.getContext('2d', { willReadFrequently: true }), { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1); out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/* ===================== TANDA TANGAN ===================== */
let SIGS = store.get('sigs', []);
const saveSigs = () => store.set('sigs', SIGS.filter(x => x.keep).slice(-8));
function textAsset(text, size, color, weight = 500) {
  const S = 3, m = canvas(4, 4).getContext('2d'); m.font = `${weight} ${size * S}px ${FONT_STACK}`;
  const c = canvas(m.measureText(text).width + 8, size * S * 1.35), g = c.getContext('2d');
  g.font = m.font; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 4, c.height / 2);
  return { id: uid(), url: c.toDataURL('image/png'), w: c.width, h: c.height, ptW: c.width / S };
}
async function signatureDialog() {
  const fonts = ['"Segoe Script", cursive', '"Lucida Handwriting", cursive', '"Ink Free", cursive', '"Brush Script MT", cursive', 'cursive'];
  const colors = ['#111827', '#1d3fa8', '#b91c1c'];
  const body = el(`<div>
    <div class="seg" style="margin-bottom:14px"><button type="button" data-tab="draw" class="on">${ic('sign')} Gambar</button><button type="button" data-tab="type">${ic('type')} Ketik</button><button type="button" data-tab="upload">${ic('upload')} Unggah</button></div>
    <div data-pane="draw"><canvas class="pad"></canvas></div>
    <div data-pane="type" hidden><input class="inp" data-name placeholder="Ketik nama Anda" maxlength="40"><div class="fonts"></div></div>
    <div data-pane="upload" hidden><input class="inp" style="padding-top:8px" type="file" accept="image/*" data-file><label class="tog" style="margin-top:12px"><span><b>Hapus latar putih</b><small>Untuk foto tanda tangan di kertas.</small></span><span class="sw"><input type="checkbox" data-white checked><i></i></span></label><div class="checker" data-upprev style="margin-top:12px;border-radius:12px;min-height:120px;display:grid;place-items:center;padding:10px"></div></div>
    <div class="pad-tools"><div class="colors">${colors.map((c, i) => `<button type="button" data-color="${c}" class="${i ? '' : 'on'}" style="background:${c}" aria-label="Warna"></button>`).join('')}</div><span style="flex:1"></span><button type="button" class="tbtn" data-clear>${ic('trash')} Hapus</button></div>
    <label class="ask-loc"><input type="checkbox" data-keep checked> Ingat tanda tangan ini di perangkat ini</label></div>`);
  let tab = 'draw', color = colors[0], font = 0, drawn = false, upImg = null;
  const pad = $('.pad', body);
  const paintFonts = () => { const name = $('[data-name]', body).value || 'Tanda Tangan'; $('.fonts', body).innerHTML = fonts.map((f, i) => `<button type="button" data-font="${i}" class="${i === font ? 'on' : ''}" style="font-family:${f.replace(/"/g, '&quot;')};color:${color}">${esc(name)}</button>`).join(''); };
  const upProcessed = () => {
    if (!upImg) return null; const s = Math.min(1, 1400 / Math.max(upImg.naturalWidth, upImg.naturalHeight)), c = canvas(upImg.naturalWidth * s, upImg.naturalHeight * s), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(upImg, 0, 0, c.width, c.height);
    if ($('[data-white]', body).checked) { const id = g.getImageData(0, 0, c.width, c.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; if (l > 200) d[i + 3] = Math.max(0, d[i + 3] * (1 - (l - 200) / 40)); } g.putImageData(id, 0, 0); }
    return trimCanvas(c);
  };
  const paintUp = () => { const c = upProcessed(); $('[data-upprev]', body).innerHTML = ''; if (c) { c.style.cssText = 'max-width:100%;max-height:180px'; $('[data-upprev]', body).append(c); } };
  body.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; $$('[data-tab]', body).forEach(b => b.classList.toggle('on', b === tb)); $$('[data-pane]', body).forEach(p => p.hidden = p.dataset.pane !== tab); $('.pad-tools', body).style.display = tab === 'upload' ? 'none' : ''; if (tab === 'type') { paintFonts(); $('[data-name]', body).focus(); } }
    const cb = e.target.closest('[data-color]'); if (cb) { color = cb.dataset.color; $$('[data-color]', body).forEach(b => b.classList.toggle('on', b === cb)); paintFonts(); }
    const fb = e.target.closest('[data-font]'); if (fb) { font = +fb.dataset.font; paintFonts(); }
    if (e.target.closest('[data-clear]')) { pad.getContext('2d').clearRect(0, 0, pad.width, pad.height); drawn = false; $('[data-name]', body).value = ''; paintFonts(); }
  });
  $('[data-name]', body).oninput = paintFonts;
  $('[data-file]', body).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { upImg = await decodeImage(f); paintUp(); } catch { toast('Gambar tidak dapat dibaca.', 'err'); } };
  $('[data-white]', body).onchange = paintUp;
  const result = await modal({
    title: 'Buat tanda tangan', body, wide: true,
    onOpen: () => {
      const dpr = Math.min(3, devicePixelRatio || 1); pad.width = pad.clientWidth * dpr; pad.height = pad.clientHeight * dpr;
      const g = pad.getContext('2d'); g.lineCap = g.lineJoin = 'round';
      let pts = null;
      pad.onpointerdown = e => { pad.setPointerCapture(e.pointerId); pts = [[e.offsetX * dpr, e.offsetY * dpr]]; g.strokeStyle = color; g.lineWidth = 2.8 * dpr; g.beginPath(); g.arc(pts[0][0], pts[0][1], 1.2 * dpr, 0, 7); g.fillStyle = color; g.fill(); drawn = true; };
      pad.onpointermove = e => {
        if (!pts) return; pts.push([e.offsetX * dpr, e.offsetY * dpr]); if (pts.length < 3) return;
        const [a, b, c] = pts.slice(-3); g.beginPath(); g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2); g.stroke();
      };
      pad.onpointerup = pad.onpointercancel = () => { pts = null; };
      paintFonts();
    },
    actions: [{ label: 'Batal', result: null }, {
      label: 'Simpan tanda tangan', primary: true, value: () => {
        let c;
        if (tab === 'draw') { if (!drawn) return toast('Gambar tanda tangan Anda dulu.', 'err'), false; c = trimCanvas(pad, 10); }
        else if (tab === 'type') { const name = $('[data-name]', body).value.trim(); if (!name) return toast('Ketik nama Anda dulu.', 'err'), false; const t = canvas(1400, 260), g = t.getContext('2d'); g.font = `120px ${fonts[font]}`; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(name, 20, 130); c = trimCanvas(t, 10); }
        else { c = upProcessed(); if (!c) return toast('Pilih gambar tanda tangan.', 'err'), false; }
        if (!c) return false;
        return { id: uid(), url: c.toDataURL('image/png'), w: c.width, h: c.height, keep: $('[data-keep]', body).checked };
      }
    }]
  });
  if (result) { SIGS.push(result); saveSigs(); }
  return result;
}
const SignEngine = {
  init: () => ({ file: null, items: [], sel: null, dims: [], assets: {} }),
  reset(s) { s.file?.doc?.destroy(); Object.assign(s, SignEngine.init()); },
  add: (s, files, t) => singlePdfAdd(s, files, t, SignEngine.reset),
  work(root, s, t) {
    const ui = s.ui = wsLayout(root, t, { sideTitle: 'Tanda tangan', sub: 'Klik untuk menempel, lalu seret ke posisinya.' });
    ui.bar.innerHTML = `<div class="info"></div><button class="tbtn outline" data-a="add">${ic('refresh')}Ganti file</button>`;
    ui.bar.onclick = e => { if (e.target.closest('[data-a="add"]')) pickFiles(t); };
    if (!s.file) return loadingBody(ui);
    $('.info', ui.bar).innerHTML = `${esc(s.file.name)} <span>· ${s.file.pages} halaman</span>`;
    ui.body.innerHTML = `<div class="viewer" style="gap:34px;padding-top:26px"></div>`;
    const viewer = $('.viewer', ui.body);
    const paintItems = pi => {
      const layer = viewer.querySelector(`.vpage[data-p="${pi}"] .layer`), d = s.dims[pi]; if (!layer) return;
      layer.innerHTML = s.items.filter(it => it.page === pi).map(it => `<div class="item ${s.sel === it.id ? 'sel' : ''}" data-it="${it.id}" style="left:${it.x * 100}%;top:${it.y * 100}%;width:${it.w * 100}%;height:${it.w * it.ar * d.VW / d.VH * 100}%"><img src="${s.assets[it.asset].url}" alt=""><span class="h-del" data-del title="Hapus">${ic('x')}</span><span class="h-rs" data-rs title="Ubah ukuran">${ic('plus')}</span></div>`).join('');
    };
    const paintAll = () => s.dims.forEach((_, i) => paintItems(i));
    const paintSide = () => {
      ui.opts.innerHTML = `<div class="opt"><span class="lbl">Tanda tangan Anda</span><div class="sigs">${SIGS.map(g => `<button type="button" class="sig" data-sig="${g.id}" title="Tempel ke halaman"><img src="${g.url}" alt="Tanda tangan"><span class="rm" data-rmsig="${g.id}" title="Hapus dari daftar">${ic('x')}</span></button>`).join('')}<button type="button" class="sig add" data-newsig>${ic('plus')} Buat baru</button></div></div>
        <div class="opt"><span class="lbl">Tambahkan juga</span><div class="seg"><button type="button" data-add="text">${ic('type')} Teks</button><button type="button" data-add="date">${ic('cal')} Tanggal</button><button type="button" data-add="initial">Inisial</button></div></div>
        <div class="note">${ic('info')}<span>${s.items.length ? `${s.items.length} objek di dokumen. Seret untuk memindah, tarik sudut kanan bawah untuk mengubah ukuran, tekan Delete untuk menghapus.` : 'Belum ada objek di dokumen. Halaman yang sedang terlihat akan dipakai.'}</span></div>
        ${optField(nameOpt('-ttd'), s.opts, s)}`;
      ui.run.disabled = !s.items.length;
    };
    const visiblePage = () => {
      const vr = viewer.getBoundingClientRect(); let best = 0, bv = -1, cy = .5;
      $$('.vpage', viewer).forEach(p => { const r = p.getBoundingClientRect(), top = Math.max(r.top, vr.top, 64), bot = Math.min(r.bottom, vr.bottom, innerHeight), v = bot - top; if (v > bv) { bv = v; best = +p.dataset.p; cy = ((top + bot) / 2 - r.top) / r.height; } });
      return { pi: best, cy: clamp(cy, .1, .9) };
    };
    const addAsset = (asset, wPt) => {
      s.assets[asset.id] = asset; const { pi, cy } = visiblePage(), d = s.dims[pi];
      const w = Math.min(.9, wPt / d.VW), ar = asset.h / asset.w, hf = w * ar * d.VW / d.VH;
      const it = { id: uid(), page: pi, asset: asset.id, ar, w, x: (1 - w) / 2, y: clamp(cy - hf / 2, 0, 1 - hf) };
      s.items.push(it); s.sel = it.id; paintItems(pi); paintSide();
    };
    ui.opts.onclick = async e => {
      const rm = e.target.closest('[data-rmsig]'); if (rm) { e.stopPropagation(); SIGS = SIGS.filter(x => x.id !== rm.dataset.rmsig); saveSigs(); return paintSide(); }
      const sg = e.target.closest('[data-sig]'); if (sg) { const g = SIGS.find(x => x.id === sg.dataset.sig); return addAsset({ ...g, id: uid() }, Math.min(180, s.dims[0].VW * .3)); }
      if (e.target.closest('[data-newsig]')) { const g = await signatureDialog(); if (g) { paintSide(); addAsset({ ...g, id: uid() }, Math.min(180, s.dims[0].VW * .3)); } return; }
      const ad = e.target.closest('[data-add]')?.dataset.add; if (!ad) return;
      if (ad === 'date') { const a = textAsset(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), 12, '#111827'); return addAsset(a, a.ptW); }
      const r = await modal({
        title: ad === 'initial' ? 'Tambah inisial' : 'Tambah teks', body: `<div class="opt"><input class="inp" id="tx" maxlength="120" placeholder="${ad === 'initial' ? 'mis. AB' : 'Tulis teks…'}"></div><div class="opt" style="margin-top:12px"><span class="lbl">Ukuran</span><div class="seg" id="tsz">${[10, 12, 14, 18, 24].map(v => `<button type="button" data-v="${v}" class="${v === 12 ? 'on' : ''}">${v} pt</button>`).join('')}</div></div>`,
        onOpen: bg => { $('#tsz', bg).onclick = e => { const b = e.target.closest('[data-v]'); if (b) $$('#tsz button', bg).forEach(x => x.classList.toggle('on', x === b)); }; },
        actions: [{ label: 'Batal', result: null }, { label: 'Tambahkan', primary: true, value: bg => { const v = $('#tx', bg).value.trim(); return v ? { v, size: +$('#tsz .on', bg).dataset.v } : false; } }]
      });
      if (r) { const a = textAsset(r.v, r.size, '#111827', ad === 'initial' ? 700 : 500); addAsset(a, a.ptW); }
    };
    ui.opts.oninput = e => { if (e.target.dataset.k === 'name') s.opts.name = e.target.value; };
    // interaksi objek: pindah / ubah ukuran / hapus
    viewer.onpointerdown = e => {
      const node = e.target.closest('.item');
      if (!node) { if (s.sel) { s.sel = null; paintAll(); } return; }
      const it = s.items.find(x => x.id === node.dataset.it); e.preventDefault();
      if (e.target.closest('[data-del]')) { s.items = s.items.filter(x => x !== it); s.sel = null; paintItems(it.page); return paintSide(); }
      if (s.sel !== it.id) { s.sel = it.id; $$('.item.sel', viewer).forEach(x => x.classList.remove('sel')); node.classList.add('sel'); }
      const r = node.parentElement.getBoundingClientRect(), d = s.dims[it.page], k = it.ar * d.VW / d.VH, mode = e.target.closest('[data-rs]') ? 'rs' : 'mv';
      const sx = e.clientX, sy = e.clientY, o = { ...it }; node.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
        if (mode === 'mv') { it.x = clamp(o.x + dx, 0, 1 - it.w); it.y = clamp(o.y + dy, 0, 1 - it.w * k); }
        else { it.w = clamp(o.w + dx, .03, Math.min(1 - it.x, (1 - it.y) / k)); }
        Object.assign(node.style, { left: it.x * 100 + '%', top: it.y * 100 + '%', width: it.w * 100 + '%', height: it.w * k * 100 + '%' });
      };
      const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); };
      node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
    };
    SignEngine.del = () => { if (!s.sel) return; const it = s.items.find(x => x.id === s.sel); s.items = s.items.filter(x => x !== it); s.sel = null; paintItems(it.page); paintSide(); };
    // halaman (render saat terlihat)
    const W = Math.max(280, Math.min(820, ui.body.clientWidth - 48)), dpr = Math.min(2, devicePixelRatio || 1);
    const io = new IntersectionObserver(es => es.forEach(async e => {
      if (!e.isIntersecting) return; io.unobserve(e.target); const pi = +e.target.dataset.p;
      const c = await renderPage(await s.file.doc.getPage(pi + 1), { width: W * dpr }); e.target.prepend(c);
    }), { root: viewer, rootMargin: '600px' });
    (async () => {
      for (let i = 0; i < s.file.pages; i++) {
        if (!s.dims[i]) { const vp = (await s.file.doc.getPage(i + 1)).getViewport({ scale: 1 }); s.dims[i] = { VW: vp.width, VH: vp.height }; }
        if (!viewer.isConnected) return;
        const d = s.dims[i], p = el(`<div class="vpage" data-p="${i}" style="width:${W}px;height:${W * d.VH / d.VW}px"><span class="vlabel">Halaman ${i + 1}</span><div class="layer"></div></div>`);
        viewer.append(p); io.observe(p); paintItems(i);
        if (i === 0) paintSide();
      }
    })();
    paintSide();
    ui.run.onclick = () => runJob(t, s, async prog => {
      const { degrees } = await lib('pdflib'); prog(.2, 'Menempelkan tanda tangan…');
      const doc = await loadForEdit(s.file.bytes), cache = {};
      for (const it of s.items) {
        const a = s.assets[it.asset], img = cache[it.asset] ||= await doc.embedPng(a.url);
        const pg = doc.getPage(it.page), g = pageGeom(pg), w = it.w * g.VW, h = w * it.ar, p = g.place(it.x * g.VW, it.y * g.VH, w, h);
        pg.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.rotate) });
      }
      prog(.8, 'Menyimpan…');
      return [{ name: cleanName(s.opts.name, baseName(s.file.name) + '-ttd') + '.pdf', blob: await savePdf(doc) }];
    });
  },
  key(e, s) { if ((e.key === 'Delete' || e.key === 'Backspace') && s.sel) { e.preventDefault(); SignEngine.del?.(); } }
};

/* ===================== CROP ===================== */
const CropEngine = {
  init: () => ({ file: null, pi: 0, rect: { x: .06, y: .06, w: .88, h: .88 } }),
  reset(s) { s.file?.doc?.destroy(); Object.assign(s, CropEngine.init()); },
  add: (s, files, t) => singlePdfAdd(s, files, t, CropEngine.reset),
  work(root, s, t) {
    const ui = s.ui = wsLayout(root, t, { sideTitle: 'Area crop', sub: 'Tarik kotak atau sudutnya di pratinjau.' });
    ui.bar.innerHTML = `<div class="info"></div><button class="tbtn outline" data-a="auto">${ic('scan')}Deteksi otomatis</button><button class="tbtn" data-a="reset">${ic('refresh')}Reset</button><button class="tbtn" data-a="add">Ganti file</button>`;
    if (!s.file) return loadingBody(ui);
    $('.info', ui.bar).innerHTML = `${esc(s.file.name)} <span>· ${s.file.pages} halaman</span>`;
    ui.body.innerHTML = `<div class="crop-wrap"><div class="crop-stage"><canvas></canvas><div class="crop-rect">${['nw', 'ne', 'sw', 'se'].map(h => `<i data-h="${h}"></i>`).join('')}</div></div></div><div class="pager"><button class="tbtn outline" data-pg="-1">${ic('chevl')}</button><span></span><button class="tbtn outline" data-pg="1">${ic('chev')}</button></div>`;
    const stage = $('.crop-stage', ui.body), cv = $('canvas', stage), box = $('.crop-rect', stage);
    const sch = [{ type: 'seg', k: 'scope', label: 'Terapkan ke', options: [['all', 'Semua halaman'], ['current', 'Halaman ini']] },
    { type: 'custom', id: 'read', html: () => { const r = s.rect, d = s.dim; if (!d) return ''; const mm = v => Math.round(v * 25.4 / 72); return `<span class="lbl">Ukuran hasil</span><div class="note">${ic('crop')}<span>${mm(r.w * d.VW)} × ${mm(r.h * d.VH)} mm<br>Potong: atas ${Math.round(r.y * 100)}% · bawah ${Math.round((1 - r.y - r.h) * 100)}% · kiri ${Math.round(r.x * 100)}% · kanan ${Math.round((1 - r.x - r.w) * 100)}%</span></div>`; } },
    nameOpt('-crop')];
    const paintOpts = mountOpts(ui.opts, sch, s.opts, s);
    const paintRect = () => { const r = s.rect; Object.assign(box.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }); };
    const show = async () => {
      $('.pager span', ui.body).textContent = `Halaman ${s.pi + 1} dari ${s.file.pages}`;
      const page = await s.file.doc.getPage(s.pi + 1), vp = page.getViewport({ scale: 1 });
      s.dim = { VW: vp.width, VH: vp.height };
      const k = Math.min((ui.body.clientWidth - 60) / vp.width, (innerHeight * .66) / vp.height);
      stage.style.width = vp.width * k + 'px'; stage.style.height = vp.height * k + 'px';
      const c = await renderPage(page, { scale: k * Math.min(2, devicePixelRatio || 1) });
      cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); paintRect(); paintOpts();
    };
    stage.onpointerdown = e => {
      e.preventDefault(); const R = stage.getBoundingClientRect(), fx = (e.clientX - R.left) / R.width, fy = (e.clientY - R.top) / R.height;
      const h = e.target.dataset.h, inRect = e.target === box, o = { ...s.rect }, MIN = .04;
      stage.setPointerCapture(e.pointerId);
      const move = ev => {
        const x = clamp((ev.clientX - R.left) / R.width, 0, 1), y = clamp((ev.clientY - R.top) / R.height, 0, 1), r = s.rect;
        if (h) {
          let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
          if (h.includes('w')) x0 = Math.min(x, x1 - MIN); if (h.includes('e')) x1 = Math.max(x, x0 + MIN);
          if (h.includes('n')) y0 = Math.min(y, y1 - MIN); if (h.includes('s')) y1 = Math.max(y, y0 + MIN);
          Object.assign(r, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        } else if (inRect) { r.x = clamp(o.x + x - fx, 0, 1 - o.w); r.y = clamp(o.y + y - fy, 0, 1 - o.h); }
        else Object.assign(r, { x: Math.min(fx, x), y: Math.min(fy, y), w: Math.max(MIN, Math.abs(x - fx)), h: Math.max(MIN, Math.abs(y - fy)) });
        paintRect();
      };
      const up = () => { stage.onpointermove = null; stage.onpointerup = null; paintOpts(); };
      stage.onpointermove = move; stage.onpointerup = up;
    };
    ui.body.onclick = e => { const d = +e.target.closest('[data-pg]')?.dataset.pg; if (d) { s.pi = clamp(s.pi + d, 0, s.file.pages - 1); show(); } };
    ui.bar.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'add') pickFiles(t);
      if (a === 'reset') { s.rect = { x: 0, y: 0, w: 1, h: 1 }; paintRect(); paintOpts(); }
      if (a === 'auto') {
        const g = cv.getContext('2d', { willReadFrequently: true }), { data, width: w, height: h } = g.getImageData(0, 0, cv.width, cv.height);
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4; if (data[i] < 232 || data[i + 1] < 232 || data[i + 2] < 232) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 < 0) return toast('Halaman ini kosong — tidak ada yang bisa dideteksi.');
        const p = .015; s.rect = { x: Math.max(0, x0 / w - p), y: Math.max(0, y0 / h - p) }; s.rect.w = Math.min(1, x1 / w + p) - s.rect.x; s.rect.h = Math.min(1, y1 / h + p) - s.rect.y;
        paintRect(); paintOpts(); toast('Area konten terdeteksi.', 'ok');
      }
    };
    show();
    ui.run.onclick = () => runJob(t, s, async prog => {
      prog(.2, 'Memotong halaman…'); const doc = await loadForEdit(s.file.bytes), r = s.rect;
      const pages = s.opts.scope === 'current' ? [doc.getPage(s.pi)] : doc.getPages();
      for (const pg of pages) {
        const g = pageGeom(pg), [ax, ay] = g.map(r.x * g.VW, r.y * g.VH), [bx, by] = g.map((r.x + r.w) * g.VW, (r.y + r.h) * g.VH);
        pg.setCropBox(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      }
      prog(.8, 'Menyimpan…');
      return [{ name: cleanName(s.opts.name, baseName(s.file.name) + '-crop') + '.pdf', blob: await savePdf(doc) }];
    });
  }
};

/* ===================== STUDIO GAMBAR ===================== */
/* Hapus latar AI: @imgly/background-removal dibundel lokal (vendor/bg-removal.src.js) dan dijalankan di Web Worker
   dari Blob — aman untuk file:// dan tidak membekukan UI. Model diunduh dari staticimgly.com lalu di-cache browser. */
let bgWorker = null, bgSeq = 0;
async function aiRemoveBackground(blob, model = 'medium', onProgress) {
  if (!bgWorker) {
    if (!window.BG_WORKER_SRC) { try { await loadScript(VENDOR + 'bg-removal.src.js'); } catch { throw Error('File vendor/bg-removal.src.js tidak ditemukan.'); } }
    bgWorker = new Worker(URL.createObjectURL(new Blob([window.BG_WORKER_SRC], { type: 'text/javascript' })));
  }
  const id = ++bgSeq;
  return new Promise((resolve, reject) => {
    const onMsg = e => {
      const d = e.data; if (d.id !== id) return;
      if (d.type === 'progress') return onProgress?.(d.k, d.c, d.t);
      bgWorker.removeEventListener('message', onMsg);
      d.type === 'done' ? resolve(d.blob) : reject(Error(d.message));
    };
    bgWorker.addEventListener('message', onMsg);
    bgWorker.onerror = e => { bgWorker.removeEventListener('message', onMsg); bgWorker = null; reject(Error(e.message || 'Worker AI gagal dijalankan.')); };
    bgWorker.postMessage({ id, blob, model, publicPath: window.RAPIPDF_AI_PATH || 'https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/' });
  });
}
const STUDIO_BG = ['transparent', '#ffffff', '#f3f4f6', '#111827', '#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'];
const StudioEngine = {
  init: () => ({ file: null, img: null, cutout: null, seeds: [], picking: false, masked: null, orig: null, bgImg: null, compare: false }),
  reset(s) { Object.assign(s, StudioEngine.init()); s.opts = { bg: 'transparent', bgColor: '#a78bfa', bright: 100, contrast: 100, sat: 100, ct: 0, cb: 0, cl: 0, cr: 0, outW: '', fmt: 'png', q: 90, tol: 30, name: '', aiModel: 'medium' }; },
  async add(s, files) {
    StudioEngine.reset(s); const f = files[0];
    try { s.img = await decodeImage(f); s.file = f; } catch { toast('Gambar tidak dapat dibaca.', 'err'); s.stage = 'upload'; }
    rerender();
  },
  masked(s) {
    if (s.masked) return s.masked;
    const W = s.img.naturalWidth, H = s.img.naturalHeight, c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(s.cutout || s.img, 0, 0, W, H);
    if (s.seeds.length) {
      if (!s.orig) { const t = canvas(W, H), tg = t.getContext('2d', { willReadFrequently: true }); tg.drawImage(s.img, 0, 0); s.orig = tg.getImageData(0, 0, W, H).data; }
      const id = g.getImageData(0, 0, W, H), d = id.data, o = s.orig, tol2 = s.opts.tol ** 2, vis = new Uint8Array(W * H), stack = new Int32Array(W * H);
      for (const sd of s.seeds) {
        vis.fill(0); const si = sd.y * W + sd.x, r = o[si * 4], gg = o[si * 4 + 1], b = o[si * 4 + 2]; let n = 0; stack[n++] = si; vis[si] = 1;
        while (n) {
          const i = stack[--n], p = i * 4, dr = o[p] - r, dg = o[p + 1] - gg, db = o[p + 2] - b;
          if (dr * dr + dg * dg + db * db > tol2) continue;
          d[p + 3] = 0; const x = i % W;
          if (x > 0 && !vis[i - 1]) { vis[i - 1] = 1; stack[n++] = i - 1; } if (x < W - 1 && !vis[i + 1]) { vis[i + 1] = 1; stack[n++] = i + 1; }
          if (i >= W && !vis[i - W]) { vis[i - W] = 1; stack[n++] = i - W; } if (i < W * (H - 1) && !vis[i + W]) { vis[i + W] = 1; stack[n++] = i + W; }
        }
      }
      g.putImageData(id, 0, 0);
    }
    return s.masked = c;
  },
  compose(s, maxSide, forExport) {
    const o = s.opts, W = s.img.naturalWidth, H = s.img.naturalHeight;
    const sx = W * o.cl / 100, sy = H * o.ct / 100, cw = Math.max(1, W * (1 - (o.cl + o.cr) / 100)), ch = Math.max(1, H * (1 - (o.ct + o.cb) / 100));
    const ow = +o.outW > 0 ? Math.min(+o.outW, 12000) : cw, oh = ch * ow / cw, k = Math.min(1, maxSide / Math.max(ow, oh));
    const c = canvas(ow * k, oh * k), g = c.getContext('2d');
    if (s.compare) { g.drawImage(s.img, sx, sy, cw, ch, 0, 0, c.width, c.height); return c; }
    if (o.bg === 'image' && s.bgImg) { const b = s.bgImg, sc = Math.max(c.width / b.naturalWidth, c.height / b.naturalHeight); g.drawImage(b, (c.width - b.naturalWidth * sc) / 2, (c.height - b.naturalHeight * sc) / 2, b.naturalWidth * sc, b.naturalHeight * sc); }
    else if (o.bg !== 'transparent' && o.bg !== 'image') { g.fillStyle = o.bg === 'custom' ? o.bgColor : o.bg; g.fillRect(0, 0, c.width, c.height); }
    else if (forExport && o.fmt === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    g.filter = `brightness(${o.bright}%) contrast(${o.contrast}%) saturate(${o.sat}%)`;
    g.drawImage(StudioEngine.masked(s), sx, sy, cw, ch, 0, 0, c.width, c.height); g.filter = 'none';
    return c;
  },
  work(root, s, t) {
    const ui = s.ui = wsLayout(root, t, { sideTitle: 'Edit gambar' });
    if (!s.img) return loadingBody(ui);
    ui.bar.innerHTML = `<div class="info">${esc(s.file.name)} <span>· ${s.img.naturalWidth}×${s.img.naturalHeight}px</span></div>
      <button class="tbtn outline" data-a="ai">${ic('wand')}Hapus latar (AI)</button>
      <button class="tbtn ${s.picking ? 'outline' : ''}" data-a="pick" style="${s.picking ? 'color:var(--tc);border-color:var(--tc)' : ''}">${ic('drop')}Klik hapus warna</button>
      <button class="tbtn" data-a="undo" ${s.seeds.length ? '' : 'disabled'} title="Batalkan klik terakhir">${ic('undo')}</button>
      <button class="tbtn" data-a="cmp" title="Tahan untuk melihat aslinya">${ic('eye')}Bandingkan</button>
      <button class="tbtn" data-a="reset">${ic('refresh')}</button><button class="tbtn" data-a="add">Ganti</button>`;
    ui.body.innerHTML = `<div class="studio-canvas ${s.picking ? 'pick' : ''}"><canvas class="checker"></canvas><span class="studio-tag ${s.compare ? '' : 'hidden'}">Asli</span></div>`;
    ui.hint.classList.toggle('hidden', !s.picking); ui.hint.innerHTML = `<span>Mode hapus warna aktif: klik area latar pada gambar. Atur toleransi di panel kanan.</span>`;
    const cv = $('canvas', ui.body); let raf;
    const paint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const c = StudioEngine.compose(s, 1600); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); $('.studio-tag', ui.body).classList.toggle('hidden', !s.compare); }); };
    const sch = [
      { type: 'title', text: 'Latar belakang' },
      {
        type: 'custom', id: 'bg', html: o => `<div class="swatches">${STUDIO_BG.map(c => `<button type="button" data-bg="${c}" class="${o.bg === c ? 'on' : ''} ${c === 'transparent' ? 'checker' : ''}" style="${c === 'transparent' ? '' : `background:${c}`}" title="${c === 'transparent' ? 'Transparan' : c}"></button>`).join('')}<input type="color" data-bgc value="${o.bgColor}" title="Warna lain" style="${o.bg === 'custom' ? 'box-shadow:0 0 0 2px var(--tc)' : ''}"></div>
          <button type="button" class="tbtn outline" data-bgimg style="margin-top:8px;${o.bg === 'image' ? 'color:var(--tc);border-color:var(--tc)' : ''}">${ic('image')}${s.bgImg ? 'Ganti foto latar' : 'Pakai foto sebagai latar'}</button>`,
        bind: (box, o, s, repaint) => {
          box.onclick = async e => {
            const b = e.target.closest('[data-bg]'); if (b) { o.bg = b.dataset.bg; repaint(); }
            if (e.target.closest('[data-bgimg]')) { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' }); inp.onchange = async () => { if (!inp.files[0]) return; s.bgImg = await decodeImage(inp.files[0]); o.bg = 'image'; repaint(); }; inp.click(); }
          };
          $('[data-bgc]', box).oninput = e => { o.bgColor = e.target.value; o.bg = 'custom'; paint(); };
          $('[data-bgc]', box).onchange = () => repaint();
        }
      },
      { type: 'note', text: 'Ganti latar paling bagus setelah latar asli dihapus — pakai tombol "Hapus latar (AI)" di atas.', when: (o, s) => !s.cutout && !s.seeds.length },
      { type: 'seg', k: 'aiModel', label: 'Model AI hapus latar', options: [['small', 'Cepat · 44 MB'], ['medium', 'Akurat · 88 MB']], help: 'Diunduh sekali, lalu tersimpan di cache browser.' },
      { type: 'range', k: 'tol', label: 'Toleransi hapus warna', min: 2, max: 120, when: (o, s) => s.seeds.length > 0 },
      { type: 'title', text: 'Penyesuaian' },
      { type: 'range', k: 'bright', label: 'Kecerahan', min: 40, max: 160, fmt: v => v + '%' },
      { type: 'range', k: 'contrast', label: 'Kontras', min: 40, max: 160, fmt: v => v + '%' },
      { type: 'range', k: 'sat', label: 'Saturasi', min: 0, max: 200, fmt: v => v + '%' },
      { type: 'title', text: 'Potong tepi' },
      { type: 'range', k: 'ct', label: 'Atas', min: 0, max: 45, fmt: v => v + '%' }, { type: 'range', k: 'cb', label: 'Bawah', min: 0, max: 45, fmt: v => v + '%' },
      { type: 'range', k: 'cl', label: 'Kiri', min: 0, max: 45, fmt: v => v + '%' }, { type: 'range', k: 'cr', label: 'Kanan', min: 0, max: 45, fmt: v => v + '%' },
      { type: 'title', text: 'Ekspor' },
      { type: 'number', k: 'outW', label: 'Lebar hasil (px)', min: 16, ph: 'Asli', help: 'Kosongkan untuk ukuran asli. Tinggi menyesuaikan.' },
      { type: 'seg', k: 'fmt', label: 'Format', options: [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WEBP']] },
      { type: 'note', tone: 'warn', text: 'JPG tidak mendukung transparansi — latar transparan akan menjadi putih.', when: o => o.fmt === 'jpg' && o.bg === 'transparent' && (s.cutout || s.seeds.length) },
      { type: 'range', k: 'q', label: 'Kualitas', min: 40, max: 100, fmt: v => v + '%', when: o => o.fmt !== 'png' },
      nameOpt('-edit', '.' + (s.opts.fmt === 'jpg' ? 'jpg' : s.opts.fmt)),
    ];
    mountOpts(ui.opts, sch, s.opts, s, k => { if (k === 'tol') s.masked = null; if (k === 'fmt') return StudioEngine.work(root, s, t); paint(); });
    cv.onclick = e => {
      if (!s.picking) return; const o = s.opts, W = s.img.naturalWidth, H = s.img.naturalHeight;
      const fx = e.offsetX / cv.clientWidth, fy = e.offsetY / cv.clientHeight;
      const x = Math.floor(W * o.cl / 100 + fx * W * (1 - (o.cl + o.cr) / 100)), y = Math.floor(H * o.ct / 100 + fy * H * (1 - (o.ct + o.cb) / 100));
      s.seeds.push({ x: clamp(x, 0, W - 1), y: clamp(y, 0, H - 1) }); s.masked = null; StudioEngine.work(root, s, t);
    };
    const cmp = $('[data-a="cmp"]', ui.bar);
    cmp.onpointerdown = () => { s.compare = true; paint(); }; cmp.onpointerup = cmp.onpointerleave = () => { if (s.compare) { s.compare = false; paint(); } };
    ui.bar.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'add') pickFiles(t);
      if (a === 'pick') { s.picking = !s.picking; StudioEngine.work(root, s, t); }
      if (a === 'undo') { s.seeds.pop(); s.masked = null; StudioEngine.work(root, s, t); }
      if (a === 'reset') { const f = s.file, img = s.img; StudioEngine.reset(s); s.file = f; s.img = img; StudioEngine.work(root, s, t); }
      if (a === 'ai') {
        const mb = s.opts.aiModel === 'small' ? 44 : 88;
        const b = busyOverlay('Menghapus latar dengan AI', `Menyiapkan model AI… Pemakaian pertama mengunduh ±${mb + 10} MB (butuh internet), selanjutnya diambil dari cache browser.`);
        try {
          // kirim PNG hasil decode (orientasi benar, format apa pun didukung)
          const src = canvas(s.img.naturalWidth, s.img.naturalHeight); src.getContext('2d').drawImage(s.img, 0, 0);
          const blob = await aiRemoveBackground(await toBlob(src, 'image/png'), s.opts.aiModel, (k, c, n) => {
            if (b.cancelled) return;
            if (/^fetch/i.test(k)) b.set(n ? c / n * .9 : 0, `Mengunduh ${/model/.test(k) ? 'model AI' : 'mesin AI'}… ${n ? Math.round(c / n * 100) : 0}%`);
            else b.set(.95, 'Memisahkan objek dari latar…');
          });
          if (b.cancelled) return;
          s.cutout = await decodeImage(blob); s.masked = null; s.seeds = []; s.picking = false;
          toast('Latar berhasil dihapus. Pilih latar baru atau simpan sebagai PNG transparan.', 'ok');
          StudioEngine.work(root, s, t);
        } catch (err) {
          console.error(err);
          const msg = String(err?.message || err);
          const net = /fetch|network|load|resource metadata|Failed to/i.test(msg) && !navigator.onLine;
          toast(net ? 'Perangkat sedang offline — model AI perlu diunduh sekali saat online.' : `AI gagal: ${msg.split('\n')[0].slice(0, 160)}`, 'err', { label: 'Pakai klik hapus warna', run: () => { s.picking = true; StudioEngine.work(root, s, t); } });
        } finally { b.close(); }
      }
    };
    paint();
    ui.run.onclick = () => runJob(t, s, async prog => {
      prog(.3, 'Merender gambar resolusi penuh…'); await frame();
      const c = StudioEngine.compose(s, 12000, true), o = s.opts, type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[o.fmt];
      const blob = await toBlob(c, type, o.fmt === 'png' ? undefined : o.q / 100);
      return [{ name: cleanName(o.name, baseName(s.file.name) + '-edit') + '.' + o.fmt, blob, dims: `${c.width}×${c.height}px` }];
    });
  }
};
T.sign.engine = SignEngine; T.crop.engine = CropEngine; T.studio.engine = StudioEngine;
T.studio.init = s => StudioEngine.reset(s);
