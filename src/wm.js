/* =========================================================
   WATERMARK — Basic (terlihat) & Advanced (tak terlihat + kriptografi)
   Payload: [ver][flags][unix-time 4B] + pesan
     · tanpa sandi : pesan + CRC32 (siapa pun yang memakai PiawaiLab bisa membaca)
     · dengan sandi: AES-256-GCM, kunci PBKDF2-SHA256 150.000 iterasi; header jadi AAD
   Kanal "robust" (gambar/video/audio) juga diacak oleh kunci turunan sandi, jadi
   tanpa sandi yang benar posisi bit-nya pun tidak diketahui.
   ========================================================= */
const TE = new TextEncoder(), TD = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
const u32 = v => new Uint8Array([v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255]);
const rd32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
const b64 = b => btoa(String.fromCharCode(...b));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const WM_MAX_MSG = 64;

async function wmPack(msg, pass) {
  const m = TE.encode(msg.normalize('NFC'));
  if (!m.length) throw Error('Tulis pesan watermark.');
  if (m.length > 120) throw Error('Pesan terlalu panjang.');
  const head = cat(new Uint8Array([1, pass ? 1 : 0]), u32(Math.floor(Date.now() / 1000)));
  if (!pass) { const body = cat(head, m); return cat(body, u32(crc32(body))); }
  const salt = crypto.getRandomValues(new Uint8Array(8)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, await wmKey(pass, salt), m));
  return cat(head, salt, iv, ct);
}
async function wmKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', TE.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt', 'encrypt']);
}
async function wmUnpack(b, pass) {
  if (!b || b.length < 10 || b[0] !== 1) return null;
  const head = b.slice(0, 6), ts = rd32(b, 2), enc = !!(b[1] & 1);
  if (!enc) { const body = b.slice(0, -4); if (crc32(body) !== rd32(b, b.length - 4)) return null; return { msg: TD.decode(body.slice(6)), ts, encrypted: false }; }
  if (b.length < 6 + 8 + 12 + 17) return null;
  if (!pass) return { locked: true, ts, encrypted: true };
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(14, 26), additionalData: head }, await wmKey(pass, b.slice(6, 14)), b.slice(26));
    return { msg: TD.decode(pt), ts, encrypted: true, verified: true };
  } catch { return { locked: true, wrong: true, ts, encrypted: true }; }
}
/* frame untuk kanal robust: bytes + CRC16 (cek integritas walau payload terenkripsi) */
const wmFrame = b => cat(b, new Uint8Array([crc32(b) >>> 8 & 255, crc32(b) & 255]));
const wmUnframe = f => { if (f.length < 3) return null; const b = f.slice(0, -2), c = crc32(b); return (f[f.length - 2] === (c >>> 8 & 255) && f[f.length - 1] === (c & 255)) ? b : null; };
const bitsOf = b => { const o = new Int8Array(b.length * 8); for (let i = 0; i < o.length; i++) o[i] = (b[i >> 3] >> (7 - (i & 7))) & 1; return o; };
const bytesOf = bits => { const o = new Uint8Array(bits.length >> 3); for (let i = 0; i < o.length * 8; i++) o[i >> 3] |= bits[i] << (7 - (i & 7)); return o; };

/* PRNG berkunci */
async function wmSeed(pass, tag) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode(`piawailab|${tag}|${pass || ''}`))); return rd32(h, 0); }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function perm(n, r) { const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i; for (let i = n - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; } return p; }

/* ---------------- GAMBAR & FRAME VIDEO ----------------
   Grid sel ditentukan dari rasio aspek saja (tahan resize). Setiap sel memakai pola acak halus
   (mirip grain, tepi meruncing ke nol → tanpa sambungan) dari bank 16 templat. Bit = TANDA dari
   fitur f = <Y,p>/<p,p>, sehingga kebal perubahan kecerahan/kontras & konversi warna video.
   Kekuatan adaptif: area halus hanya disentuh ±1 level, area bertekstur boleh lebih kuat. */
const TPL_S = 32, TPL_N = 16;
function makeBank(seed, maxCyc, comps) {
  const r = rng(seed), S = TPL_S, bank = [];
  for (let t = 0; t < TPL_N; t++) {
    const a = new Float32Array(S * S), w = new Float32Array(S * S);
    const cs = Array.from({ length: comps }, () => ({ fx: (1 + (r() * maxCyc | 0)) * (r() < .5 ? -1 : 1), fy: 1 + (r() * maxCyc | 0), ph: r() * 2 * Math.PI }));
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const i = v * S + u; w[i] = Math.sin(Math.PI * (u + .5) / S) * Math.sin(Math.PI * (v + .5) / S);
      let val = 0; for (const c of cs) val += Math.sin(2 * Math.PI * (c.fx * u + c.fy * v) / S + c.ph); a[i] = w[i] * val;
    }
    let ma = 0, mw = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mw += w[i]; }
    let mx = 0; for (let i = 0; i < a.length; i++) { a[i] -= ma / mw * w[i]; mx = Math.max(mx, Math.abs(a[i])); }
    for (let i = 0; i < a.length; i++) a[i] /= mx;
    bank.push(a);
  }
  return bank;
}
const TPL_IMG = makeBank(0x5EED1234, 2, 4);   // gambar: grain halus 1–2 siklus/sel
const TPL_VID = makeBank(0x51DE0F00, 1, 2);   // video: 1 siklus/sel, paling tahan kompresi & downscale
const WM_A_VIDEO = { soft: { k: .1, min: 2.6, max: 7, ck: .45 }, std: { k: .14, min: 3.6, max: 9, ck: .55 }, strong: { k: .18, min: 5, max: 13, ck: .7 } };
const VIDEO_OPT = { T: 1024, A: WM_A_VIDEO, minRep: 1.5, bank: TPL_VID };
const WM_A = { soft: { k: .06, min: 1.6, max: 4, ck: .25 }, std: { k: .09, min: 2.3, max: 6, ck: .35 }, strong: { k: .14, min: 3.2, max: 10, ck: .5 } };
function imgGrid(W, H, T) {
  let gx = Math.max(8, Math.round(Math.sqrt(T * W / H))), gy = Math.max(8, Math.round(T / gx));
  if (W / gx < 6 || H / gy < 6) return null;
  return { gx, gy, n: gx * gy };
}
const gridT = (W, H) => Math.min(W, H) >= 384 ? 4096 : Math.min(W, H) >= 192 ? 1024 : 256;
const IMG_T = [4096, 1024, 256];
const layoutCache = new Map();
async function wmLayout(n, pass, bank = TPL_IMG) {
  const key = n + '|' + pass + '|' + (bank === TPL_VID ? 'v' : 'i'); if (layoutCache.has(key)) return layoutCache.get(key);
  const r = rng(await wmSeed(pass, 'grid')), p = perm(n, r), tpl = new Uint8Array(n);
  for (let i = 0; i < n; i++) tpl[i] = r() * TPL_N | 0;
  const L = { n, p, tpl, bank, hN: Math.floor(n / 8) }; layoutCache.set(key, L); return L;
}
/* jelajahi semua piksel: posisi dalam sel memakai koordinat kontinu (x+.5)·gx/W sehingga pola ikut
   berskala persis saat gambar di-resize; templat diambil dengan interpolasi bilinear. */
