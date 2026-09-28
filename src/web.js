const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const app = express();
const port = Number(process.env.WEB_PORT || 4173);
const host = process.env.WEB_HOST || '0.0.0.0';
const apiHost = process.env.API_HOST || '127.0.0.1';
const apiPort = Number(process.env.API_PORT || 3000);
const clientDirectory = path.resolve(__dirname, '../client/dist');
const indexFile = path.join(clientDirectory, 'index.html');

if (!fs.existsSync(indexFile)) {
  throw new Error('Frontend build tidak ditemukan; jalankan npm run build sebelum start.');
}

app.use('/api', (req, res) => {
  const proxy = http.request({
    hostname: apiHost,
    port: apiPort,
    path: req.originalUrl,
    method: req.method,
    headers: { ...req.headers, host: `${apiHost}:${apiPort}` }
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });

  proxy.on('error', (error) => {
    console.error(`API proxy error: ${error.message}`);
    if (!res.headersSent) res.status(502).json({ error: 'REST API tidak dapat dijangkau' });
    else res.destroy(error);
  });

  req.pipe(proxy);
});

app.use(express.static(clientDirectory, { index: false }));
app.get('*', (req, res) => res.sendFile(indexFile));

app.listen(port, host, () => {
  console.log(`AzerothCore web client listening on http://${host}:${port}`);
});
