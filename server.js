const express = require('express');
const axios = require('axios');
const https = require('https');
const http = require('http');
const config = require('./config');

const app = express();

function sanitizeInput(input) {
  return input.replace(/[^a-zA-Z0-9.\-_]/g, '');
}

function extractMediaId(input) {
  const match = sanitizeInput(input).match(/([a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9]+)?)$/);
  return match ? match[1].split('?')[0] : null;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isBot(userAgent) {
  return userAgent && ['Discordbot', 'Twitterbot', 'facebookexternalhit', 'LinkedInBot'].some(a => userAgent.includes(a));
}

async function getMediaInfo(mediaId) {
  const url = `${config.fileHostUrl}/${mediaId}`;
  let ext = mediaId.includes('.') ? mediaId.split('.').pop().toLowerCase() : null;

  try {
    const { headers } = await axios.head(url);
    if (!ext && headers['content-type']) ext = headers['content-type'].split('/').pop();
    const isVideo = config.videoTypes.includes(ext);
    const isImage = config.imageTypes.includes(ext);
    if (!isVideo && !isImage) return null;
    return {
      link: url,
      size: parseInt(headers['content-length']) || 0,
      type: isVideo ? 'video' : 'image',
      extension: ext,
      isVideo,
    };
  } catch {
    return null;
  }
}

function generateHTML({ mediaUrl, mediaExt, mediaType, mediaSize, isVideo, title }) {
  const t = escapeHtml(title);
  const sizeMB = mediaSize ? (mediaSize / 1024 / 1024).toFixed(2) : 'unknown';
  const mediaTag = isVideo
    ? `<video class="main-media" controls autoplay><source src="${mediaUrl}" type="${mediaType}/${mediaExt}"></video>`
    : `<img class="main-media" src="${mediaUrl}" alt="${t}" loading="lazy">`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${escapeHtml(config.siteDescription)}">
  <meta property="og:${mediaType}" content="${mediaUrl}">
  <meta property="og:${mediaType}:type" content="${mediaType}/${mediaExt}">
  <meta property="og:${mediaType}:width" content="1280">
  <meta property="og:${mediaType}:height" content="720">
  <meta property="twitter:card" content="player">
  <meta property="twitter:player:stream" content="${mediaUrl}">
  <meta property="twitter:player:stream:content_type" content="${mediaType}/${mediaExt}">
  <style>
    @font-face { font-family: 'ArialPixel'; src: url('https://cdn.jsdelivr.net/gh/ekmas/cs16.css@main/ArialPixel.ttf') format('truetype'); }
    body { margin: 0; font-family: 'ArialPixel'; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; color: #fff; text-align: center; background: #000; }
    .box { max-width: 90vw; max-height: 80vh; }
    img, video.main-media { max-width: 80vw; max-height: 60vh; object-fit: contain; box-shadow: 0 4px 20px rgba(0,0,0,.7); }
    .zoomable { cursor: zoom-in; transform-origin: center; }
    .zoomable.panning { cursor: grabbing; }
    .info { margin-top: 20px; font-size: 16px; line-height: 1.5; max-width: 80vw; }
    .info strong { font-size: 18px; }
    a, p { color: #f0f0f0; }
    @media (max-width: 768px) {
      img, video.main-media { max-width: 95vw; max-height: 70vh; }
      .info { font-size: 14px; max-width: 95vw; }
    }
  </style>
</head>
<body>
  <div class="box">${mediaTag}</div>
  <div class="info box">
    <strong>${t}</strong><br>
    ${escapeHtml(config.siteDescription)}<br>
    ${sizeMB} MB • ${mediaExt}<br>
    scroll to zoom
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const m = document.querySelector('.box img, .box video');
      if (!m) return;
      let scale = 1, px = 0, py = 0, dragging = false, lx = 0, ly = 0;
      m.classList.add('zoomable');
      m.addEventListener('wheel', e => {
        e.preventDefault();
        scale = Math.max(1, Math.min(5, scale + (e.deltaY > 0 ? -0.1 : 0.1)));
        if (scale === 1) { px = py = 0; m.style.transform = ''; m.style.cursor = 'zoom-in'; }
        else { m.style.transform = \`scale(\${scale}) translate(\${px}px,\${py}px)\`; m.style.cursor = 'grab'; }
      });
      m.addEventListener('mousedown', e => {
        if (scale > 1) { dragging = true; m.classList.add('panning'); lx = e.clientX; ly = e.clientY; e.preventDefault(); }
      });
      document.addEventListener('mousemove', e => {
        if (!dragging) return;
        px += e.clientX - lx; py += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        m.style.transform = \`scale(\${scale}) translate(\${px}px,\${py}px)\`;
      });
      document.addEventListener('mouseup', () => { dragging = false; m.classList.remove('panning'); });
    });
  </script>
</body>
</html>`;
}

app.use((req, res, next) => {
  if (req.get('Host') !== config.allowedHost) return res.status(403).json({ error: 'access denied' });
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'girlglock embed service :3c', usage: `https://${config.allowedHost}/{id}.{ext}` });
});

app.get('/:mediaId', async (req, res) => {
  const mediaId = extractMediaId(req.params.mediaId);
  if (!mediaId) return res.status(400).send('invalid id');

  try {
    const info = await getMediaInfo(mediaId);
    if (!info) return res.status(404).send('not found or unsupported type');

    if (isBot(req.get('User-Agent')) && !info.isVideo) {
      const fileUrl = new URL(info.link);
      const client = fileUrl.protocol === 'https:' ? https : http;
      res.setHeader('Content-Type', `image/${info.extension}`);
      res.setHeader('Content-Length', info.size);
      client.get(fileUrl, stream => stream.pipe(res)).on('error', () => res.status(500).send('stream error'));
      return;
    }

    const html = generateHTML({
      mediaUrl: info.link,
      mediaExt: info.extension,
      mediaType: info.type,
      mediaSize: info.size,
      isVideo: info.isVideo,
      title: mediaId,
    });

    res.set({ 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' });
    res.send(html);
  } catch (e) {
    console.error('[error]', e);
    res.status(500).send('intewnal sewvew ewwow :c');
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.listen(config.PORT, () => console.log(`listening on ${config.PORT}`));