function cellPass(acc, g, L, apply) {
  const { W, H, get, put } = acc, S = TPL_S, n = g.n;
  const cx = new Int32Array(W), ux = new Float32Array(W), cy = new Int32Array(H), vy = new Float32Array(H);
  for (let x = 0; x < W; x++) { const t = (x + .5) * g.gx / W; cx[x] = Math.min(g.gx - 1, t | 0); ux[x] = clamp((t - cx[x]) * S - .5, 0, S - 1.001); }
  for (let y = 0; y < H; y++) { const t = (y + .5) * g.gy / H; cy[y] = Math.min(g.gy - 1, t | 0); vy[y] = clamp((t - cy[y]) * S - .5, 0, S - 1.001); }
  const pat = (ci, x, y) => { const t = L.bank[L.tpl[ci]], u = ux[x], v = vy[y], u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0, i = v0 * S + u0; return (t[i] * (1 - fu) + t[i + 1] * fu) * (1 - fv) + (t[i + S] * (1 - fu) + t[i + S + 1] * fu) * fv; };
  const num = new Float64Array(n), den = new Float64Array(n), s1 = apply ? new Float64Array(n) : null, s2 = apply ? new Float64Array(n) : null, cnt = apply ? new Float64Array(n) : null;
  for (let y = 0; y < H; y++) { const row = cy[y] * g.gx; for (let x = 0; x < W; x++) { const ci = row + cx[x], p = pat(ci, x, y), v = get(x, y); num[ci] += v * p; den[ci] += p * p; if (apply) { s1[ci] += v; s2[ci] += v * v; cnt[ci]++; } } }
  const f = new Float64Array(n); for (let i = 0; i < n; i++) f[i] = den[i] ? num[i] / den[i] : 0;
  if (apply) {
    const d = new Float64Array(n); let any = false;
    for (let i = 0; i < n; i++) { const m = cnt[i] || 1, sd = Math.sqrt(Math.max(0, s2[i] / m - (s1[i] / m) ** 2)); d[i] = apply(i, f[i], sd) || 0; if (d[i]) any = true; }
    if (any) for (let y = 0; y < H; y++) { const row = cy[y] * g.gx; for (let x = 0; x < W; x++) { const ci = row + cx[x]; if (d[ci]) put(x, y, d[ci] * pat(ci, x, y)); } }
  }
  return f;
}
const rgbaAccess = id => ({ W: id.width, H: id.height, get: (x, y) => { const o = (y * id.width + x) * 4, d = id.data; return .299 * d[o] + .587 * d[o + 1] + .114 * d[o + 2]; }, put: (x, y, a) => { const o = (y * id.width + x) * 4, d = id.data; d[o] += a; d[o + 1] += a; d[o + 2] += a; } });
const planeAccess = P => ({ W: P.W, H: P.H, get: (x, y) => P.Y[P.off + y * P.stride + x], put: (x, y, a) => { const i = P.off + y * P.stride + x, v = Math.round(P.Y[i] + a); P.Y[i] = v < 0 ? 0 : v > 255 ? 255 : v; } });
/* kode konvolusional K=7 rate ½ (g = 171, 133 oktal) + dekoder Viterbi soft-decision */
const CV_G0 = 0o171, CV_G1 = 0o133, par = v => { v ^= v >> 4; v ^= v >> 2; v ^= v >> 1; return v & 1; };
function convEncode(bits) {
  const out = new Int8Array((bits.length + 6) * 2); let s = 0;
  for (let i = 0; i < bits.length + 6; i++) { const b = i < bits.length ? bits[i] : 0, reg = ((s << 1) | b) & 127; out[2 * i] = par(reg & CV_G0); out[2 * i + 1] = par(reg & CV_G1); s = reg & 63; }
  return out;
}
function viterbi(soft, nBits) { // soft > 0 berarti bit 0
  let pm = new Float64Array(64).fill(-1e18); pm[0] = 0; const back = [];
  for (let i = 0; i < nBits + 6; i++) {
    const np = new Float64Array(64).fill(-1e18), from = new Uint8Array(64), l0 = soft[2 * i], l1 = soft[2 * i + 1];
    for (let s = 0; s < 64; s++) {
      if (pm[s] < -1e17) continue;
      for (let b = 0; b < (i < nBits ? 2 : 1); b++) {
        const reg = ((s << 1) | b) & 127, m = pm[s] + (par(reg & CV_G0) ? -l0 : l0) + (par(reg & CV_G1) ? -l1 : l1), ns = reg & 63;
        if (m > np[ns]) { np[ns] = m; from[ns] = s; }
      }
    }
    back.push(from); pm = np;
  }
  const bits = new Int8Array(nBits + 6); let s = 0;
  for (let i = nBits + 5; i >= 0; i--) { bits[i] = s & 1; s = back[i][s]; }
  return bits.slice(0, nBits);
}
/* sematkan; ctx (opsional) menyimpan layout & target lintas frame video */
async function gridEmbed(acc, frame, pass, strength = 'std', ctx = {}, opt = {}) {
  let g = imgGrid(acc.W, acc.H, opt.T || gridT(acc.W, acc.H)); if (!g) throw Error('Resolusi terlalu kecil (minimal ±64×64 px).');
  if (opt.T && (g.n - (g.n >> 3)) < (frame.length * 8 + 6) * 2 * (opt.minRep || 1.2)) g = imgGrid(acc.W, acc.H, gridT(acc.W, acc.H)) || g; // pesan panjang → grid lebih rapat
  if (ctx.n !== g.n) {
    const L = await wmLayout(g.n, pass, opt.bank), coded = convEncode(bitsOf(frame)), NC = coded.length, hb = bitsOf(new Uint8Array([frame.length - 2]));
    if ((g.n - L.hN) < NC * 1.2) throw Error(`Pesan terlalu panjang untuk resolusi ${acc.W}×${acc.H}. Persingkat pesan${pass ? ' atau kosongkan kata sandi' : ''}.`);
    const target = new Int8Array(g.n); for (let k = 0; k < g.n; k++) target[L.p[k]] = (k < L.hN ? hb[k % 8] : coded[(k - L.hN) % NC]) ? -1 : 1;
    Object.assign(ctx, { n: g.n, g, L, target });
  }
  const A = (opt.A || WM_A)[strength] || WM_A.std;
  cellPass(acc, ctx.g, ctx.L, (ci, f, sd) => {
    const b = ctx.target[ci], a = clamp(A.k * sd, A.min, A.max), cap = Math.min(18, Math.max(2 * a, A.ck * sd)); // tekstur menyamarkan perubahan
    if (f * b >= a) return 0;
    return clamp(b * a - f, -cap, cap);
  });
  return ctx;
}
/* kumpulkan fitur satu gambar/frame untuk tiap ukuran grid */
async function gridCollect(sets, acc, pass, bank) {
  for (const T of IMG_T) {
    const g = imgGrid(acc.W, acc.H, T); if (!g) continue;
    const set = sets[T] ||= { n: g.n, sum: new Float64Array(g.n), k: 0 }; if (set.n !== g.n) continue;
    const f = cellPass(acc, g, await wmLayout(g.n, pass, bank));
    for (let i = 0; i < g.n; i++) set.sum[i] += f[i] / (Math.abs(f[i]) + 1); set.k++;
  }
}
async function gridDecode(sets, pass, bank) {
  for (const T of Object.keys(sets)) {
    const { n, sum } = sets[T], L = await wmLayout(n, pass, bank), sp = new Float64Array(n);
    for (let k = 0; k < n; k++) sp[k] = sum[L.p[k]];
    const hs = new Float64Array(8); for (let k = 0; k < L.hN; k++) hs[k % 8] += sp[k];
    const len = bytesOf(Int8Array.from(hs, v => v < 0 ? 1 : 0))[0];
    if (len < 10 || len > 250) continue;
    const NB = (len + 2) * 8, NC = (NB + 6) * 2; if (n - L.hN < NC) continue;
    const cs = new Float64Array(NC); for (let k = L.hN; k < n; k++) cs[(k - L.hN) % NC] += sp[k];
    const b = wmUnframe(bytesOf(viterbi(cs, NB)));
    if (b) { const reps = (n - L.hN) / NC, conf = cs.reduce((a, v) => a + Math.abs(v), 0) / NC / reps / Math.max(1, sets[T].k); return { bytes: b, conf: clamp(conf * 1.6, 0, 1), T: +T }; }
  }
  return null;
}
function planeRotate(Yp, r) { // salinan bidang Y diputar 90/180/270 (untuk video yang diputar ulang)
  const { Y, off, stride, W, H } = Yp, W2 = r % 180 ? H : W, H2 = r % 180 ? W : H, o = new Uint8Array(W2 * H2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Y[off + y * stride + x];
    const [nx, ny] = r === 90 ? [H - 1 - y, x] : r === 180 ? [W - 1 - x, H - 1 - y] : [y, W - 1 - x];
    o[ny * W2 + nx] = v;
  }
  return { Y: o, off: 0, stride: W2, W: W2, H: H2 };
}
function planeDown(Yp, k) { // perkecil dengan rata-rata k×k (fitur frekuensi rendah tetap terjaga)
  if (k <= 1) return Yp;
  const W2 = Math.floor(Yp.W / k), H2 = Math.floor(Yp.H / k), o = new Uint8Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += Yp.Y[Yp.off + (y * k + j) * Yp.stride + x * k + i]; o[y * W2 + x] = s / (k * k); }
  return { Y: o, off: 0, stride: W2, W: W2, H: H2 };
}

