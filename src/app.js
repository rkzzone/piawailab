/* =========================================================
   APP — shell, routing, unggah, proses, hasil
   ========================================================= */
const view = $('#view');
const sessions = {};
let current = null, pending = null;

function fresh(t) {
  const s = { stage: 'upload', opts: structuredClone(t.defaults || {}), outputs: null, ...(t.engine.init?.() || {}) };
  t.init?.(s); return s;
}
const S = id => sessions[id] ||= fresh(T[id]);
function resetTool(id) { const t = T[id], s = sessions[id]; if (s) { t.engine.reset?.(s); s.outputs = null; } sessions[id] = fresh(t); if (current === id) rerender(); }
function rerender() { if (current) renderStage(); }

/* ---------- header, menu, tema ---------- */
function setupShell() {
  $('#mega').innerHTML = CATS.map(c => `<div><h4>${c.name}</h4>${TOOLS.filter(t => t.cat === c.id || (c.id === 'image' && ['compress', 'watermark'].includes(t.id))).map(t => `<a href="#/${t.id}" style="--tc:${t.color}"><span class="ti sm">${ic(t.icon)}</span>${t.name}</a>`).join('')}</div>`).join('');
  const btn = $('#toolsBtn'), mega = $('#mega'), scrim = $('#scrim');
  const setMega = open => { mega.classList.toggle('open', open); scrim.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
  btn.onclick = () => setMega(!mega.classList.contains('open'));
  scrim.onclick = () => setMega(false);
  mega.onclick = e => e.target.closest('a') && setMega(false);
  window.closeMega = () => setMega(false);
  $('.pill-safe').onclick = e => { e.preventDefault(); showHome.faq = 'privasi'; if (location.hash === '#/' || location.hash === '') route(); else location.hash = '#/'; };
  const applyTheme = th => { document.documentElement.dataset.theme = th; $('#themeBtn').innerHTML = ic(th === 'dark' ? 'sun' : 'moon'); $('meta[name=theme-color]').content = th === 'dark' ? '#15151c' : '#ffffff'; };
  applyTheme(store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#themeBtn').onclick = () => { const th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', th); applyTheme(th); };
}

/* ---------- routing ---------- */
function route() {
  closeMega?.();
  const id = location.hash.replace(/^#\/?/, '');
  if (T[id]) showTool(id); else showHome();
  $$('.quick a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + id));
}
function openWith(id, files) { sessions[id] && T[id].engine.reset?.(sessions[id]); sessions[id] = fresh(T[id]); pending = files; if (location.hash === '#/' + id) route(); else location.hash = '#/' + id; }

/* ---------- beranda ---------- */
const FAQ = [
  ['privasi', 'Apakah file saya diunggah ke server?', `Tidak. PiawaiLab hanyalah halaman web statis: semua pemrosesan — merge, kompres, watermark, dan lainnya — berjalan di browser Anda dengan JavaScript & WebAssembly. Tidak ada server yang menerima file Anda. Anda bisa membuktikannya sendiri: buka <b>DevTools → Network</b> saat memproses file, atau putuskan internet setelah halaman terbuka — alat tetap berjalan.`],
  ['simpan', 'Apa saja yang disimpan di perangkat saya?', `Hanya pengaturan kecil: tema terang/gelap, pilihan cara menyimpan file, dan tanda tangan <i>jika</i> Anda mencentang "Ingat tanda tangan". File yang Anda proses hanya ada di memori tab dan hilang saat tab ditutup. <button class="tbtn outline" data-clear-data style="margin-top:8px">Hapus semua data tersimpan</button>`],
  ['batas', 'Gratis? Ada batas ukuran atau jumlah?', `Gratis, tanpa akun, tanpa kuota harian. Batasnya hanya memori perangkat Anda: PDF ratusan MB atau video panjang tetap bisa, tetapi lebih lambat di ponsel. Untuk video, durasi beberapa menit di 1080p masih nyaman di laptop.`],
  ['offline', 'Bisa dipakai tanpa internet?', `Bisa. Setelah halaman pernah dibuka, PiawaiLab menyimpan komponennya di perangkat sehingga bisa dibuka & dipakai offline. Anda juga bisa memasangnya sebagai aplikasi (tombol <b>Pasang</b> di pojok kanan atas, bila browser mendukung). Pengecualian: model AI hapus latar perlu diunduh sekali saat online.`],
  ['browser', 'Browser apa yang didukung?', `Chrome, Edge, dan browser berbasis Chromium versi terbaru mendukung semua alat. Firefox dan Safari mendukung hampir semua alat; pengolahan video memerlukan WebCodecs (Chrome/Edge, Safari 17+, Firefox 130+).`],
  ['watermark', 'Seberapa kuat watermark tak terlihat (Advanced)?', `Pesan disandikan dengan kode koreksi kesalahan lalu disisipkan dengan metode yang cocok untuk tiap jenis file. Jika Anda memberi kata sandi, pesan dienkripsi <b>AES-256-GCM</b> (kunci PBKDF2 150.000 iterasi) dan letaknya diacak — tanpa sandi, watermark bahkan tidak bisa ditemukan. Gambar tahan kompres JPEG & resize, audio tahan konversi MP3/AAC, video tahan kompres ulang hingga 480p. Watermark bisa hilang bila file dipotong (crop), diputar bebas, atau diedit berat — gunakan sebagai bukti pendukung, bukan satu-satunya perlindungan hukum.`],
  ['office', 'Kenapa hasil Word/Excel → PDF berupa gambar?', `Browser tidak memiliki mesin tata letak Microsoft Office, jadi halaman dirender lalu disimpan sebagai gambar agar tampilannya terjaga. Untuk teks yang bisa dipilih & tata letak 100% akurat, gunakan "Simpan sebagai PDF" dari Word/Excel, lalu olah PDF-nya di sini.`],
];
function showHome() {
  current = null; document.title = 'PiawaiLab — Alat PDF, dokumen & media, langsung di browser';
  document.documentElement.style.removeProperty('--tc');
  const cat = showHome.cat || 'all';
  view.innerHTML = `<section class="hero">
      <a class="kicker" href="#/watermark"><span>Baru</span> Watermark tak terlihat & terenkripsi untuk PDF, Office, gambar, video, audio ${ic('chev')}</a>
      <h1>Alat dokumen & media Anda<br><em>Cepat · privat · tanpa unggah</em></h1>
      <p>Gabung, kompres, konversi, tanda tangani, dan beri watermark — semuanya diproses di browser Anda. File tidak pernah dikirim ke server mana pun.</p>
      <div class="search">${ic('search')}<input id="q" type="search" placeholder="Cari alat… mis. kompres, tanda tangan, watermark" autocomplete="off" aria-label="Cari alat"><span class="kbd">/</span></div>
    </section>
    <div class="chips" role="tablist">${[['all', 'Semua alat'], ...CATS.map(c => [c.id, c.name])].map(([id, n]) => `<button class="chip ${cat === id ? 'on' : ''}" data-cat="${id}">${n}</button>`).join('')}</div>
    <div class="grid-tools" id="grid"></div>
    <div class="feats">
      <div class="feat"><span class="fi">${ic('shield')}</span><div><strong>File tidak pernah diunggah</strong><p>Diproses langsung di browser Anda. Cocok untuk kontrak, KTP, slip gaji, dan dokumen rahasia lainnya.</p></div></div>
      <div class="feat"><span class="fi">${ic('infinity')}</span><div><strong>Gratis, tanpa akun & tanpa batas</strong><p>Tidak ada kuota harian, tidak ada watermark iklan, tidak perlu mendaftar.</p></div></div>
      <div class="feat"><span class="fi">${ic('offline')}</span><div><strong>Bisa dipasang & dipakai offline</strong><p>Setelah dibuka sekali, PiawaiLab tetap jalan tanpa internet — di laptop maupun ponsel.</p></div></div>
    </div>
    <section class="faq" id="faq"><h2>Pertanyaan umum</h2>${FAQ.map(([id, q, a]) => `<details id="faq-${id}"><summary>${q}${ic('chevd')}</summary><div>${a}</div></details>`).join('')}</section>`;
  const paint = () => {
    const q = $('#q').value.trim().toLowerCase(), c = showHome.cat || 'all';
    const list = TOOLS.filter(t => (c === 'all' || t.cat === c || (c === 'image' && ['compress', 'watermark'].includes(t.id))) && (!q || (t.name + ' ' + t.desc + ' ' + (t.keywords || '')).toLowerCase().includes(q)));
    $('#grid').innerHTML = list.map(t => `<a class="tcard" href="#/${t.id}" style="--tc:${t.color}"><span class="ti">${ic(t.icon)}</span><span class="go">${ic('chev')}</span><div><strong>${t.name}</strong><p>${t.desc}</p></div>${t.badge ? `<span class="badge">${t.badge}</span>` : ''}</a>`).join('') || `<div class="empty-search">Tidak ada alat untuk "${esc(q)}".</div>`;
  };
  $('#q').oninput = paint;
  $('#q').onkeydown = e => { if (e.key === 'Enter') $('#grid .tcard')?.click(); };
  $('.chips').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; showHome.cat = b.dataset.cat; $$('.chip').forEach(x => x.classList.toggle('on', x === b)); paint(); };
  $('#faq').onclick = async e => {
    if (!e.target.closest('[data-clear-data]')) return;
    const ok = await modal({ title: 'Hapus data tersimpan?', body: '<p>Tanda tangan yang diingat, pilihan tema, dan pengaturan lain di perangkat ini akan dihapus. File Anda tidak terpengaruh.</p>', actions: [{ label: 'Batal', result: false }, { label: 'Hapus', primary: true, result: true }] });
    if (ok) { store.clearAll(); SIGS = []; toast('Data tersimpan dihapus.', 'ok'); }
  };
  paint();
  if (showHome.faq) { const d = $('#faq-' + showHome.faq); showHome.faq = null; if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); } }
}
const KW = { merge: 'gabung combine satukan', compress: 'kompres kecilkan perkecil ukuran reduce', split: 'pisah potong bagi ekstrak', 'pdf-to-image': 'jpg png gambar foto convert konversi', 'image-to-pdf': 'foto jpg png gambar convert scan', sign: 'ttd tanda tangan signature paraf', protect: 'password sandi kunci enkripsi', unlock: 'buka password sandi', watermark: 'cap tanda logo invisible tak terlihat steganografi kriptografi enkripsi hak cipta video audio musik word ppt excel foto gambar teks', 'page-numbers': 'nomor halaman paginasi', crop: 'potong margin', organize: 'urut hapus halaman susun', rotate: 'putar orientasi', studio: 'hapus latar background remove ai foto edit', 'office-to-pdf': 'word excel docx xlsx csv txt konversi', 'pdf-to-text': 'teks txt ekstrak salin ocr' };
Object.entries(KW).forEach(([k, v]) => T[k] && (T[k].keywords = v));

/* ---------- halaman alat ---------- */
function showTool(id) {
  current = id; const t = T[id], s = S(id);
  document.title = `${t.name} — PiawaiLab`;
  document.documentElement.style.setProperty('--tc', t.color);
  view.innerHTML = `<div style="--tc:${t.color}"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Beranda</a>${ic('chev')}<span>${esc(CATS.find(c => c.id === t.cat).name)}</span>${ic('chev')}<span style="color:var(--ink)">${t.name}</span></nav>
    <header class="thero"><span class="ti xl">${ic(t.icon)}</span><div><h1>${t.name}</h1><p>${t.long || t.desc}</p></div></header><div id="stage"></div></div>`;
  renderStage();
  if (pending) { const f = pending; pending = null; addFiles(f); }
}
function renderStage() {
  const t = T[current], s = S(current), st = $('#stage'); if (!st) return;
  $('.thero').classList.toggle('compact', s.stage !== 'upload');
  if (s.stage === 'upload') renderUpload(st, t);
  else if (s.stage === 'done') renderDone(st, s, t);
  else t.engine.work(st, s, t);
}
function renderUpload(st, t) {
  st.innerHTML = `<div class="drop" tabindex="0" role="button" aria-label="Pilih file"><div class="drop-in">
      <div class="drop-art"><div></div><div></div><div>${ic(t.icon)}</div></div>
      <button class="choose" type="button">${ic('upload')}Pilih file</button>
      <p>atau tarik & lepas ${t.single ? 'file' : 'file-file'} di sini · bisa juga tempel dengan Ctrl+V</p>
      <small>${t.acceptLabel}</small></div></div>
    <ul class="perks">${t.perks.map(p => `<li><span class="ck">${ic('check')}</span>${p}</li>`).join('')}</ul>`;
  const d = $('.drop', st);
  d.onclick = () => pickFiles(t);
  d.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickFiles(t));
}
function pickFiles(t) {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: t.accept, multiple: !t.single });
  inp.onchange = () => inp.files.length && addFiles([...inp.files]); inp.click();
}
async function addFiles(files) {
  const t = T[current]; if (!t) return;
  const ok = files.filter(t.test), bad = files.length - ok.length;
  if (bad) toast(`${bad} file dilewati — ${t.name} menerima ${t.acceptLabel.toLowerCase()}.`, 'err');
  if (!ok.length) return;
  let s = S(current);
  if (s.stage === 'done') { resetTool(current); s = S(current); }
  s.stage = 'work'; renderStage();
  await t.engine.add(s, ok, t);
}

