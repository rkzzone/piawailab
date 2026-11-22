# RapiPDF

Alat PDF & gambar yang berjalan **100% di browser** — file tidak pernah diunggah ke server.

🔗 **Coba langsung:** https://rkzzone.github.io/rapipdf/

## Fitur
Merge · Atur halaman · Split · Putar · Compress (pintar, lossless, atau rasterisasi) · PDF ke JPG/PNG/WEBP · JPG/PNG ke PDF · Word & Excel ke PDF · PDF ke Teks · Tanda tangan · Watermark · Nomor halaman · Crop (dengan deteksi otomatis) · Protect (AES-256) · Unlock · Studio gambar (hapus latar AI).

## Privasi
Semua pemrosesan terjadi di perangkat pengguna. Tidak ada server, tidak ada analitik. Yang disimpan di browser hanya pengaturan tema dan tanda tangan (jika pengguna memilih "Ingat tanda tangan").

## Menjalankan secara lokal
Unduh repo ini lalu buka `index.html` (Chrome/Edge disarankan). Folder `vendor/` harus tetap di samping `index.html`; semua alat jalan offline kecuali unduhan pertama model AI hapus latar (±54–98 MB, lalu di-cache browser).

## Struktur
- `index.html` — aplikasi siap pakai (hasil build dari `src/`)
- `src/` — kode sumber: `core.js`, `office.js`, `engines.js`, `tools.js`, `custom.js`, `app.js`, `styles.css`, `shell.html`
- `build.py` — menggabungkan `src/` menjadi `index.html` (`python3 build.py`)
- `vendor/` — pustaka pihak ketiga (lihat `NOTICE.md`)
- `tools/` — sumber bundel worker AI

## Pintasan
- `/` di beranda: cari alat
- Merge/Atur halaman: seret kartu (di ponsel: tahan lalu seret), `Ctrl/⌘ + klik`, `Shift + klik`, `Ctrl+A`, `Alt+←/→`, `R`/`Shift+R`, `Delete`, `Esc`
- `Ctrl+V`: tempel file dari clipboard

## Lisensi
GNU AGPL-3.0 — lihat `LICENSE.md` dan `NOTICE.md`.
