// Procedural textures generated on canvases (no external files needed).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = {};

/** Brushed-metal roughness variation: long horizontal streaks. */
export function brushedTexture() {
  if (cache.brushed) return cache.brushed;
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * 512;
    const l = 40 + Math.random() * 300;
    const x = Math.random() * 512;
    const v = 100 + Math.random() * 70;
    g.strokeStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.2})`;
    g.lineWidth = Math.random() * 1.4 + 0.3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 2); g.stroke();
    g.beginPath(); g.moveTo(x - 512, y); g.lineTo(x - 512 + l, y); g.stroke();
  }
  cache.brushed = toTex(c, 2);
  return cache.brushed;
}

export function woodTexture() {
  if (cache.wood) return cache.wood;
  const [c, g] = canvas(512, 512);
  const img = g.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const n = Math.sin((y * 0.06) + Math.sin(x * 0.012) * 3 + Math.sin(x * 0.05 + y * 0.01)) * 0.5 + 0.5;
      const ring = Math.pow(n, 3);
      const grain = Math.random() * 0.08;
      const r = 165 - ring * 60 - grain * 120;
      const gg = 115 - ring * 45 - grain * 80;
      const b = 65 - ring * 30 - grain * 40;
      const i = (y * 512 + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  cache.wood = toTex(c, 2, true);
  return cache.wood;
}

export function carbonTexture() {
  if (cache.carbon) return cache.carbon;
  const [c, g] = canvas(256, 256);
  const s = 16;
  for (let y = 0; y < 256; y += s) {
    for (let x = 0; x < 256; x += s) {
      const odd = ((x / s) + (y / s)) % 2 === 0;
      const grd = odd ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
      grd.addColorStop(0, '#15171a'); grd.addColorStop(0.5, '#3a3e45'); grd.addColorStop(1, '#15171a');
      g.fillStyle = grd; g.fillRect(x, y, s, s);
    }
  }
  cache.carbon = toTex(c, 6, true);
  return cache.carbon;
}

export function rubberTexture() {
  if (cache.rubber) return cache.rubber;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 90 + Math.random() * 80;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  cache.rubber = toTex(c, 4);
  return cache.rubber;
}

/** Tread pattern for tire side (used as bump map). */
export function treadTexture() {
  if (cache.tread) return cache.tread;
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#000';
  for (let x = 0; x < 256; x += 16) {
    g.save(); g.translate(x, 0); g.transform(1, 0, 0.5, 1, 0, 0);
    g.fillRect(0, 0, 6, 28); g.restore();
    g.save(); g.translate(x + 8, 36); g.transform(1, 0, -0.5, 1, 0, 0);
    g.fillRect(0, 0, 6, 28); g.restore();
  }
  cache.tread = toTex(c, 1);
  return cache.tread;
}

/** Infinite-ish grid line texture for the build plane. */
export function gridTexture() {
  if (cache.grid) return cache.grid;
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  cache.grid = toTex(c, 1);
  return cache.grid;
}
