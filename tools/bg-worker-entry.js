import { removeBackground } from '@imgly/background-removal';
self.onmessage = async (e) => {
  const { id, blob, model, publicPath } = e.data;
  try {
    const out = await removeBackground(blob, {
      model, publicPath, proxyToWorker: false, output: { format: 'image/png' },
      progress: (k, c, t) => self.postMessage({ id, type: 'progress', k, c, t }),
    });
    self.postMessage({ id, type: 'done', blob: out });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String((err && (err.stack || err.message)) || err) });
  }
};
