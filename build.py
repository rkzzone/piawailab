import pathlib
src=pathlib.Path('./src')
css=(src/'styles.css').read_text()
js='\n'.join((src/f).read_text() for f in ['core.js','office.js','engines.js','tools.js','custom.js','app.js'])
html=(src/'shell.html').read_text().replace('/*CSS*/',css).replace('/*JS*/','(() => {\n'+js+'\n})();')
pathlib.Path('./index.html').write_text(html)
print(len(html))
