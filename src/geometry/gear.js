// Spur gear outline generator (approximate involute via sampled flanks).
import * as THREE from 'three';

export function gearRadius(teeth, module) { return (teeth * module) / 2; }

export function gearShape(teeth, module, holeR = 0) {
  const rp = gearRadius(teeth, module);
  const ra = rp + module;
  const rd = Math.max(rp - 1.25 * module, module * 0.5);
  const rb = rp * Math.cos((20 * Math.PI) / 180);
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const pts = [];
  // involute: r(t) = rb*sqrt(1+t^2), angle offset inv(t) = t - atan(t)
  const inv = (r) => { const rr = Math.max(r, rb); const t = Math.sqrt((rr / rb) ** 2 - 1); return t - Math.atan(t); };
  const halfToothAtPitch = step / 4 + inv(rp);
  const flank = 5;
  for (let i = 0; i < teeth; i++) {
    const c = i * step;
    // root start
    pts.push([rd, c - step / 2 + step * 0.04]);
    // rising flank
    for (let k = 0; k <= flank; k++) {
      const r = Math.max(rd, rb) + ((ra - Math.max(rd, rb)) * k) / flank;
      pts.push([r, c - (halfToothAtPitch - inv(r))]);
    }
    // falling flank
    for (let k = flank; k >= 0; k--) {
      const r = Math.max(rd, rb) + ((ra - Math.max(rd, rb)) * k) / flank;
      pts.push([r, c + (halfToothAtPitch - inv(r))]);
    }
    pts.push([rd, c + step / 2 - step * 0.04]);
  }
  pts.forEach(([r, a], i) => {
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  if (holeR > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  // lightening holes for big gears
  if (rd > module * 8) {
    const n = 5, hr = (rd - holeR * 2) * 0.28, hc = (rd + holeR * 1.6) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * hc, Math.sin(a) * hc, hr, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  return shape;
}