/* ---------------- AUDIO: Improved Spread Spectrum (ISS) di pita 1–5 kHz ----------------
   Proyeksi sinyal ke 4 vektor PN (domain DCT, sub-pita berselang) diganti ±α → interferensi
   dari sinyal asli dihapus. Deteksi mencari ulang posisi frame (tahan delay encoder MP3). */
const AU_N = 4096, AU_SUB = 4, AU_S = { soft: 1.3, std: 2.2, strong: 3.4 };
async function auCarriers(fs, pass) {
  const N = AU_N, r = rng(await wmSeed(pass, 'audio'));
  const k0 = Math.max(2, Math.floor(2 * N * 1000 / fs)), k1 = Math.min(N - 1, Math.floor(2 * N * 5000 / fs));
  const vecs = Array.from({ length: AU_SUB + 2 }, () => new Float32Array(N));
  const c0 = Math.sqrt(2 / N);
  for (let k = k0; k <= k1; k++) {
    const v = vecs[(k - k0) % (AU_SUB + 2)], s = r() < .5 ? -1 : 1, w = Math.PI * k / (2 * N);
    for (let n = 0; n < N; n++) v[n] += s * c0 * Math.cos(w * (2 * n + 1));
  }
  const tap = 192;
  for (const v of vecs) {
    for (let n = 0; n < tap; n++) { const w = .5 - .5 * Math.cos(Math.PI * n / tap); v[n] *= w; v[N - 1 - n] *= w; }
    let e = 0; for (let n = 0; n < N; n++) e += v[n] * v[n]; e = Math.sqrt(e); for (let n = 0; n < N; n++) v[n] /= e;
  }
  const sync = bitsOf(u32(rd32(new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode('sync' + (pass || '')))), 0))).slice(0, 16);
  return { u: vecs.slice(0, AU_SUB), ref: vecs.slice(AU_SUB), sync };
}
const dot = (a, ao, b) => { let s = 0; for (let i = 0; i < b.length; i++) s += a[ao + i] * b[i]; return s; };
function auMono(chs) { if (chs.length === 1) return chs[0]; const m = new Float32Array(chs[0].length); for (const c of chs) for (let i = 0; i < m.length; i++) m[i] += c[i] / chs.length; return m; }
async function auEmbed(chs, fs, frame, pass, strength = 'std') {
  const C = await auCarriers(fs, pass), N = AU_N, m = auMono(chs), frames = Math.floor(m.length / N);
  const packet = Int8Array.from([...C.sync, ...bitsOf(new Uint8Array([frame.length - 2])), ...bitsOf(frame)]), P = packet.length;
  if (frames * AU_SUB < P) throw Error(`Audio terlalu pendek untuk pesan ini (butuh ±${Math.ceil(P / AU_SUB * N / fs)} detik). Persingkat pesan${pass ? ' atau kosongkan kata sandi' : ''}.`);
  const s = AU_S[strength] || 2.2;
  for (let j = 0, pos = 0; j < frames; j++) {
    const o = j * N, sig = Math.sqrt((dot(m, o, C.ref[0]) ** 2 + dot(m, o, C.ref[1]) ** 2) / 2);
    let rms = 0; for (let i = 0; i < N; i++) rms += m[o + i] * m[o + i]; rms = Math.sqrt(rms / N);
    for (let k = 0; k < AU_SUB; k++, pos++) {
      if (rms < 3e-4) continue; // senyap: lewati agar tidak terdengar
      const u = C.u[k], b = packet[pos % P] ? -1 : 1, alpha = s * Math.max(sig, rms * .02), xu = dot(m, o, u), dl = b * alpha - xu;
      for (const c of chs) for (let i = 0; i < N; i++) c[o + i] += dl * u[i];
      if (chs.length > 1) for (let i = 0; i < N; i++) m[o + i] += dl * u[i];
    }
  }
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = c[i] > 1 ? 1 : c[i] < -1 ? -1 : c[i];
  return { P, seconds: P / AU_SUB * N / fs };
}
function fft(re, im, inv) { // radix-2 in-place
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
/* cari posisi awal frame (0..N-1) lewat korelasi silang FFT terhadap semua pembawa */
async function auSync(m, C, J, onStep) {
  const N = AU_N, M = 2 * N, U = C.u.map(u => { const r = new Float64Array(M), i = new Float64Array(M); r.set(u); fft(r, i); return [r, i]; });
  const score = new Float64Array(N), xr = new Float64Array(M), xi = new Float64Array(M), yr = new Float64Array(M), yi = new Float64Array(M);
  for (let j = 0; j < J; j++) {
    const o = j * N; if (o + M > m.length) break;
    let e = 0; for (let n = 0; n < M; n++) { xr[n] = m[o + n]; xi[n] = 0; e += xr[n] * xr[n]; }
    if (e < 1e-6) continue; fft(xr, xi);
    for (const [ur, ui] of U) {
      for (let n = 0; n < M; n++) { yr[n] = xr[n] * ur[n] + xi[n] * ui[n]; yi[n] = xi[n] * ur[n] - xr[n] * ui[n]; } // X·conj(U)
      fft(yr, yi, true);
      for (let l = 0; l < N; l++) score[l] += yr[l] * yr[l] / e;
    }
    if (j % 16 === 0) { onStep?.(j / J * .7); await frame(); }
  }
  let best = 0; for (let l = 1; l < N; l++) if (score[l] > score[best]) best = l;
  return best;
}
async function auDetect(chs, fs, pass, onStep) {
  const C = await auCarriers(fs, pass), N = AU_N, m = auMono(chs), J = Math.min(Math.floor(m.length / N) - 2, 160);
  if (J < 8) return null;
  const best = await auSync(m, C, J, onStep);
  const frames = Math.floor((m.length - best) / N), soft = [];
  for (let j = 0; j < frames; j++) { const b = best + j * N, sg = Math.sqrt((dot(m, b, C.ref[0]) ** 2 + dot(m, b, C.ref[1]) ** 2) / 2) + 1e-9; for (const u of C.u) soft.push(clamp(dot(m, b, u) / sg, -4, 4)); }
  onStep?.(.85);
  const hard = soft.map(v => v < 0 ? 1 : 0), S = C.sync;
  for (let q = 0; q + 24 < hard.length; q++) {
    let err = 0; for (let i = 0; i < 16 && err < 3; i++) if (hard[q + i] !== S[i]) err++;
    if (err > 2) continue;
    // panjang (soft gabungan dari semua pengulangan kandidat dilakukan setelah P diketahui)
    const len = bytesOf(Int8Array.from(hard.slice(q + 16, q + 24)))[0]; if (len < 10 || len > 250) continue;
    const P = 24 + (len + 2) * 8, acc = new Float64Array(P);
    let reps = 0; for (let st = q % P; st + P <= soft.length; st += P) { reps++; for (let i = 0; i < P; i++) acc[i] += soft[st + i]; }
    if (!reps) continue;
    const fr = bytesOf(Int8Array.from(acc.slice(24), v => v < 0 ? 1 : 0)), b = wmUnframe(fr);
    if (b) return { bytes: b, conf: clamp(acc.slice(24).reduce((a, v) => a + Math.abs(v), 0) / (P - 24) / reps / 2.2, 0, 1), offset: best };
  }
  return null;
}
async function decodeAudioFile(file) {
  try {
    const MB = await lib('mediabunny');
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    const t = await input.getPrimaryAudioTrack(); if (!t) throw Error('no audio');
    const fs = t.sampleRate, nc = Math.min(2, t.numberOfChannels), parts = Array.from({ length: nc }, () => []); let total = 0;
    for await (const smp of new MB.AudioSampleSink(t).samples()) {
      const n = smp.numberOfFrames;
      for (let c = 0; c < nc; c++) { const a = new Float32Array(n); smp.copyTo(a, { planeIndex: c, format: 'f32-planar' }); parts[c].push(a); }
      total += n; smp.close();
    }
    const chs = parts.map(p => { const o = new Float32Array(total); let i = 0; for (const a of p) { o.set(a, i); i += a.length; } return o; });
    return { chs, fs };
  } catch (e) {
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    return { chs: Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => new Float32Array(buf.getChannelData(c))), fs: buf.sampleRate };
  }
}
function wavEncode(chs, fs, extraChunks = []) {
  const nc = chs.length, n = chs[0].length, data = 44 + n * nc * 2, extra = extraChunks.reduce((a, c) => a + 8 + c.body.length + (c.body.length & 1), 0);
  const buf = new ArrayBuffer(data + extra), v = new DataView(buf), w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, buf.byteLength - 8, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++, o += 2) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, Math.round(s * 32767), true); }
  for (const c of extraChunks) { w(o, c.id); v.setUint32(o + 4, c.body.length, true); new Uint8Array(buf, o + 8, c.body.length).set(c.body); o += 8 + c.body.length + (c.body.length & 1); }
  return new Blob([buf], { type: 'audio/wav' });
}
function riffChunks(bytes) { // daftar chunk WAV
  const out = []; if (bytes.length < 12 || TD.decode(bytes.slice(0, 4)) !== 'RIFF') return out;
  const v = new DataView(bytes.buffer, bytes.byteOffset); let o = 12;
  while (o + 8 <= bytes.length) { const id = TD.decode(bytes.slice(o, o + 4)), len = v.getUint32(o + 4, true); out.push({ id, off: o + 8, len }); o += 8 + len + (len & 1); }
  return out;
}

