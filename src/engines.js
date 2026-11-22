/* =========================================================
   ENGINES — tata letak workspace & interaksi
   ========================================================= */
function wsLayout(root, t, { sideTitle = 'Pengaturan', sub = '' } = {}) {
  root.innerHTML = `<div class="ws"><section class="panel ws-main"><div class="bar"></div><div class="ws-body"></div><div class="hint-line hidden"></div></section>
    <aside class="panel side"><h3>${esc(sideTitle)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}<div class="opts" style="display:grid;gap:18px"></div>
    <div class="side-foot"><button class="btn btn-main big" data-run>${ic(t.icon)}<span>${esc(t.action)}</span></button><div class="side-note"></div></div></aside></div>`;
  return { bar: $('.bar', root), body: $('.ws-body', root), hint: $('.hint-line', root), side: $('.side', root), opts: $('.opts', root), run: $('[data-run]', root), note: $('.side-note', root) };
}

/* ---------- renderer opsi deklaratif ---------- */
function optField(f, o, s) {
  const v = o[f.k], lab = f.label ? `<label${f.k ? ` for="o-${f.k}"` : ''}>${f.label}${f.type === 'range' ? `<output data-for="${f.k}">${esc(f.fmt ? f.fmt(v) : v)}</output>` : ''}</label>` : '';
  const help = f.help ? `<small>${typeof f.help === 'function' ? f.help(o, s) : f.help}</small>` : '';
  switch (f.type) {
    case 'name': return `<div class="opt">${f.label ? `<label for="o-${f.k}">${f.label}</label>` : '<label>Nama file hasil</label>'}<div class="inp-suffix"><input class="inp" id="o-${f.k}" data-k="${f.k}" value="${esc(v || '')}" placeholder="${esc(f.ph?.(o, s) || '')}" maxlength="120" spellcheck="false"><span>${f.suffix || '.pdf'}</span></div>${help}</div>`;
    case 'text': case 'password': case 'number':
      return `<div class="opt">${lab}<input class="inp" id="o-${f.k}" data-k="${f.k}" type="${f.type}" value="${esc(v ?? '')}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}>${f.extra?.(o) || ''}${help}</div>`;
    case 'textarea': return `<div class="opt">${lab}<textarea class="inp" rows="${f.rows || 3}" id="o-${f.k}" data-k="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v || '')}</textarea>${help}</div>`;
    case 'seg': return `<div class="opt"><span class="lbl">${f.label}</span><div class="seg">${f.options.map(([val, txt]) => `<button type="button" data-k="${f.k}" data-v="${val}" class="${String(v) === String(val) ? 'on' : ''}">${txt}</button>`).join('')}</div>${help}</div>`;
    case 'radio': return `<div class="opt">${f.label ? `<span class="lbl">${f.label}</span>` : ''}<div class="rcards">${f.options.filter(x => !x.when || x.when(o, s)).map(x => `<button type="button" class="rcard ${String(v) === String(x.v) ? 'on' : ''}" data-k="${f.k}" data-v="${x.v}"><span class="dot"></span><span style="text-align:left">${x.tag ? `<span class="tag">${x.tag}</span>` : ''}<b>${x.t}</b><small>${x.d}</small></span></button>`).join('')}</div>${help}</div>`;
    case 'range': return `<div class="opt">${lab}<input type="range" id="o-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v}">${help}</div>`;
    case 'toggle': return `<label class="tog"><span><b>${f.label}</b>${f.help ? `<small>${f.help}</small>` : ''}</span><span class="sw"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}><i></i></span></label>`;
    case 'color': return `<div class="opt"><span class="lbl">${f.label}</span><div class="swatches">${(f.presets || []).map(c => `<button type="button" data-k="${f.k}" data-v="${c}" class="${v === c ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" data-k="${f.k}" value="${v}" aria-label="Warna lain"></div></div>`;
    case 'select': return `<div class="opt">${lab}<select class="inp" id="o-${f.k}" data-k="${f.k}">${f.options.map(([val, txt]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${txt}</option>`).join('')}</select>${help}</div>`;
    case 'pos': return `<div class="opt"><span class="lbl">${f.label}</span><div class="posgrid">${['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].map(p => `<button type="button" data-k="${f.k}" data-v="${p}" class="${v === p ? 'on' : ''}" ${f.allowed && !f.allowed.includes(p) ? 'disabled' : ''} aria-label="${p}"></button>`).join('')}</div></div>`;
    case 'file': return `<div class="opt">${lab}<input class="inp" style="padding-top:8px" type="file" data-k="${f.k}" accept="${f.accept || ''}">${v ? `<small>Terpilih: ${esc(v.name)}</small>` : help}</div>`;
    case 'note': return `<div class="note ${f.tone || ''}">${ic(f.tone === 'warn' ? 'alert' : 'info')}<span>${typeof f.text === 'function' ? f.text(o, s) : f.text}</span></div>`;
    case 'title': return `<div class="sec-title">${f.text}</div>`;
    case 'custom': return `<div class="opt" data-custom="${f.id}">${f.html(o, s)}</div>`;
  }
  return '';
}
function mountOpts(box, schema, o, s, onChange = () => { }) {
  const find = k => schema.find(x => x.k === k);
  const paint = () => {
    box.innerHTML = schema.filter(f => !f.when || f.when(o, s)).map(f => optField(f, o, s)).join('');
    schema.forEach(f => f.type === 'custom' && f.bind && box.querySelector(`[data-custom="${f.id}"]`) && f.bind(box.querySelector(`[data-custom="${f.id}"]`), o, s, () => { paint(); onChange(f.id, true); }));
  };
  box.oninput = e => {
    const k = e.target.dataset.k, f = find(k); if (!k || !f) return;
    if (e.target.type === 'checkbox' || e.target.type === 'file' || e.target.tagName === 'SELECT') return;
    o[k] = (f.type === 'range' || f.type === 'number') ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
    const out = box.querySelector(`output[data-for="${k}"]`); if (out) out.textContent = f.fmt ? f.fmt(o[k]) : o[k];
    f.live?.(box, o); onChange(k, false);
  };
  box.onchange = e => {
    const k = e.target.dataset.k, f = find(k); if (!k || !f) return;
    if (e.target.type === 'checkbox') o[k] = e.target.checked;
    else if (e.target.type === 'file') o[k] = e.target.files[0] || null;
    else if (e.target.tagName === 'SELECT') o[k] = e.target.value;
    else if (e.target.type === 'color') { o[k] = e.target.value; }
    else return;
    paint(); onChange(k, true);
  };
  box.onclick = e => {
    const b = e.target.closest('button[data-k][data-v]'); if (!b) return;
    const f = find(b.dataset.k); o[b.dataset.k] = f?.num ? +b.dataset.v : b.dataset.v;
    paint(); onChange(b.dataset.k, true);
  };
  paint(); return paint;
}

/* ===================== PAGES ENGINE =====================
   Merge, atur halaman, putar, gambar→PDF, Office→PDF */
const PagesEngine = {
  init: () => ({ sources: [], pages: [], sel: new Set(), anchor: -1 }),
  reset(s) { s.pages.forEach(p => p.thumb && URL.revokeObjectURL(p.thumb)); s.sources.forEach(x => x.doc?.destroy()); Object.assign(s, PagesEngine.init()); },
  async add(s, files, t) {
    for (const file of files) {
      const src = { id: uid(), name: file.name, count: 0, loading: true, step: 'Membaca…' };
      s.sources.push(src); PagesEngine.paint(s, t);
      try {
        if (isPdf(file)) {
          const { bytes, doc } = await readPdfFile(file);
          Object.assign(src, { kind: 'pdf', bytes, doc, count: doc.numPages });
          for (let i = 0; i < doc.numPages; i++) s.pages.push({ id: uid(), src: src.id, kind: 'pdf', index: i, rot: 0, label: file.name, thumb: null });
        } else if (isImage(file)) {
          const n = await normalizeImage(file);
          const thumb = await thumbFrom(n.img); delete n.img;
          s.pages.push({ id: uid(), src: src.id, kind: 'image', img: n, rot: 0, label: file.name, thumb });
          src.count = 1;
        } else {
          const list = await officeToPages(file, step => { src.step = step; PagesEngine.paintSources(s); });
          for (const [i, p] of list.entries()) {
            const thumb = await thumbFrom(p.thumbSrc, 300); delete p.thumbSrc;
            s.pages.push({ id: uid(), src: src.id, kind: 'image', img: p, rot: 0, label: list.length > 1 ? `${file.name} · ${i + 1}` : file.name, thumb });
          }
          src.count = list.length;
        }
        src.loading = false;
      } catch (e) {
        s.sources = s.sources.filter(x => x !== src);
        if (!e.skipped) toast(`${file.name}: ${e.message || 'gagal dibuka'}`, 'err', isPdf(file) && /terenkripsi/i.test(e.message) ? { label: 'Buka Unlock PDF', run: () => openWith('unlock', [file]) } : null);
      }
      PagesEngine.paint(s, t);
    }
    if (!s.pages.length && !s.sources.length) { s.stage = 'upload'; rerender(); }
  },
  work(root, s, t) {
    const ui = s.ui = wsLayout(root, t, { sideTitle: t.sideTitle || 'Pengaturan', sub: t.sideSub || '' });
    ui.bar.innerHTML = `<div class="info"></div>
      <button class="tbtn outline" data-a="add">${ic('plus')}Tambah file</button>
      <button class="tbtn" data-a="selall" title="Pilih semua (Ctrl+A)">${ic('select')}<span>Pilih semua</span></button>
      <button class="tbtn" data-a="rotl" title="Putar kiri (Shift+R)">${ic('rotl')}</button>
      <button class="tbtn" data-a="rotr" title="Putar kanan (R)">${ic('rotate')}</button>
      <button class="tbtn" data-a="sort" title="Urutkan nama file A–Z">${ic('sortaz')}</button>
      <button class="tbtn danger" data-a="del" title="Hapus halaman terpilih (Delete)">${ic('trash')}</button>
      <button class="tbtn danger" data-a="clear">Bersihkan</button>`;
    ui.body.innerHTML = `<div class="sources"></div><div class="pages"></div>`;
    ui.hint.classList.remove('hidden');
    ui.hint.innerHTML = `<span>Seret kartu untuk mengurutkan</span><span><kbd>Ctrl</kbd>/<kbd>⌘</kbd> klik: pilih beberapa</span><span><kbd>Shift</kbd> klik: pilih rentang</span><span><kbd>R</kbd> putar · <kbd>Del</kbd> hapus · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> geser</span>`;
    ui.grid = $('.pages', ui.body); ui.srcs = $('.sources', ui.body);
    ui.bar.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) PagesEngine.action(s, t, a); };
    ui.srcs.onclick = e => { const id = e.target.closest('[data-rm]')?.dataset.rm; if (!id) return; const src = s.sources.find(x => x.id === id); s.pages.filter(p => p.src === id).forEach(p => p.thumb && URL.revokeObjectURL(p.thumb)); s.pages = s.pages.filter(p => p.src !== id); src?.doc?.destroy(); s.sources = s.sources.filter(x => x.id !== id); PagesEngine.paint(s, t); };
    PagesEngine.bindGrid(s, t);
    mountOpts(ui.opts, t.opts || [], s.opts, s);
    if (t.sideButtons) { const b = el(`<div class="opt"><span class="lbl">Putar semua halaman</span><div class="seg"><button type="button" data-rall="-90">${ic('rotl')} Kiri</button><button type="button" data-rall="90">Kanan ${ic('rotate')}</button></div></div>`); ui.opts.prepend(b); b.onclick = e => { const d = +e.target.closest('[data-rall]')?.dataset.rall; if (d) { s.pages.forEach(p => p.rot = (p.rot + d + 360) % 360); PagesEngine.paint(s, t); } }; }
    ui.note.innerHTML = t.sideNote ? `<div class="note">${ic('info')}<span>${t.sideNote}</span></div>` : '';
    ui.run.onclick = () => {
      if (!s.pages.length) return toast('Tambahkan file terlebih dahulu.', 'err');
      if (s.sources.some(x => x.loading)) return toast('Tunggu sebentar, file masih dibaca…');
      runJob(t, s, prog => exportPages(s, t, prog));
    };
    PagesEngine.paint(s, t);
  },
  paintSources(s) {
    const ui = s.ui; if (!ui?.srcs?.isConnected) return;
    ui.srcs.innerHTML = s.sources.map(x => `<span class="src ${x.loading ? 'loading' : ''}">${x.loading ? '<i class="spin"></i>' : ic('file')}<b title="${esc(x.name)}">${esc(x.name)}</b><span>${x.loading ? esc(x.step) : `${x.count} hlm`}</span>${x.loading ? '' : `<button data-rm="${x.id}" title="Hapus file ini">${ic('x')}</button>`}</span>`).join('');
  },
  card(p) {
    const n = el(`<div class="pg" data-id="${p.id}" tabindex="0"><div class="pg-thumb">${p.thumb ? `<img src="${p.thumb}" alt="" draggable="false">` : `<div class="skel" data-lazy="${p.id}"></div>`}</div>
      <div class="pg-tools"><button data-p="rotl" title="Putar kiri">${ic('rotl')}</button><button data-p="rotr" title="Putar kanan">${ic('rotate')}</button><button data-p="del" class="del" title="Hapus halaman">${ic('trash')}</button></div>
      <div class="pg-meta"><span class="pg-num"></span><span class="pg-name"></span></div></div>`);
    $('.pg-name', n).textContent = p.label; $('.pg-name', n).title = p.label;
    return n;
  },
  setThumb(n, p) { const box = $('.pg-thumb', n); box.innerHTML = `<img src="${p.thumb}" alt="" draggable="false" style="transform:rotate(${p.rot}deg)">`; },
  paint(s, t) {
    const ui = s.ui; if (!ui?.grid?.isConnected) return;
    const n = s.pages.length, files = s.sources.length, grid = ui.grid;
    $('.info', ui.bar).innerHTML = `${n} halaman <span>· ${files} file${s.sel.size ? ` · ${s.sel.size} dipilih` : ''}</span>`;
    PagesEngine.paintSources(s);
    // render berkunci: kartu lama dipakai ulang (thumbnail tidak dimuat ulang, tidak berkedip)
    const seen = new Set();
    s.pages.forEach((p, i) => {
      let node = ui.nodes.get(p.id);
      if (!node) { node = PagesEngine.card(p); ui.nodes.set(p.id, node); const sk = $('.skel', node); if (sk) ui.io.observe(sk); }
      seen.add(p.id);
      node.classList.toggle('sel', s.sel.has(p.id));
      $('.pg-num', node).textContent = i + 1; node.setAttribute('aria-label', `Halaman ${i + 1}`);
      const img = $('img', node); if (img) img.style.transform = `rotate(${p.rot}deg)`;
      let badge = $('.pg-rot', node);
      if (p.rot && !badge) { badge = el('<span class="pg-rot"></span>'); node.append(badge); }
      if (badge) { if (p.rot) badge.textContent = p.rot + '°'; else badge.remove(); }
      if (grid.children[i] !== node) grid.insertBefore(node, grid.children[i] || ui.addTile);
    });
    for (const [id, node] of ui.nodes) if (!seen.has(id)) { node.remove(); ui.nodes.delete(id); }
    if (grid.lastElementChild !== ui.addTile) grid.append(ui.addTile);
    ui.run.disabled = !n;
  },
  bindGrid(s, t) {
    const ui = s.ui, grid = ui.grid;
    ui.nodes = new Map();
    ui.addTile = el(`<button class="add-tile" data-a="add" style="height:auto;min-height:150px;flex-direction:column">${ic('plus')}<span>Tambah file</span></button>`);
    grid.append(ui.addTile);
    // thumbnail lazy-render (satu per satu agar UI tetap responsif)
    const queue = [], busy = { v: false };
    ui.io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { ui.io.unobserve(e.target); queue.push(e.target.dataset.lazy); } pump(); }, { rootMargin: '400px' });
    const pump = async () => {
      if (busy.v) return; busy.v = true;
      while (queue.length) {
        const qid = queue.shift(), p = s.pages.find(x => x.id === qid); if (!p || p.thumb) continue;
        const src = s.sources.find(x => x.id === p.src); if (!src?.doc) continue;
        try { const page = await src.doc.getPage(p.index + 1); const c = await renderPage(page, { width: 300 * Math.min(2, devicePixelRatio || 1) / 1.4 }); p.thumb = URL.createObjectURL(await toBlob(c, 'image/jpeg', .82)); }
        catch (err) { console.warn('thumb', err); continue; }
        const node = ui.nodes.get(p.id); if (node) PagesEngine.setThumb(node, p);
      }
      busy.v = false;
    };
    grid.onclick = e => {
      if (ui.justDragged) return;
      if (e.target.closest('[data-a="add"]')) return PagesEngine.action(s, t, 'add');
      const card = e.target.closest('.pg');
      if (!card) { if (s.sel.size) { s.sel.clear(); PagesEngine.paint(s, t); } return; }
      const id = card.dataset.id, idx = s.pages.findIndex(p => p.id === id), act = e.target.closest('[data-p]')?.dataset.p;
      if (act) { const p = s.pages[idx]; if (act === 'del') { p.thumb && URL.revokeObjectURL(p.thumb); s.pages.splice(idx, 1); s.sel.delete(id); } else p.rot = (p.rot + (act === 'rotr' ? 90 : 270)) % 360; PagesEngine.recount(s); return PagesEngine.paint(s, t); }
      if (e.shiftKey && s.anchor >= 0) { s.sel.clear(); const [a, b] = [Math.min(s.anchor, idx), Math.max(s.anchor, idx)]; for (let i = a; i <= b; i++) s.sel.add(s.pages[i].id); }
      else if (e.ctrlKey || e.metaKey) { s.sel.has(id) ? s.sel.delete(id) : s.sel.add(id); s.anchor = idx; }
      else { const only = s.sel.size === 1 && s.sel.has(id); s.sel.clear(); if (!only) s.sel.add(id); s.anchor = idx; }
      PagesEngine.paint(s, t);
    };
    PagesEngine.bindSort(s, t);
  },
  /* drag berbasis pointer: ghost mengikuti kursor, kartu lain bergeser dengan animasi (FLIP), autoscroll halus */
  bindSort(s, t) {
    const ui = s.ui, grid = ui.grid; let drag = null;
    grid.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
    grid.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });
    grid.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag) return;
      const card = e.target.closest('.pg'); if (!card || e.target.closest('button')) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      const sx = e.clientX, sy = e.clientY, pid = e.pointerId, touch = e.pointerType !== 'mouse';
      let timer = touch ? setTimeout(() => { start(); navigator.vibrate?.(12); }, 260) : null, last = e;
      const start = () => { if (!drag) drag = begin(card, sx, sy, last); };
      const move = ev => {
        if (ev.pointerId !== pid) return; last = ev;
        if (!drag) {
          const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
          if (touch) { if (d > 10) stop(); return; }
          if (d < 5) return; start();
        }
        drag.move(ev.clientX, ev.clientY);
      };
      const stop = () => { clearTimeout(timer); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', esc); };
      const up = () => { stop(); if (drag) { drag.drop(); drag = null; } };
      const cancel = () => { stop(); if (drag) { drag.drop(true); drag = null; } };
      const esc = ev => { if (ev.key === 'Escape') cancel(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel); addEventListener('keydown', esc);
    });
    const begin = (card, sx, sy) => {
      const id = card.dataset.id;
      if (!s.sel.has(id)) { s.sel.clear(); s.sel.add(id); s.anchor = s.pages.findIndex(p => p.id === id); PagesEngine.paint(s, t); }
      const ids = s.pages.filter(p => s.sel.has(p.id)).map(p => p.id), moving = new Set(ids);
      const r = card.getBoundingClientRect(), off = { x: sx - r.left, y: sy - r.top };
      const ghost = card.cloneNode(true); ghost.classList.add('ghost'); if (ids.length > 1) { ghost.classList.add('stack'); ghost.append(el(`<span class="ghost-count">${ids.length}</span>`)); }
      Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px' });
      document.body.append(ghost);
      const ph = el(`<div class="pg-ph" style="height:${r.height}px"></div>`);
      const flip = mutate => {
        const items = [...grid.children].filter(n => n !== ph && !n.hidden), first = new Map(items.map(n => [n, n.getBoundingClientRect()]));
        mutate();
        let k = 1; for (const n of grid.children) { if (n === ph) k += ids.length; else if (n.classList.contains('pg') && !n.hidden) $('.pg-num', n).textContent = k++; }
        for (const n of items) {
          const a = first.get(n), b = n.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
          n.getAnimations().forEach(x => x.cancel());
          n.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      };
      flip(() => { card.before(ph); ids.forEach(i => { const n = ui.nodes.get(i); if (n) n.hidden = true; }); });
      grid.classList.add('sorting'); document.body.classList.add('dragging-pages');
      let px = sx, py = sy, dirty = true, raf;
      const place = () => {
        ghost.style.transform = `translate3d(${px - off.x}px,${py - off.y}px,0) rotate(1.5deg) scale(1.04)`;
        const hit = document.elementFromPoint(px, py), over = hit?.closest('.pg,.add-tile');
        if (!over || !grid.contains(over)) return;
        if (over === ui.addTile) { if (ph.nextElementSibling !== ui.addTile) flip(() => ui.addTile.before(ph)); return; }
        const b = over.getBoundingClientRect(), after = px > b.left + b.width / 2;
        const sib = (n, dir) => { do n = n[dir]; while (n && n.hidden); return n; };
        if (after ? sib(over, 'nextElementSibling') === ph : sib(over, 'previousElementSibling') === ph) return;
        flip(() => after ? over.after(ph) : over.before(ph));
      };
      const tick = () => {
        const EDGE = 120, top = 64; let v = 0;
        if (py < top + EDGE) v = -(((top + EDGE - py) / EDGE) ** 2) * 24; else if (py > innerHeight - EDGE) v = ((py - (innerHeight - EDGE)) / EDGE) ** 2 * 24;
        if (v) { const y0 = scrollY; scrollBy(0, clamp(v, -30, 30)); if (scrollY !== y0) dirty = true; }
        if (dirty) { dirty = false; place(); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return {
        move(x, y) { px = x; py = y; dirty = true; },
        drop(cancelled) {
          cancelAnimationFrame(raf);
          const pr = ph.getBoundingClientRect();
          if (!cancelled) {
            const order = []; for (const n of grid.children) { if (n === ph) order.push(...ids); else if (n.classList.contains('pg') && !moving.has(n.dataset.id)) order.push(n.dataset.id); }
            const byId = new Map(s.pages.map(p => [p.id, p])); s.pages = order.map(i => byId.get(i)).filter(Boolean);
          }
          ui.justDragged = true; setTimeout(() => ui.justDragged = false, 0);
          const finish = () => { ghost.remove(); grid.classList.remove('sorting'); document.body.classList.remove('dragging-pages'); flip(() => { ph.remove(); ids.forEach(i => { const n = ui.nodes.get(i); if (n) n.hidden = false; }); PagesEngine.paint(s, t); }); };
          if (cancelled) return finish();
          ghost.animate([{ transform: ghost.style.transform }, { transform: `translate3d(${pr.left}px,${pr.top}px,0)` }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(finish, finish);
          ghost.style.transform = `translate3d(${pr.left}px,${pr.top}px,0)`;
        }
      };
    };
  },
  recount(s) { for (const src of s.sources) if (!src.loading) src.count = s.pages.filter(p => p.src === src.id).length; s.sources = s.sources.filter(x => x.loading || x.count > 0); },
  action(s, t, a) {
    const target = s.sel.size ? s.pages.filter(p => s.sel.has(p.id)) : s.pages;
    if (a === 'add') return pickFiles(t);
    if (a === 'selall') { if (s.sel.size === s.pages.length) s.sel.clear(); else s.pages.forEach(p => s.sel.add(p.id)); }
    if (a === 'rotl' || a === 'rotr') target.forEach(p => p.rot = (p.rot + (a === 'rotr' ? 90 : 270)) % 360);
    if (a === 'sort') { const order = [...s.sources].sort((x, y) => x.name.localeCompare(y.name, 'id', { numeric: true })).map(x => x.id); s.pages.sort((x, y) => order.indexOf(x.src) - order.indexOf(y.src) || (x.index ?? 0) - (y.index ?? 0)); toast('Diurutkan berdasarkan nama file.'); }
    if (a === 'del') { if (!s.sel.size) return toast('Pilih halaman yang ingin dihapus dulu.'); s.pages = s.pages.filter(p => !s.sel.has(p.id)); s.sel.clear(); PagesEngine.recount(s); }
    if (a === 'clear') { resetTool(t.id); return; }
    PagesEngine.paint(s, t);
  },
  key(e, s, t) {
    if (e.key === 'Delete' || e.key === 'Backspace') { if (s.sel.size) { e.preventDefault(); PagesEngine.action(s, t, 'del'); } }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); s.pages.forEach(p => s.sel.add(p.id)); PagesEngine.paint(s, t); }
    else if (e.key === 'Escape' && s.sel.size) { s.sel.clear(); PagesEngine.paint(s, t); }
    else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) PagesEngine.action(s, t, e.shiftKey ? 'rotl' : 'rotr');
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.sel.size) {
      e.preventDefault(); const d = e.key === 'ArrowLeft' ? -1 : 1, list = [...s.pages];
      const idxs = list.map((p, i) => s.sel.has(p.id) ? i : -1).filter(i => i >= 0); if (d > 0) idxs.reverse();
      for (const i of idxs) { const j = i + d; if (j < 0 || j >= list.length || s.sel.has(list[j].id)) continue; [list[i], list[j]] = [list[j], list[i]]; }
      s.pages = list; PagesEngine.paint(s, t);
    }
  }
};
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
async function exportPages(s, t, prog) {
  const { PDFDocument, degrees } = await lib('pdflib');
  const o = s.opts, n = s.pages.length;
  const srcOf = id => s.sources.find(x => x.id === id);
  const defName = t.defName(s);
  // Jalur cepat lossless: satu PDF, urutan & jumlah halaman tak berubah → edit langsung (pertahankan bookmark, link, form)
  const single = s.sources.length === 1 && s.sources[0].kind === 'pdf' && n === s.sources[0].count && s.pages.every((p, i) => p.kind === 'pdf' && p.index === i);
  if (single) {
    prog(.2, 'Menerapkan perubahan…');
    const doc = await loadForEdit(s.sources[0].bytes);
    doc.getPages().forEach((pg, i) => { const r = s.pages[i].rot; if (r) pg.setRotation(degrees((pg.getRotation().angle + r) % 360)); });
    prog(.8, 'Menyimpan…');
    return [{ name: cleanName(o.name, defName) + '.pdf', blob: await savePdf(doc) }];
  }
  const out = await PDFDocument.create();
  // salin halaman per sumber sekali jalan → resource bersama (font, gambar) tidak terduplikasi
  const copied = new Map();
  const bySrc = new Map(); s.pages.forEach(p => p.kind === 'pdf' && (bySrc.get(p.src) || bySrc.set(p.src, []).get(p.src)).push(p));
  let step = 0;
  for (const [sid, list] of bySrc) {
    prog(step / (bySrc.size + 1) * .5, `Membaca ${srcOf(sid).name}…`);
    const src = await loadForEdit(srcOf(sid).bytes);
    const pages = await out.copyPages(src, list.map(p => p.index));
    list.forEach((p, i) => copied.set(p.id, pages[i])); step++;
  }
  const embedded = new Map();
  for (let i = 0; i < n; i++) {
    const p = s.pages[i]; await prog.check?.();
    prog(.5 + i / n * .45, `Menyusun halaman ${i + 1} dari ${n}…`);
    let page;
    if (p.kind === 'pdf') { page = out.addPage(copied.get(p.id)); if (p.rot) page.setRotation(degrees((page.getRotation().angle + p.rot) % 360)); continue; }
    const im = p.img;
    let img = embedded.get(p.id); if (!img) { img = im.mime === 'image/png' ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes); embedded.set(p.id, img); }
    const rot = p.rot % 180 !== 0; const iw = rot ? im.h : im.w, ih = rot ? im.w : im.h; // dimensi visual setelah diputar
    let pw, ph, dw, dh;
    if (im.ptW) { pw = im.ptW; ph = im.ptH; }
    else if ((o.imgSize || 'fit') === 'fit') { const box = iw > ih ? [841.89, 595.28] : [595.28, 841.89]; const k = Math.min(box[0] / iw, box[1] / ih); pw = iw * k; ph = ih * k; }
    else { let [a, b] = PAGE_SIZES[o.imgSize]; const land = o.orient === 'landscape' || (o.orient !== 'portrait' && iw > ih); [pw, ph] = land ? [b, a] : [a, b]; }
    const m = im.ptW || (o.imgSize || 'fit') === 'fit' ? 0 : +(o.margin || 0);
    const k = Math.min((pw - m * 2) / iw, (ph - m * 2) / ih); dw = iw * k; dh = ih * k;
    page = out.addPage([pw, ph]);
    // gambar diputar di dalam halaman (halaman tetap tegak)
    const x = (pw - dw) / 2, y = (ph - dh) / 2, w0 = rot ? dh : dw, h0 = rot ? dw : dh;
    const r = p.rot % 360;
    const anchor = r === 0 ? [x, y] : r === 90 ? [x, y + dh] : r === 180 ? [x + dw, y + dh] : [x + dw, y];
    page.drawImage(img, { x: anchor[0], y: anchor[1], width: w0, height: h0, rotate: degrees(-r) });
  }
  prog(.97, 'Menyimpan PDF…');
  return [{ name: cleanName(o.name, defName) + '.pdf', blob: await savePdf(out) }];
}

