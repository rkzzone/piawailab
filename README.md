# PiawaiLab

Alat PDF, dokumen & media yang berjalan **100% di browser** — file tidak pernah diunggah ke server.

🔗 **Buka:** https://rkzzone.github.io/piawailab/

## Fitur
- **Atur & gabung:** Merge PDF (campur PDF, gambar, Word, Excel), atur halaman, split, putar
- **Optimasi:** Compress pintar (gambar di dalam PDF dioptimalkan, teks tetap tajam), lossless, atau rasterisasi
- **Konversi:** PDF ↔ JPG/PNG/WEBP, Word & Excel ke PDF, PDF ke teks
- **Edit & tanda tangan:** tanda tangan (gambar/ketik/unggah), nomor halaman, crop dengan deteksi otomatis
- **Keamanan:** Protect (AES-256) & Unlock
- **Watermark untuk semua jenis file** — PDF, Word, PowerPoint, Excel, gambar, video, audio, teks:
  - *Basic*: stempel terlihat (teks/logo)
  - *Advanced*: pesan **tak terlihat**, opsional dienkripsi AES-256-GCM, metode dipilih otomatis per jenis file
  - *Periksa*: baca & verifikasi watermark dari file
- **Studio gambar:** hapus latar dengan AI, ganti latar, sesuaikan warna, crop, ubah ukuran

## Watermark tak terlihat — cara kerja
| Jenis file | Metode | Tahan terhadap |
|---|---|---|
| Gambar | Pola grain adaptif per sel (masking perseptual), bit dibaca dari tanda fitur, kode konvolusional K=7 + Viterbi | JPEG ≥50, resize ±60%, putar 90°, kecerahan/kontras |
| Video | Pola luminans di bidang Y (warna asli tak tersentuh), sel besar, akumulasi lintas frame + Viterbi | Re-encode H.264/VP9, turun ke 480p, potong durasi |
| Audio | Improved Spread Spectrum di pita 1–5 kHz (4 pembawa PN), sinkronisasi korelasi FFT | MP3/AAC ≥96 kbps, ubah volume, potong awal |
| PDF | Data terenkripsi di Info dokumen & `/PieceInfo` setiap halaman | Salin, gabung, pisah, kompres struktur |
| Word/PowerPoint | Karakter lebar-nol di teks + properti kustom | Salin-tempel teks ke dokumen lain |
| Excel | Properti kustom | Simpan ulang |
| Teks/HTML | Karakter lebar-nol | Salin-tempel |

Payload: `[versi][flag][waktu]` + pesan. Tanpa sandi → CRC32. Dengan sandi → AES-256-GCM (kunci PBKDF2-SHA256, 150.000 iterasi), dan posisi bit pada gambar/video/audio diacak dengan kunci turunan sandi.

## Privasi
Tidak ada server, tidak ada analitik. Yang disimpan di browser hanya tema, preferensi simpan, dan tanda tangan (jika dicentang "Ingat"). Service worker hanya meng-cache aset aplikasi agar bisa dipakai offline.

## Menjalankan secara lokal
Unduh repo lalu buka `index.html` (Chrome/Edge disarankan), atau jalankan server statis apa pun (`python3 -m http.server`). Folder `vendor/` harus tetap di samping `index.html`.

## Struktur
- `index.html` — aplikasi (hasil build dari `src/`)
- `src/` — kode sumber: `core.js`, `office.js`, `wm.js` (watermark), `engines.js`, `tools.js`, `custom.js`, `app.js`, `styles.css`, `shell.html`
- `build.py` — gabungkan `src/` menjadi `index.html`: `python3 build.py`
- `sw.js`, `manifest.webmanifest`, `assets/` — PWA (offline & pasang aplikasi)
- `vendor/` — pustaka pihak ketiga (lihat `NOTICE.md`)
- `tools/` — sumber bundel worker AI

## Lisensi
GNU AGPL-3.0 — lihat `LICENSE.md` dan `NOTICE.md`.