/* ---------------- TEKS: steganografi karakter lebar-nol ---------------- */
const ZW = ['​', '‌', '‍', '⁠'], ZW_A = '⁣', ZW_B = '⁤';
const zwEncode = b => ZW_A + Array.from(b, x => ZW[x >> 6] + ZW[x >> 4 & 3] + ZW[x >> 2 & 3] + ZW[x & 3]).join('') + ZW_B;
function zwFind(text) {
  const out = [], re = /⁣([​‌‍⁠]+)⁤/g; let m;
  while ((m = re.exec(text))) { const s = m[1]; if (s.length % 4) continue; const b = new Uint8Array(s.length / 4); for (let i = 0; i < b.length; i++) for (let k = 0; k < 4; k++) b[i] = b[i] << 2 | ZW.indexOf(s[i * 4 + k]); const u = wmUnframe(b); if (u) out.push(u); }
  return out;
}
const zwStrip = t => t.replace(/⁣[​‌‍⁠]*⁤/g, '');
function zwInjectPlain(text, code) { // setelah kata pertama di tiap ±5 paragraf (maks 24 salinan)
  const lines = zwStrip(text).split('\n'); let n = 0, done = 0;
  for (let i = 0; i < lines.length && done < 24; i++) {
    const l = lines[i], sp = l.search(/\S\s/); if (sp < 0) continue;
    if (n++ % 5) continue; lines[i] = l.slice(0, sp + 1) + code + l.slice(sp + 1); done++;
  }
  if (!done) return code + text;
  return lines.join('\n');
}
function zwInjectMarkup(xml, tagRe, code, every = 4, max = 24) { // sisip ke node teks <w:t>/<a:t>
  let n = 0, done = 0;
  return xml.replace(tagRe, (all, open, txt, close) => {
    if (done >= max || !/\S\s/.test(txt) || n++ % every) return all;
    const sp = txt.search(/\S\s/) + 1; done++;
    return open + txt.slice(0, sp) + code + txt.slice(sp) + close;
  });
}
function zwInjectHtml(html, code) {
  let out = '', i = 0, done = 0, n = 0, skip = false;
  while (i < html.length) {
    if (html[i] === '<') { const j = html.indexOf('>', i); const tag = html.slice(i, j + 1); skip = /^<(script|style|title|textarea)\b/i.test(tag) ? true : /^<\/(script|style|title|textarea)/i.test(tag) ? false : skip; out += tag; i = j < 0 ? html.length : j + 1; continue; }
    const j = html.indexOf('<', i), seg = html.slice(i, j < 0 ? html.length : j);
    const sp = seg.search(/[^\s&;]\s/);
    if (!skip && sp >= 0 && done < 24 && !(n++ % 3)) { out += seg.slice(0, sp + 1) + code + seg.slice(sp + 1); done++; } else out += seg;
    i = j < 0 ? html.length : j;
  }
  return out;
}