/* ===================== FILES ENGINE =====================
   Alat yang memproses file satu per satu dengan opsi */
const FilesEngine = {
  init: () => ({ files: [] }),
  reset(s) { s.files.forEach(f => { f.thumb && URL.revokeObjectURL(f.thumb); f.doc?.destroy(); }); s.files = []; },
  async add(s, files, t) {
    if (t.single) { FilesEngine.reset(s); files = files.slice(0, 1); }
    for (const file of files) {
      const f = { id: uid(), file, name: file.name, size: file.size, loading: true, kind: wmKind(file) };
      s.files.push(f); FilesEngine.paint(s, t);
      try {
        if (isPdf(file)) {
          const r = await readPdfFile(file);
          Object.assign(f, { pdf: true, bytes: r.bytes, doc: r.doc, pages: r.doc.numPages, decrypted: !!r.decrypted });
          const c = await renderPage(await r.doc.getPage(1), { width: 140 }); f.thumb = URL.createObjectURL(await toBlob(c, 'image/jpeg', .8));
        } else if (isImage(file)) { const img = await decodeImage(file); f.thumb = await thumbFrom(img, 140); f.w = img.naturalWidth; f.h = img.naturalHeight; f.img = img; }
        else if (f.kind === 'video' && location.protocol !== 'file:') { try { f.thumb = await videoPoster(file); } catch { } }
        f.loading = false;
      } catch (e) { s.files = s.files.filter(x => x !== f); if (!e.skipped) toast(`${file.name}: ${e.message || 'gagal dibuka'}`, 'err'); }
      FilesEngine.paint(s, t);
    }
    if (!s.files.length) { s.stage = 'upload'; rerender(); }
    else { s.paintOpts?.(); FilesEngine.preview(s, t); }
  },
  work(root, s, t) {
    const ui = s.ui = wsLayout(root, t, { sideTitle: t.sideTitle || 'Pengaturan', sub: t.sideSub || '' });
    ui.bar.innerHTML = `<div class="info"></div>${t.single ? `<button class="tbtn outline" data-a="add">${ic('refresh')}Ganti file</button>` : `<button class="tbtn outline" data-a="add">${ic('plus')}Tambah file</button>`}<button class="tbtn danger" data-a="clear">Bersihkan</button>`;
    ui.body.innerHTML = `<div class="flist"></div>${t.preview ? `<div class="preview-wrap"><div class="preview-cap">Pratinjau halaman pertama</div><canvas></canvas></div>` : ''}`;
    ui.bar.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'add') pickFiles(t); if (a === 'clear') resetTool(t.id); };
    $('.flist', ui.body).onclick = e => {
      const id = e.target.closest('[data-rm]')?.dataset.rm; if (id) { const f = s.files.find(x => x.id === id); f?.thumb && URL.revokeObjectURL(f.thumb); f?.doc?.destroy(); s.files = s.files.filter(x => x.id !== id); if (!s.files.length) { s.stage = 'upload'; rerender(); } else { FilesEngine.paint(s, t); s.paintOpts(); FilesEngine.preview(s, t); } }
      if (e.target.closest('[data-a="add"]')) pickFiles(t);
    };
    const relabel = () => { if (t.actionFor) $('span', ui.run).textContent = t.actionFor(s.opts); };
    s.paintOpts = mountOpts(ui.opts, t.opts || [], s.opts, s, (k, discrete) => { FilesEngine.preview(s, t); if (discrete) { FilesEngine.paint(s, t); relabel(); } });
    relabel();
    ui.run.onclick = async () => {
      if (s.files.some(f => f.loading)) { toast('Menunggu file selesai dibaca…'); while (s.files.some(f => f.loading)) await sleep(150); }
      if (!s.files.length) return toast('Tambahkan file terlebih dahulu.', 'err');
      const err = t.validate?.(s.opts, s); if (err) return toast(err, 'err');
      runJob(t, s, async prog => {
        const outs = [];
        for (let i = 0; i < s.files.length; i++) {
          const f = s.files[i], sub = (p, m) => prog((i + clamp(p, 0, 1)) / s.files.length, (s.files.length > 1 ? `[${i + 1}/${s.files.length}] ` : '') + m);
          sub.check = prog.check;
          outs.push(...await t.process(f, s.opts, sub, s));
        }
        return outs;
      });
    };
    FilesEngine.paint(s, t); FilesEngine.preview(s, t);
  },
  paint(s, t) {
    const ui = s.ui; if (!ui?.body?.isConnected) return;
    const total = s.files.reduce((a, f) => a + f.size, 0);
    $('.info', ui.bar).innerHTML = `${s.files.length} file <span>· ${fmtSize(total)}</span>`;
    $('.flist', ui.body).innerHTML = s.files.map(f => `<div class="frow"><div class="fthumb">${f.thumb ? `<img src="${f.thumb}" alt="">` : f.loading ? '<i class="spin"></i>' : `<span class="fext">${esc(extOf(f.name).toUpperCase().slice(0, 4))}</span>`}</div>
      <div class="finfo"><b title="${esc(f.name)}">${esc(f.name)}</b><span>${f.loading ? 'Membaca…' : [fmtSize(f.size), f.pages ? `${f.pages} halaman` : f.w ? `${f.w}×${f.h}px` : ''].filter(Boolean).join(' · ')}</span>${!f.loading && t.fileNote?.(f, s.opts) ? `<span class="fnote">${ic('shield')}${esc(t.fileNote(f, s.opts))}</span>` : ''}</div>
      <button class="x" data-rm="${f.id}" title="Hapus">${ic('x')}</button></div>`).join('') + (t.single ? '' : `<button class="add-tile" data-a="add">${ic('plus')} Tambah file</button>`);
    ui.run.disabled = !s.files.length;
  },
  async preview(s, t) {
    if (!t.preview || !s.ui?.body?.isConnected) return;
    const c = $('.preview-wrap canvas', s.ui.body), f = s.files.find(x => x.doc || x.img); if (!c) return;
    const show = f && (!t.previewWhen || t.previewWhen(s.opts));
    $('.preview-wrap', s.ui.body).classList.toggle('hidden', !show); if (!show) return;
    $('.preview-cap', s.ui.body).textContent = f.doc ? 'Pratinjau halaman pertama' : 'Pratinjau';
    if (!f.prev) {
      if (f.doc) { const page = await f.doc.getPage(1); const vp = page.getViewport({ scale: 1 }); f.prev = { base: await renderPage(page, { width: 560 * Math.min(2, devicePixelRatio || 1) }), VW: vp.width, VH: vp.height }; }
      else { const im = f.img, k = Math.min(1, 1120 / im.naturalWidth), b = canvas(im.naturalWidth * k, im.naturalHeight * k); b.getContext('2d').drawImage(im, 0, 0, b.width, b.height); f.prev = { base: b, VW: 595, VH: 595 * b.height / b.width }; }
    }
    cancelAnimationFrame(s.prevRaf);
    s.prevRaf = requestAnimationFrame(async () => {
      const { base, VW, VH } = f.prev; c.width = base.width; c.height = base.height; c.style.width = Math.min(560, base.width) + 'px';
      const ctx = c.getContext('2d'); ctx.drawImage(base, 0, 0);
      try { await t.preview(ctx, { k: base.width / VW, VW, VH, total: f.pages }, s.opts); } catch { }
    });
  }
};