/* ---------- proses & overlay ---------- */
function busyOverlay(title, sub = 'Menyiapkan…') {
  const ov = el(`<div class="busy"><div class="busy-card"><div class="busy-ring"></div><h3></h3><p></p><div class="prog"><i></i></div><button class="btn btn-line">Batalkan</button></div></div>`);
  $('h3', ov).textContent = title; $('p', ov).textContent = sub; document.body.append(ov);
  const api = {
    cancelled: false,
    set(p, msg) { $('.prog i', ov).style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (msg) $('p', ov).textContent = msg; },
    close() { ov.remove(); }
  };
  $('button', ov).onclick = () => { api.cancelled = true; ov.remove(); toast('Dibatalkan.'); };
  return api;
}
async function runJob(t, s, fn) {
  const b = busyOverlay(`${t.action}…`), t0 = performance.now();
  let last = 0;
  const prog = async (p, msg) => { b.set(p, msg); if (performance.now() - last > 60) { last = performance.now(); await frame(); } };
  prog.check = async () => { if (b.cancelled) throw Object.assign(Error('cancel'), { cancelled: true }); };
  try {
    await frame();
    const outs = await fn(prog); await prog.check();
    b.set(1, 'Selesai');
    s.outputs = outs; s.took = (performance.now() - t0) / 1000; s.stage = 'done';
    await sleep(180); b.close(); rerender(); scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    b.close(); if (e.cancelled) return;
    console.error(e); toast(e.message || 'Terjadi kesalahan saat memproses.', 'err');
  }
}