/* ---------------- deteksi jenis file → metode ---------------- */
const WM_TEXT = ['txt', 'md', 'csv', 'html', 'htm', 'srt', 'vtt', 'log', 'tex'];
const WM_AUDIO = ['wav', 'mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba'];
const WM_VIDEO = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
function wmKind(f) {
  const e = extOf(f.name);
  if (e === 'pdf' || f.type === 'application/pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'].includes(e) || /^image\//.test(f.type)) return 'image';
  if (e === 'docx') return 'docx'; if (e === 'pptx') return 'pptx'; if (e === 'xlsx') return 'xlsx';
  if (WM_TEXT.includes(e) || /^text\//.test(f.type)) return 'text';
  if (WM_VIDEO.includes(e) || /^video\//.test(f.type)) return 'video';
  if (WM_AUDIO.includes(e) || /^audio\//.test(f.type)) return 'audio';
  return null;
}
const WM_METHOD = {
  basic: { pdf: 'Stempel teks/logo di setiap halaman', image: 'Stempel teks/logo di atas gambar', video: 'Stempel di setiap frame (MP4)', docx: 'Watermark diagonal di header Word', pptx: 'Kotak teks transparan di setiap slide', xlsx: 'Teks di header cetak tiap sheet', text: 'Baris penanda di awal & akhir', audio: 'Tag hak cipta & komentar (MP3/WAV)' },
  advanced: { pdf: 'Data terenkripsi di struktur halaman PDF', image: 'Pola grain adaptif + kode koreksi Viterbi', video: 'Pola luminans di setiap frame + koreksi Viterbi (MP4)', docx: 'Karakter lebar-nol + properti terenkripsi', pptx: 'Karakter lebar-nol + properti terenkripsi', xlsx: 'Properti dokumen terenkripsi', text: 'Karakter lebar-nol tersembunyi', audio: 'Spread-spectrum 1–5 kHz · tahan MP3 (WAV)' },
};
const WM_ROBUST = {
  pdf: 'Bertahan saat disalin, digabung, dipisah, atau dikompres strukturnya. Hilang bila dicetak/di-scan atau dirasterisasi.',
  image: 'Bertahan saat dikompres ulang (JPEG ≥50), di-resize hingga ±60%, diputar 90°, atau diubah kecerahan/kontrasnya. Paling andal untuk foto ≥1000 px. Hilang bila dipotong (crop) atau difilter berat.',
  video: 'Bertahan saat dikompres ulang (H.264/VP9), diturunkan ke 480p, atau dipotong durasinya. Mode Kuat paling tahan, tapi pola samar bisa terlihat di area polos. Hilang bila bingkai di-crop.',
  docx: 'Karakter tersembunyi ikut terbawa saat teks disalin ke dokumen lain. Bisa hilang bila teks diketik ulang.',
  pptx: 'Karakter tersembunyi ikut terbawa saat teks disalin. Bisa hilang bila teks diketik ulang.',
  xlsx: 'Tersimpan di properti file. Hilang bila data disalin ke workbook baru.',
  text: 'Ikut terbawa saat teks disalin-tempel. Hilang bila karakter tak terlihat dibersihkan.',
  audio: 'Bertahan saat dikonversi ke MP3/AAC (≥96 kbps), volumenya diubah, atau bagian awalnya dipotong. Hilang bila dipercepat, di-pitch, atau sample rate-nya diubah.',
};

/* ---------------- ADVANCED: sematkan ---------------- */
async function wmAdvanced(f, o, prog) {
  const kind = wmKind(f.file), base = baseName(f.name), ext = extOf(f.name);
  prog(.05, 'Mengenkripsi pesan…');
  const packed = await wmPack(o.wmText, o.wmPass || ''), framed = wmFrame(packed);
  const pass = o.wmPass || '';
  if (kind === 'image') {
    prog(.2, 'Menyematkan pola tak terlihat…');
    const img = await decodeImage(f.file), c = canvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0); const id = g.getImageData(0, 0, c.width, c.height);
    await gridEmbed(rgbaAccess(id), framed, pass, o.wmStrength); g.putImageData(id, 0, 0);
    const outExt = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : ['jpg', 'jpeg'].includes(ext) ? 'jpg' : 'png';
    const blob = await toBlob(c, { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[outExt], .95);
    prog(.85, 'Memverifikasi…');
    const chk = await wmDetectImage(await decodeImage(blob), pass);
    return { name: `${base}-wm.${outExt}`, blob, verified: !!chk };
  }
  if (kind === 'audio') {
    prog(.1, 'Membaca audio…'); const { chs, fs } = await decodeAudioFile(f.file);
    prog(.4, 'Menyematkan spread-spectrum…'); await frame();
    await auEmbed(chs, fs, framed, pass, o.wmStrength);
    prog(.8, 'Memverifikasi…'); await frame();
    const blob = wavEncode(chs, fs, [{ id: 'pwlm', body: framed }]);
    // verifikasi di sinyal (setelah kuantisasi 16-bit), bukan dari chunk
    const q = chs.map(c => Float32Array.from(c, v => Math.round(Math.max(-1, Math.min(1, v)) * 32767) / 32767));
    const chk = await auDetect(q, fs, pass);
    return { name: `${base}-wm.wav`, blob, verified: !!chk, note: 'Disimpan sebagai WAV (lossless) agar kualitas terjaga.' };
  }
  if (kind === 'video') {
    const ctx = {};
    const blob = await videoTranscode(f.file, { y: async Yp => { await gridEmbed(planeAccess(Yp), framed, pass, o.wmStrength, ctx, VIDEO_OPT); } }, prog);
    prog(.97, 'Memverifikasi…');
    const chk = await wmDetectVideo(new File([blob], 'x.mp4', { type: 'video/mp4' }), pass, 6);
    return { name: `${base}-wm.mp4`, blob, verified: !!chk };
  }
  if (kind === 'pdf') {
    const L = await lib('pdflib'), doc = await loadForEdit(f.bytes || new Uint8Array(await f.file.arrayBuffer())), hex = L.PDFHexString.of(toHex(framed));
    doc.getInfoDict().set(L.PDFName.of('PiawaiLab'), hex);
    const stamp = L.PDFString.of('D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14));
    doc.getPages().forEach(pg => pg.node.set(L.PDFName.of('PieceInfo'), doc.context.obj({ PiawaiLab: { LastModified: stamp, Private: hex } })));
    const blob = await savePdf(doc);
    const chk = await wmDetectPdf(new Uint8Array(await blob.arrayBuffer()), pass);
    return { name: `${base}-wm.pdf`, blob, verified: !!chk.length };
  }
  if (['docx', 'pptx', 'xlsx'].includes(kind)) {
    const JSZip = await lib('jszip'), z = await JSZip.loadAsync(f.file), code = zwEncode(framed);
    await ooxmlSetCustom(z, b64(framed));
    if (kind === 'docx') for (const p of Object.keys(z.files).filter(p => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))) z.file(p, zwInjectMarkup(zwStripXml(await z.file(p).async('string')), /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, code, p.includes('document') ? 4 : 1, p.includes('document') ? 24 : 2));
    if (kind === 'pptx') for (const p of Object.keys(z.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))) z.file(p, zwInjectMarkup(zwStripXml(await z.file(p).async('string')), /(<a:t>)([^<]*)(<\/a:t>)/g, code, 2, 4));
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: f.file.type || 'application/octet-stream' });
    const chk = await wmDetectOoxml(blob, pass);
    return { name: `${base}-wm.${ext}`, blob, verified: !!chk.length };
  }
  if (kind === 'text') {
    const txt = await f.file.text(), code = zwEncode(framed);
    const out = ['html', 'htm'].includes(ext) ? zwInjectHtml(zwStrip(txt), code) : zwInjectPlain(txt, code);
    const blob = new Blob([out], { type: (f.file.type || 'text/plain') + ';charset=utf-8' });
    return { name: `${base}-wm.${ext}`, blob, verified: zwFind(out).length > 0 };
  }
  throw Error('Jenis file ini belum didukung.');
}
const zwStripXml = s => zwStrip(s);
async function ooxmlSetCustom(z, value) {
  const P = 'docProps/custom.xml', NS = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
  let xml = z.file(P) ? await z.file(P).async('string') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="${NS}" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`;
  xml = xml.replace(/<property[^>]*name="PiawaiLab"[^>]*>[\s\S]*?<\/property>/g, '');
  const pid = Math.max(1, ...[...xml.matchAll(/pid="(\d+)"/g)].map(m => +m[1])) + 1;
  xml = xml.replace(/<\/Properties>\s*$/, `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" name="PiawaiLab"><vt:lpwstr>${value}</vt:lpwstr></property></Properties>`);
  z.file(P, xml);
  let ct = await z.file('[Content_Types].xml').async('string');
  if (!ct.includes('/docProps/custom.xml')) ct = ct.replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>');
  z.file('[Content_Types].xml', ct);
  let rels = await z.file('_rels/.rels').async('string');
  if (!rels.includes('docProps/custom.xml')) rels = rels.replace('</Relationships>', '<Relationship Id="rIdPWL0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>');
  z.file('_rels/.rels', rels);
}

