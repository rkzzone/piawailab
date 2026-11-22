"""Gabungkan src/ menjadi index.html.  Jalankan: python3 build.py"""
import pathlib
root = pathlib.Path(__file__).resolve().parent
src = root / 'src'
css = (src / 'styles.css').read_text()
order = ['core.js', 'office.js', 'wm.js', 'engines.js', 'tools.js', 'custom.js', 'app.js']
js = '\n'.join((src / f).read_text() for f in order)
html = (src / 'shell.html').read_text().replace('/*CSS*/', css).replace('/*JS*/', '(() => {\n' + js + '\n})();')
(root / 'index.html').write_text(html)
print(len(html))
