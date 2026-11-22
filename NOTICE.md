# Lisensi pihak ketiga

RapiPDF dirilis di bawah **GNU AGPL-3.0** (lihat `LICENSE.md`), karena menyertakan `@imgly/background-removal` yang berlisensi AGPL-3.0.

Pustaka yang disertakan di folder `vendor/`:

| Pustaka | Versi | Lisensi |
|---|---|---|
| pdf.js (`pdfjs-dist`) + standard_fonts + cmaps | 3.11.174 | Apache-2.0 |
| pdf-lib | 1.17.1 | MIT |
| qpdf-wasm (`@soulehshaikh99/qpdf-wasm`, qpdf 12.4.2) | 0.4.1 | Apache-2.0 |
| JSZip | 3.10.1 | MIT / GPL-3.0 (dual) |
| SheetJS Community Edition (`xlsx`) | 0.18.5 | Apache-2.0 |
| html2canvas | 1.4.1 | MIT |
| docx-preview | 0.3.6 | Apache-2.0 |
| @imgly/background-removal (+ onnxruntime-web 1.17.3, lodash, ndarray, zod) | 1.4.5 | AGPL-3.0 (onnxruntime-web: MIT) |
| Plus Jakarta Sans (`@fontsource/plus-jakarta-sans`) | 5.x | SIL OFL-1.1 |

Model AI hapus latar tidak disertakan; model diunduh dari `staticimgly.com` saat pertama dipakai.

## File turunan
- `vendor/pdf.worker.src.js` — `pdf.worker.min.js` yang dibungkus sebagai string agar bisa dijalankan dari `file://`.
- `vendor/qpdf.wasm.js` — `qpdf.wasm` dalam base64, untuk alasan yang sama.
- `vendor/bg-removal.src.js` — bundel esbuild dari `tools/bg-worker-entry.js`:
  ```
  npm i @imgly/background-removal@1.4.5 esbuild
  npx esbuild tools/bg-worker-entry.js --bundle --format=iife --minify --target=chrome100 --outfile=bg-worker.js
  ```
  lalu dibungkus sebagai `window.BG_WORKER_SRC = "<isi bg-worker.js>"`.