/* ---------------- ADVANCED: deteksi ---------------- */
async function wmDetectImage(img, pass) {
  const s = Math.min(1, 2400 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const W = Math.round((img.naturalWidth || img.width) * s), H = Math.round((img.naturalHeight || img.height) * s);
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H);
  for (const r of [0, 90, 270, 180]) { // gambar yang diputar ulang juga dicoba
    const Yp = { Y: Uint8Array.from({ length: W * H }, (_, i) => .299 * id.data[i * 4] + .587 * id.data[i * 4 + 1] + .114 * id.data[i * 4 + 2]), off: 0, stride: W, W, H };
    const sets = {}; await gridCollect(sets, planeAccess(r ? planeRotate(Yp, r) : Yp), pass);
    const res = await gridDecode(sets, pass); if (res) return res;
  }
  return null;
}
async function sampleY(sample) { // akses bidang Y dari frame 8-bit (I420/I422/I444/NV12); selain itu via kanvas
  const fmt = sample.format, vr = sample.visibleRect;
  if (/^(I420|I420A|I422|I444|NV12)$/.test(fmt || '')) {
    const buf = new Uint8Array(sample.allocationSize()), layout = await sample.copyTo(buf);
    return { buf, layout, fmt, Y: buf, off: layout[0].offset + vr.top * layout[0].stride + vr.left, stride: layout[0].stride, W: vr.width, H: vr.height };
  }
  const W = sample.displayWidth, H = sample.displayHeight, c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  sample.draw(g, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, Y = new Uint8Array(W * H);
  for (let i = 0; i < Y.length; i++) Y[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  return { Y, off: 0, stride: W, W, H, rgbOnly: true };
}
async function wmDetectVideo(file, pass, samples = 18, onStep) {
  const MB = await lib('mediabunny'), input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack(); if (!vt) throw Error('Tidak ada trek video.');
  const dur = await vt.computeDuration(), sink = new MB.VideoSampleSink(vt), planes = [];
  for (let i = 0; i < samples; i++) {
    onStep?.(i / samples * .8, `Membaca frame ${i + 1}/${samples}…`);
    const smp = await sink.getSample(dur * (.02 + .96 * i / Math.max(1, samples - 1))); if (!smp) continue;
    const Yp = await sampleY(smp); smp.close();
    planes.push(planeDown(Yp, Math.ceil(Math.max(Yp.W, Yp.H) / 1280)));
  }
  for (const r of [0, 90, 270, 180]) {
    onStep?.(.85, 'Menganalisis pola frame…'); await frame();
    const sets = {}; for (const p of planes) await gridCollect(sets, planeAccess(r ? planeRotate(p, r) : p), pass, TPL_VID);
    const res = await gridDecode(sets, pass, TPL_VID); if (res) return res;
  }
  return null;
}
async function wmDetectPdf(bytes, pass) {
  const L = await lib('pdflib'), doc = await loadForEdit(bytes), found = [];
  const take = (v, where) => { const raw = v?.asBytes?.(); if (!raw) return; const b = wmUnframe(raw); if (b) found.push({ bytes: b, where }); };
  take(doc.getInfoDict().lookup(L.PDFName.of('PiawaiLab')), 'Info dokumen');
  doc.getPages().forEach((pg, i) => { const pi = pg.node.lookup(L.PDFName.of('PieceInfo')); const d = pi?.lookup?.(L.PDFName.of('PiawaiLab')); if (d) take(d.lookup(L.PDFName.of('Private')), `Halaman ${i + 1}`); });
  return found;
}
async function wmDetectOoxml(file, pass) {
  const JSZip = await lib('jszip'), z = await JSZip.loadAsync(file), found = [];
  const cx = z.file('docProps/custom.xml'); if (cx) { const m = (await cx.async('string')).match(/name="PiawaiLab"[^>]*>\s*<vt:lpwstr>([^<]+)</); if (m) { try { const b = wmUnframe(unb64(m[1])); if (b) found.push({ bytes: b, where: 'Properti dokumen' }); } catch { } } }
  for (const p of Object.keys(z.files).filter(p => /^(word\/(document|header\d*|footer\d*)|ppt\/slides\/slide\d+)\.xml$/.test(p))) {
    const t = (await z.file(p).async('string')).replace(/<[^>]+>/g, '');
    for (const b of zwFind(t)) found.push({ bytes: b, where: 'Teks tersembunyi' });
  }
  return found;
}
async function wmDetect(f, o, prog) {
  const kind = wmKind(f.file), pass = o.wmPass || '';
  let hits = [], method = WM_METHOD.advanced[kind] || '—';
  const add = async (bytes, where, conf) => { const r = await wmUnpack(bytes, pass); if (r) hits.push({ ...r, where, conf }); };
  if (kind === 'image') { prog(.3, 'Menganalisis pola piksel…'); const r = await wmDetectImage(await decodeImage(f.file), pass); if (r) await add(r.bytes, 'Pola piksel', r.conf); }
  else if (kind === 'video') { const r = await wmDetectVideo(f.file, pass, 18, (p, m) => prog(p, m)); if (r) await add(r.bytes, 'Pola frame video', r.conf); }
  else if (kind === 'audio') {
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const ch = riffChunks(bytes).find(c => c.id === 'pwlm'); if (ch) { const b = wmUnframe(bytes.slice(ch.off, ch.off + ch.len)); if (b) await add(b, 'Chunk WAV', 1); }
    prog(.15, 'Membaca audio…'); const { chs, fs } = await decodeAudioFile(f.file);
    const r = await auDetect(chs, fs, pass, p => prog(.2 + p * .75, 'Menganalisis sinyal audio…')); if (r) await add(r.bytes, 'Sinyal audio', r.conf);
  }
  else if (kind === 'pdf') { for (const h of await wmDetectPdf(f.bytes || new Uint8Array(await f.file.arrayBuffer()), pass)) await add(h.bytes, h.where, 1); }
  else if (['docx', 'pptx', 'xlsx'].includes(kind)) { for (const h of await wmDetectOoxml(f.file, pass)) await add(h.bytes, h.where, 1); }
  else if (kind === 'text') { for (const b of zwFind(await f.file.text())) await add(b, 'Karakter lebar-nol', 1); }
  // gabungkan temuan yang sama
  const uniq = new Map(); for (const h of hits) { const k = (h.msg ?? '🔒') + '|' + h.ts; const u = uniq.get(k); if (u) { u.where.add(h.where); u.conf = Math.max(u.conf, h.conf); } else uniq.set(k, { ...h, where: new Set([h.where]) }); }
  return { kind, method, results: [...uniq.values()].map(h => ({ ...h, where: [...h.where] })) };
}

/* ---------------- BASIC (terlihat) ---------------- */
function rgbaToYuv(rgba, W, H, t, cs) { // tulis kembali kanvas RGBA ke bidang YUV sumber (matriks & rentang sesuai sumber)
  const m = cs?.matrix, [kr, kb] = m === 'bt709' ? [.2126, .0722] : m === 'bt2020-ncl' ? [.2627, .0593] : [.299, .114], kg = 1 - kr - kb, full = !!cs?.fullRange;
  const ys = full ? 255 : 219, yo = full ? 0 : 16, cs_ = full ? 255 : 224;
  const L = t.layout, buf = t.buf, vr = t.vr, sx = t.fmt === 'I444' ? 1 : 2, sy = /^(I420|I420A|NV12)$/.test(t.fmt) ? 2 : 1;
  const Yo = L[0].offset + vr.top * L[0].stride + vr.left;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; buf[Yo + y * L[0].stride + x] = Math.round(yo + ys * (kr * rgba[o] + kg * rgba[o + 1] + kb * rgba[o + 2]) / 255); }
  for (let y = 0; y < H / sy; y++) for (let x = 0; x < W / sx; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const px = x * sx + i, py = y * sy + j; if (px >= W || py >= H) continue; const o = (py * W + px) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n++; }
    r /= n * 255; g /= n * 255; b /= n * 255; const Yv = kr * r + kg * g + kb * b;
    const cb = Math.round(128 + cs_ * (b - Yv) / (2 * (1 - kb))), cr = Math.round(128 + cs_ * (r - Yv) / (2 * (1 - kr)));
    const cx = x + (vr.left / sx | 0), cy = y + (vr.top / sy | 0);
    if (t.fmt === 'NV12') { const o = L[1].offset + cy * L[1].stride + cx * 2; buf[o] = clamp(cb, 0, 255); buf[o + 1] = clamp(cr, 0, 255); }
    else { buf[L[1].offset + cy * L[1].stride + cx] = clamp(cb, 0, 255); buf[L[2].offset + cy * L[2].stride + cx] = clamp(cr, 0, 255); }
  }
}
/* transcode video → MP4. hooks.y(Yp) mengubah luminans langsung (warna asli tidak tersentuh);
   hooks.rgba(ctx, W, H) menggambar di atas frame (dipakai watermark terlihat). */