/* ---------- hasil ---------- */
const took = s => s.took < 1 ? 'kurang dari 1 detik' : `${s.took.toFixed(1)} detik`;
const NEXT = {
  pdf: ['compress', 'merge', 'sign', 'watermark', 'page-numbers', 'split', 'organize', 'protect', 'pdf-to-image', 'crop', 'rotate', 'unlock'],
  img: ['compress', 'watermark', 'image-to-pdf', 'studio'],
};
function renderReport(st, s, t) {
  const outs = s.outputs || [], found = outs.filter(o => o.report.results.some(r => r.msg != null || r.locked));
  const fmtDate = ts => new Date(ts * 1000).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const card = o => {
    const r = o.report;
    const res = r.results.length ? r.results.map(h => `<div class="wm-hit">
        ${h.msg != null ? `<div class="wm-msg">“${esc(h.msg)}”</div>` : `<div class="wm-msg locked">${ic('lock')} Pesan terenkripsi</div>`}
        <div class="wm-meta">
          ${h.verified ? `<span class="save-badge">${ic('check')} Terenkripsi · utuh & asli</span>` : h.wrong ? `<span class="save-badge warn">Kata sandi salah</span>` : h.locked ? `<span class="save-badge warn">Butuh kata sandi untuk membaca</span>` : `<span class="save-badge">${ic('check')} Utuh (CRC cocok)</span>`}
          <span>Disematkan ${fmtDate(h.ts)}</span><span>Ditemukan di: ${esc(h.where.join(', '))}</span>${h.conf < 1 ? `<span>Kekuatan sinyal ${Math.round(h.conf * 100)}%</span>` : ''}
        </div></div>`).join('')
      : `<div class="wm-none">${ic('search')} Tidak ditemukan watermark PiawaiLab${s.opts.wmPass ? ' dengan kata sandi ini' : ''}.</div>`;
    return `<div class="panel wm-card"><div class="out" style="padding:4px 4px 10px"><span class="fi">${esc(extOf(o.name).toUpperCase().slice(0, 4))}</span><div class="meta"><b>${esc(o.name)}</b><span>Metode diperiksa: ${esc(r.method)}</span></div></div>${res}</div>`;
  };
  st.innerHTML = `<div class="done"><div class="done-badge ${found.length ? '' : 'none'}">${ic(found.length ? 'shield' : 'search')}</div>
    <h2>${found.length ? `Watermark ditemukan` : 'Tidak ditemukan'}</h2>
    <p>${found.length ? `${found.length} dari ${outs.length} file berisi watermark PiawaiLab.` : 'Tidak ada watermark PiawaiLab yang terbaca di file ini.'} Diperiksa dalam ${took(s)}.</p>
    <div style="display:grid;gap:12px;text-align:left">${outs.map(card).join('')}</div>
    ${!found.length && !s.opts.wmPass ? `<div class="note" style="margin-top:14px;text-align:left">${ic('info')}<span>Watermark yang dibuat dengan kata sandi tidak bisa ditemukan tanpa sandi yang sama. File yang dipotong, diputar, atau diedit berat juga bisa kehilangan watermark.</span></div>` : ''}
    <div class="done-links" style="margin-top:20px"><button class="tbtn" data-back>${ic('back')}Kembali</button><button class="tbtn" data-new>${ic('refresh')}Periksa file lain</button></div></div>`;
  st.onclick = e => { if (e.target.closest('[data-back]')) { s.stage = 'work'; rerender(); } if (e.target.closest('[data-new]')) { const o = s.opts; resetTool(t.id); Object.assign(S(t.id).opts, { mode: o.mode }); rerender(); } };
}
function renderDone(st, s, t) {
  if ((s.outputs || []).length && s.outputs.every(o => o.report)) return renderReport(st, s, t);
  const outs = s.outputs || [], one = outs.length === 1, kind = outs.every(o => /\.pdf$/i.test(o.name)) ? 'pdf' : outs.every(o => /\.(png|jpe?g|webp)$/i.test(o.name)) ? 'img' : null;
  const totalB = outs.reduce((a, o) => a + (o.before || 0), 0), totalA = outs.reduce((a, o) => a + (o.after || 0), 0);
  const saving = totalB && totalA < totalB ? Math.round((1 - totalA / totalB) * 100) : 0;
  const allSame = outs.length && outs.every(o => o.same);
  const title = t.id === 'compress' ? (allSame ? 'Sudah optimal' : `Hemat ${saving}%`) : 'Selesai!';
  const sub = t.id === 'compress' ? (allSame ? 'File Anda sudah sangat efisien — ukurannya tidak bisa diperkecil lagi tanpa merusak kualitas.' : `${fmtSize(totalB)} → ${fmtSize(totalA)} · diproses dalam ${took(s)}`) : `${outs.length} file siap diunduh · diproses dalam ${took(s)} di perangkat Anda`;
  const MAX = 8;
  const row = (o, i) => `<div class="out"><span class="fi">${esc(extOf(o.name).toUpperCase())}</span><div class="meta"><b title="${esc(o.name)}">${esc(o.name)}</b><span>${o.before && !o.same ? `${fmtSize(o.before)} → ${fmtSize(o.after)}<span class="save-badge">−${Math.round((1 - o.after / o.before) * 100)}%</span>` : fmtSize(o.blob.size)}${o.same ? '<span class="save-badge neutral">tidak berubah</span>' : ''}${o.dims ? ' · ' + o.dims : ''}${o.verified ? `<span class="save-badge">${ic('check')} Watermark terverifikasi</span>` : ''}</span>${o.method ? `<span class="out-method">${ic('shield')}${esc(o.method)}${o.note ? ' · ' + esc(o.note) : ''}</span>` : ''}</div><button class="dl" data-dl="${i}" title="Unduh">${ic('download')}</button></div>`;
  const txt = one && outs[0].text != null ? outs[0] : null;
  const next = kind ? NEXT[kind].filter(id => id !== t.id && T[id].test(new File([], outs[0].name))).slice(0, 8) : [];
  st.innerHTML = `<div class="done"><div class="done-badge">${ic('check')}</div><h2>${title}</h2><p>${sub}</p>
    <div class="panel out-card">${outs.slice(0, MAX).map(row).join('')}${outs.length > MAX ? `<div class="out-more">+ ${outs.length - MAX} file lainnya ada di dalam ZIP</div>` : ''}</div>
    ${txt ? `${txt.empty ? `<div class="note warn" style="margin-top:12px;text-align:left">${ic('alert')}<span>Tidak ditemukan teks. PDF ini kemungkinan hasil scan (berupa gambar).</span></div>` : ''}<textarea class="inp text-preview" readonly>${esc(txt.text.slice(0, 200000))}</textarea>` : ''}
    <div class="done-actions"><button class="btn btn-main" data-main>${ic(one ? 'download' : 'zip')}${one ? 'Unduh' : `Unduh semua (ZIP)`}</button>${txt ? `<button class="btn btn-line" data-copy>${ic('copy')}Salin teks</button>` : ''}</div>
    <div class="done-links"><button class="tbtn" data-back>${ic('back')}Kembali ke editor</button><button class="tbtn" data-new>${ic('refresh')}Mulai dari awal</button></div>
    ${window.showSaveFilePicker ? `<label class="ask-loc"><input type="checkbox" data-ask ${store.get('askLocation', true) ? 'checked' : ''}> Tanyakan folder & nama saat menyimpan</label>` : ''}
    ${next.length ? `<div class="continue"><h4>Lanjutkan dengan hasil ini</h4><div class="cgrid">${next.map(id => `<a href="#/${id}" data-next="${id}" style="--tc:${T[id].color}"><span class="ti sm">${ic(T[id].icon)}</span>${T[id].name}</a>`).join('')}</div></div>` : ''}</div>`;
  const dl = async () => { if (one) return saveBlob(outs[0].blob, outs[0].name); const b = busyOverlay('Membuat ZIP…'); try { const z = await zipOutputs(outs, `${t.id === 'pdf-to-image' ? firstBase(s) + '-gambar' : 'piawailab-' + t.id}.zip`); b.close(); await saveBlob(z.blob, z.name); } catch (e) { b.close(); toast(e.message, 'err'); } };
  st.onclick = async e => {
    if (e.target.closest('[data-main]')) return dl();
    const i = e.target.closest('[data-dl]')?.dataset.dl; if (i != null) return saveBlob(outs[i].blob, outs[i].name);
    if (e.target.closest('[data-copy]')) { try { await navigator.clipboard.writeText(txt.text); toast('Teks disalin ke clipboard.', 'ok'); } catch { $('.text-preview', st).select(); document.execCommand('copy'); toast('Teks disalin.', 'ok'); } }
    if (e.target.closest('[data-back]')) { s.stage = 'work'; rerender(); }
    if (e.target.closest('[data-new]')) resetTool(t.id);
    const nx = e.target.closest('[data-next]'); if (nx) { e.preventDefault(); openWith(nx.dataset.next, outs.map(o => new File([o.blob], o.name, { type: o.blob.type }))); }
  };
  const ask = $('[data-ask]', st); if (ask) ask.onchange = () => store.set('askLocation', ask.checked);
}

