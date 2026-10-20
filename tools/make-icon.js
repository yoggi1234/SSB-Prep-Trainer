'use strict';
/* Generates build/icon.png (256x256) - a rounded gradient tile with a white star.
   Pure Node, no dependencies. Run: node tools/make-icon.js */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const RADIUS = 52;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function inRoundedRect(x, y, size, r) {
  if (x >= r && x <= size - r) return y >= 0 && y <= size;
  if (y >= r && y <= size - r) return x >= 0 && x <= size;
  const cx = x < r ? r : size - r;
  const cy = y < r ? r : size - r;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function starPoints(size) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const R = size * 0.30;
  const r = R * 0.40;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  return pts;
}

function inPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const star = starPoints(SIZE);
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const o = rowStart + 1 + x * 4;
    let r;
    let g;
    let b;
    let a;

    const t = (x + y) / (2 * SIZE); // diagonal gradient: alpine forest
    r = Math.round(62 + (24 - 62) * t);
    g = Math.round(127 + (74 - 127) * t);
    b = Math.round(92 + (53 - 92) * t);

    // subtle inner glow
    const dx = x - SIZE / 2;
    const dy = y - SIZE / 2;
    const d = Math.sqrt(dx * dx + dy * dy) / (SIZE / 2);
    const glow = Math.max(0, 1 - d) * 26;
    r = Math.min(255, Math.round(r + glow));
    g = Math.min(255, Math.round(g + glow));
    b = Math.min(255, Math.round(b + glow));

    a = 255;

    if (inPolygon(star, x, y)) {
      r = 255;
      g = 255;
      b = 255;
    }

    if (!inRoundedRect(x + 0.5, y + 0.5, SIZE, RADIUS)) a = 0;

    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = b;
    raw[o + 3] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + png.length + ' bytes)');