async function videoTranscode(file, hooks, prog) {
  const MB = await lib('mediabunny');
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack(); if (!vt) throw Error('File ini tidak memiliki trek video.');
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
  let cv, g;
  const conv = await MB.Conversion.init({
    input, output,
    video: {
      forceTranscode: true, bitrate: MB.QUALITY_HIGH,
      process: async sample => {
        const fmt = sample.format, vr = sample.visibleRect, init = { timestamp: sample.timestamp, duration: sample.duration };
        if (/^(I420|I420A|I422|I444|NV12)$/.test(fmt || '')) {
          const buf = new Uint8Array(sample.allocationSize()), layout = await sample.copyTo(buf);
          if (hooks.y) await hooks.y({ Y: buf, off: layout[0].offset + vr.top * layout[0].stride + vr.left, stride: layout[0].stride, W: vr.width, H: vr.height });
          if (hooks.rgba) {
            const W = vr.width, H = vr.height; if (!cv) { cv = new OffscreenCanvas(W, H); g = cv.getContext('2d', { willReadFrequently: true }); }
            g.clearRect(0, 0, W, H); sample.draw(g, 0, 0, W, H); hooks.rgba(g, W, H);
            rgbaToYuv(g.getImageData(0, 0, W, H).data, W, H, { buf, layout, vr, fmt }, sample.colorSpace);
          }
          return new MB.VideoSample(buf, { ...init, format: fmt, codedWidth: sample.codedWidth, codedHeight: sample.codedHeight, layout, visibleRect: vr, colorSpace: sample.colorSpace.toJSON(), rotation: sample.rotation });
        }
        // format lain (mis. 10-bit/HDR): lewat kanvas RGB
        const W = sample.displayWidth, H = sample.displayHeight; if (!cv) { cv = new OffscreenCanvas(W, H); g = cv.getContext('2d', { willReadFrequently: true }); }
        g.clearRect(0, 0, W, H); sample.draw(g, 0, 0, W, H);
        if (hooks.y) { const id = g.getImageData(0, 0, W, H), Y = new Uint8Array(W * H); for (let i = 0; i < Y.length; i++) Y[i] = .299 * id.data[i * 4] + .587 * id.data[i * 4 + 1] + .114 * id.data[i * 4 + 2]; const Y0 = Y.slice(); await hooks.y({ Y, off: 0, stride: W, W, H }); for (let i = 0; i < Y.length; i++) { const dlt = Y[i] - Y0[i]; if (dlt) { id.data[i * 4] += dlt; id.data[i * 4 + 1] += dlt; id.data[i * 4 + 2] += dlt; } } g.putImageData(id, 0, 0); }
        if (hooks.rgba) hooks.rgba(g, W, H);
        return new MB.VideoSample(cv, init);
      }
    },
  });
  if (!conv.isValid) throw Error('Browser ini tidak bisa mengolah video tersebut: ' + conv.discardedTracks.map(t => t.reason).join(', '));
  conv.onProgress = p => prog(.05 + p * .9, `Mengolah video… ${Math.round(p * 100)}%`);
  await conv.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
function id3Frame(id, payload, v4) {
  const h = new Uint8Array(10); h.set(TE.encode(id)); const n = payload.length;
  if (v4) { h[4] = n >> 21 & 127; h[5] = n >> 14 & 127; h[6] = n >> 7 & 127; h[7] = n & 127; } else h.set(u32(n), 4);
  return cat(h, payload);
}
function id3Text(s, v4) { if (v4) return cat(new Uint8Array([3]), TE.encode(s)); const u = new Uint8Array(2 + s.length * 2); u[0] = 0xFF; u[1] = 0xFE; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[2 + i * 2] = c & 255; u[3 + i * 2] = c >> 8; } return cat(new Uint8Array([1]), u); }
function mp3Tag(bytes, text) {
  let v4 = false, rest = bytes, old = new Uint8Array(0);
  if (TD.decode(bytes.slice(0, 3)) === 'ID3') {
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9], flags = bytes[5];
    rest = bytes.slice(10 + size + (flags & 0x10 ? 10 : 0));
    if ((bytes[3] === 3 || bytes[3] === 4) && !(flags & 0xC0)) { // salin frame lama apa adanya (tanpa padding)
      v4 = bytes[3] === 4; const fr = bytes.slice(10, 10 + size); let o = 0;
      while (o + 10 <= fr.length && /^[A-Z0-9]{4}$/.test(TD.decode(fr.slice(o, o + 4)))) { const n = v4 ? (fr[o + 4] << 21) | (fr[o + 5] << 14) | (fr[o + 6] << 7) | fr[o + 7] : rd32(fr, o + 4); if (o + 10 + n > fr.length) break; o += 10 + n; }
      old = fr.slice(0, o);
    }
  }
  const txt = id3Text(text, v4), comm = cat(v4 ? new Uint8Array([3, 0x69, 0x6E, 0x64, 0]) : new Uint8Array([1, 0x69, 0x6E, 0x64, 0xFF, 0xFE, 0, 0]), txt.slice(1));
  const frames = cat(old, id3Frame('TCOP', txt, v4), id3Frame('COMM', comm, v4), id3Frame('TXXX', cat(txt.slice(0, 1), v4 ? TE.encode('PiawaiLab\0') : new Uint8Array([0xFF, 0xFE, ...[...'PiawaiLab'].flatMap(c => [c.charCodeAt(0), 0]), 0, 0]), txt.slice(1)), v4));
  const n = frames.length, head = new Uint8Array([0x49, 0x44, 0x33, v4 ? 4 : 3, 0, 0, n >> 21 & 127, n >> 14 & 127, n >> 7 & 127, n & 127]);
  return cat(head, frames, rest);
}
function wavInfo(bytes, text) {
  const sub = (id, s) => { const b = TE.encode(s + '\0'); const pad = b.length & 1 ? new Uint8Array(1) : new Uint8Array(0); const h = new Uint8Array(8); h.set(TE.encode(id)); new DataView(h.buffer).setUint32(4, b.length, true); return cat(h, b, pad); };
  const body = cat(TE.encode('INFO'), sub('ICOP', text), sub('ICMT', text)), h = new Uint8Array(8); h.set(TE.encode('LIST')); new DataView(h.buffer).setUint32(4, body.length, true);
  const out = cat(bytes.length & 1 ? cat(bytes, new Uint8Array(1)) : bytes, h, body); new DataView(out.buffer).setUint32(4, out.length - 8, true); return out;
}
const xmlEsc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const VML_NS = 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"';
function docxWmPara(o) {
  const t = xmlEsc(o.text.trim()), len = Math.max(4, o.text.trim().length), w = 470, h = Math.min(150, Math.round(w / len * 1.7));
  const rot = ((360 - Math.round(o.angle)) % 360 + 360) % 360, op = (o.opacity / 100).toFixed(2);
  return `<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype><v:shape id="PiawaiLabWaterMark" o:spid="_x0000_s9001" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:${w}pt;height:${h}pt;rotation:${rot};z-index:-251654144;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="${o.color}" stroked="f"><v:fill opacity="${op}"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt;font-weight:bold" string="${t}"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p>`;
}
async function docxBasic(z, o) {
  const para = docxWmPara(o);
  let doc = await z.file('word/document.xml').async('string');
  let rels = await z.file('word/_rels/document.xml.rels').async('string');
  const relTarget = id => (rels.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*>`)) || [''])[0].match(/Target="([^"]+)"/)?.[1];
  const injectHdr = async path => { let x = await z.file(path).async('string'); if (x.includes('PiawaiLabWaterMark')) return; if (!/xmlns:v=/.test(x)) x = x.replace(/<w:hdr\b/, `<w:hdr ${VML_NS}`); else { if (!/xmlns:o=/.test(x)) x = x.replace(/<w:hdr\b/, '<w:hdr xmlns:o="urn:schemas-microsoft-com:office:office"'); if (!/xmlns:w10=/.test(x)) x = x.replace(/<w:hdr\b/, '<w:hdr xmlns:w10="urn:schemas-microsoft-com:office:word"'); } x = x.replace(/<\/w:hdr>\s*$/, para + '</w:hdr>'); z.file(path, x); };
  let ours = null;
  const ensureOurs = () => {
    if (ours) return ours; ours = 'rIdPWLhdr';
    z.file('word/header_piawailab.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ${VML_NS}>${para}</w:hdr>`);
    rels = rels.replace('</Relationships>', `<Relationship Id="${ours}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header_piawailab.xml"/></Relationships>`);
    return ours;
  };
  const sects = [...doc.matchAll(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g)];
  if (!sects.length) { doc = doc.replace(/<\/w:body>/, '<w:sectPr></w:sectPr></w:body>'); return docxBasic(z.file('word/document.xml', doc), o); }
  let out = doc;
  for (const m of sects.reverse()) {
    let s = m[0]; if (s.endsWith('/>')) s = s.replace(/\/>$/, '></w:sectPr>');
    const refs = [...s.matchAll(/<w:headerReference[^>]*w:type="(\w+)"[^>]*r:id="([^"]+)"[^>]*\/>|<w:headerReference[^>]*r:id="([^"]+)"[^>]*w:type="(\w+)"[^>]*\/>/g)].map(r => ({ type: r[1] || r[4], id: r[2] || r[3] }));
    const need = ['default', ...(/<w:titlePg(\s|\/|>)/.test(s) && !/<w:titlePg[^>]*w:val="(0|false)"/.test(s) ? ['first'] : []), ...(/w:evenAndOddHeaders/.test(await z.file('word/settings.xml')?.async('string') || '') ? ['even'] : [])];
    for (const type of need) {
      const r = refs.find(x => x.type === type);
      if (r) { const tgt = relTarget(r.id); if (tgt) await injectHdr('word/' + tgt.replace(/^\/?word\//, '')); }
      else s = s.replace(/<w:sectPr\b([^>]*)>/, `<w:sectPr$1><w:headerReference w:type="${type}" r:id="${ensureOurs()}"/>`);
    }
    out = out.slice(0, m.index) + s + out.slice(m.index + m[0].length);
  }
  if (ours) {
    let ct = await z.file('[Content_Types].xml').async('string');
    ct = ct.replace('</Types>', '<Override PartName="/word/header_piawailab.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
    z.file('[Content_Types].xml', ct); z.file('word/_rels/document.xml.rels', rels);
    if (!/xmlns:r=/.test(out.slice(0, 2000))) out = out.replace(/<w:document\b/, '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  z.file('word/document.xml', out);
}
async function pptxBasic(z, o) {
  const pres = await z.file('ppt/presentation.xml').async('string'), sz = pres.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/) || [0, 12192000, 6858000];
  const cx = +sz[1], cy = +sz[2], w = Math.round(cx * .8), h = Math.round(cy * .3), col = o.color.slice(1).toUpperCase(), a = Math.round(o.opacity * 1000);
  for (const p of Object.keys(z.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))) {
    let x = await z.file(p).async('string'); if (x.includes('PiawaiLab Watermark')) continue;
    const id = Math.max(1, ...[...x.matchAll(/<p:cNvPr[^>]*\bid="(\d+)"/g)].map(m => +m[1])) + 1;
    const sp = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="PiawaiLab Watermark"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm rot="${-Math.round(o.angle * 60000)}"><a:off x="${Math.round((cx - w) / 2)}" y="${Math.round((cy - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="id-ID" sz="${Math.round(o.size * 100)}" b="1"><a:solidFill><a:srgbClr val="${col}"><a:alpha val="${a}"/></a:srgbClr></a:solidFill></a:rPr><a:t>${xmlEsc(o.text.trim())}</a:t></a:r></a:p></p:txBody></p:sp>`;
    z.file(p, x.replace(/<\/p:spTree>/, sp + '</p:spTree>'));
  }
}
async function xlsxBasic(z, o) {
  const hdr = `&amp;C&amp;"-,Bold"&amp;16${xmlEsc(o.text.trim().replace(/&/g, '&&'))}`;
  const after = /<(rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/;
  for (const p of Object.keys(z.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) {
    let x = await z.file(p).async('string');
    if (/<headerFooter\b/.test(x)) x = /<oddHeader>/.test(x) ? x.replace(/<oddHeader>[\s\S]*?<\/oddHeader>/, `<oddHeader>${hdr}</oddHeader>`) : x.replace(/<headerFooter([^>]*)\/>/, `<headerFooter$1><oddHeader>${hdr}</oddHeader></headerFooter>`).replace(/<headerFooter([^>]*)>(?!<oddHeader)/, `<headerFooter$1><oddHeader>${hdr}</oddHeader>`);
    else { const m = x.match(after), ins = `<headerFooter><oddHeader>${hdr}</oddHeader></headerFooter>`; x = m ? x.slice(0, m.index) + ins + x.slice(m.index) : x.replace(/<\/worksheet>\s*$/, ins + '</worksheet>'); }
    z.file(p, x);
  }
}
async function wmBasic(f, o, prog) {
  const kind = wmKind(f.file), base = baseName(f.name), ext = extOf(f.name);
  const so = { kind: o.kind, text: o.text, size: o.size, color: o.color, opacity: o.opacity, angle: o.angle, layout: o.layout, image: o.image, scale: o.scale };
  if (kind === 'pdf') return pdfWatermarkBasic(f, so, prog);
  if (kind === 'image' || kind === 'video') {
    const st = await makeStamp(so);
    const draw = (g, W, H) => { const VW = 595, k = W / VW, [w, h] = st.sizeAt(VW); g.globalAlpha = o.opacity / 100; for (const [x, y] of stampPlaces(so, VW, H / k, w, h)) g.drawImage(st.c, x * k, y * k, w * k, h * k); g.globalAlpha = 1; };
    if (kind === 'video') return { name: `${base}-watermark.mp4`, blob: await videoTranscode(f.file, { rgba: draw }, prog) };
    const img = await decodeImage(f.file), c = canvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d'); g.drawImage(img, 0, 0); draw(g, c.width, c.height);
    const outExt = ['jpg', 'jpeg'].includes(ext) ? 'jpg' : ext === 'webp' ? 'webp' : 'png';
    return { name: `${base}-watermark.${outExt}`, blob: await toBlob(c, { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[outExt], .92) };
  }
  if (['docx', 'pptx', 'xlsx'].includes(kind)) {
    if (o.kind === 'image') throw Error('Untuk Word/PowerPoint/Excel, watermark Basic memakai teks. Pilih jenis "Teks".');
    const JSZip = await lib('jszip'), z = await JSZip.loadAsync(f.file);
    await ({ docx: docxBasic, pptx: pptxBasic, xlsx: xlsxBasic })[kind](z, so);
    return { name: `${base}-watermark.${ext}`, blob: await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: f.file.type || 'application/octet-stream' }) };
  }
  if (kind === 'text') {
    const t = await f.file.text(), mark = o.text.trim();
    let out;
    if (['html', 'htm'].includes(ext)) out = t.replace(/<body([^>]*)>/i, `<body$1><div style="position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:2147483647;font:800 ${o.size}px sans-serif;color:${o.color};opacity:${o.opacity / 100};transform:rotate(${-o.angle}deg)">${xmlEsc(mark)}</div>`);
    else if (ext === 'csv') throw Error('CSV tidak bisa diberi watermark terlihat tanpa merusak data. Gunakan mode Advanced.');
    else { const line = `──── ${mark} ────`; out = `${line}\n\n${t}\n\n${line}\n`; }
    return { name: `${base}-watermark.${ext}`, blob: new Blob([out], { type: (f.file.type || 'text/plain') + ';charset=utf-8' }) };
  }
  if (kind === 'audio') {
    const b = new Uint8Array(await f.file.arrayBuffer()), mark = o.text.trim();
    if (ext === 'mp3') return { name: `${base}-watermark.mp3`, blob: new Blob([mp3Tag(b, mark)], { type: 'audio/mpeg' }) };
    if (ext === 'wav') return { name: `${base}-watermark.wav`, blob: new Blob([wavInfo(b, mark)], { type: 'audio/wav' }) };
    throw Error('Watermark Basic audio tersedia untuk MP3 & WAV. Untuk format lain gunakan mode Advanced.');
  }
  throw Error('Jenis file ini belum didukung.');
}