/* ---------- drag & drop global, tempel, keyboard ---------- */
function setupGlobal() {
  const ov = $('#dropover'); let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; const t = T[current]; $('h2', ov).textContent = t ? `Lepaskan untuk ${t.name}` : 'Lepaskan file di sini'; $('p', ov).textContent = t ? t.acceptLabel : 'Kami akan menyarankan alat yang cocok'; ov.classList.add('show'); });
  addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; ov.classList.remove('show'); } });
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; ov.classList.remove('show'); const files = [...e.dataTransfer.files]; if (!files.length) return; current ? addFiles(files) : suggestTools(files); });
  addEventListener('paste', e => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const files = [...(e.clipboardData?.files || [])]; if (!files.length) return;
    const named = files.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `tempel-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
    e.preventDefault(); current ? addFiles(named) : suggestTools(named);
  });
  addEventListener('keydown', e => {
    if (e.target.closest?.('input,textarea,select,[contenteditable]') || $('.modal-bg,.busy')) return;
    if (e.key === '/' && !current) { e.preventDefault(); $('#q')?.focus(); return; }
    if (e.key === 'Escape') closeMega?.();
    const t = T[current], s = current && S(current); if (t && s?.stage === 'work') t.engine.key?.(e, s, t);
  });
  addEventListener('hashchange', route);
}
function suggestTools(files) {
  const fits = TOOLS.filter(t => files.every(t.test));
  if (!fits.length) return toast('Format file ini belum didukung.', 'err');
  const body = el(`<div><p>${files.length} file: <b>${esc(files.slice(0, 2).map(f => f.name).join(', '))}${files.length > 2 ? '…' : ''}</b></p><div class="suggest">${fits.map(t => `<a href="#/${t.id}" data-id="${t.id}" style="--tc:${t.color}"><span class="ti sm">${ic(t.icon)}</span>${t.name}</a>`).join('')}</div></div>`);
  modal({ title: 'Mau diapakan file ini?', body, wide: true, onOpen: (bg, close) => { body.onclick = e => { const a = e.target.closest('[data-id]'); if (!a) return; e.preventDefault(); close(); openWith(a.dataset.id, files); }; } });
}

/* ---------- PWA: offline & pasang sebagai aplikasi ---------- */
function setupPwa() {
  const net = $('#netState'), setNet = () => { net.innerHTML = navigator.onLine ? `<span class="dot"></span>Semua file diproses di perangkat Anda — tidak ada yang diunggah.` : `<span class="dot off"></span>Mode offline — alat tetap berjalan.`; };
  addEventListener('online', setNet); addEventListener('offline', setNet); setNet();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
  let deferred = null; const btn = $('#installBtn');
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.classList.remove('hidden'); });
  btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => { }); deferred = null; btn.classList.add('hidden'); };
  addEventListener('appinstalled', () => { btn.classList.add('hidden'); toast('PiawaiLab terpasang. Buka dari menu aplikasi Anda.', 'ok'); });
}

/* ---------- start ---------- */
setupShell(); setupGlobal(); setupPwa(); route();
window.PiawaiLab = { version: '2.0' };
// panaskan pustaka inti saat browser santai
(window.requestIdleCallback || setTimeout)(() => { lib('pdflib').catch(() => { }); pdfjs().catch(() => { }); }, { timeout: 2500 });
