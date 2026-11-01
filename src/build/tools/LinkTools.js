// Rigid connection tool and the control-wire tool.
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { polyline, label, dot } from '../overlays.js';
import { V, A } from '../../core/math.js';
import { partName } from '../../parts/registry.js';
import { CHANNELS } from '../../parts/Seat.js';

export class ConnectTool extends Tool {
  constructor(b) { super(b); this.id = 'connect'; this.name = 'Соединить (жёстко)'; this.hotkey = 'J'; }
  reset() { super.reset(); this.first = null; }
  activate() { super.activate(); this.build.rebuildInfo(); }
  deactivate() { super.deactivate(); this.build.setHover(null); this.build.rebuildInfo(); }
  hint() {
    return this.first
      ? `Выбрано: ${partName(this.bp.get(this.first.partId))} #${this.first.partId}. Кликни вторую деталь — соединить / разъединить`
      : 'Кликни первую деталь, затем вторую. Оранжевые точки — существующие соединения. Повторный клик по паре — разъединить';
  }
  onMove(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc);
    this.build.setHover(hit ? hit.partId : null);
    this.clearPreview();
    if (this.first && snap) this.preview.add(polyline([this.first.point, snap.point], 0xffb020, false, true));
  }
  onDown(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc);
    if (!hit) return;
    const point = snap?.partId === hit.partId ? snap.point : hit.point;
    if (!this.first) { this.first = { partId: hit.partId, point }; this.preview.add(dot(point, 0xffb020, 0.02)); return; }
    if (hit.partId === this.first.partId) return;
    this.bp.commit();
    if (this.bp.connected(this.first.partId, hit.partId)) {
      this.bp.disconnect(this.first.partId, hit.partId);
      this.build.toast('Детали разъединены');
    } else {
      const mid = this.first.point.clone().add(point).multiplyScalar(0.5);
      this.bp.connect(this.first.partId, hit.partId, A(mid));
      this.build.toast('Детали соединены');
    }
    this.reset();
    this.build.rebuildInfo();
  }
  cancel() { if (this.first) { this.reset(); return true; } return false; }
}

const WIREABLE = { motor: 'throttle', engine: 'throttle', hinge: 'steer', bearing: 'brake' };

export class WireTool extends Tool {
  constructor(b) { super(b); this.id = 'wire'; this.name = 'Провод управления'; this.hotkey = 'L'; }
  reset() { super.reset(); this.seat = null; }
  activate() {
    super.activate();
    const seats = this.bp.all().filter((p) => p.type === 'seat');
    if (seats.length === 1) this.seat = seats[0].id;
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
  hint() {
    if (!this.seat) return 'Кликни по сиденью (пульту), затем по мотору / шарниру / подшипнику. Нет сиденья? Поставь инструментом <b>K</b>';
    return 'Кликни по мотору/ДВС (газ), шарниру (руль) или подшипнику (тормоз). Повторный клик — отключить. Канал и инверсию можно сменить в инспекторе';
  }
  onMove(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc, (p) => p.type === 'seat' || WIREABLE[p.type]);
    this.build.setHover(hit ? hit.partId : null);
    this.clearPreview();
    if (this.seat && hit && hit.partId !== this.seat) {
      const seat = this.bp.get(this.seat);
      const target = this.bp.get(hit.partId);
      const ch = WIREABLE[target.type];
      if (ch) {
        this.preview.add(polyline([V(seat.pos), V(target.pos)], 0xffffff, false, true));
        this.preview.add(label(CHANNELS[ch], V(target.pos)));
      }
    }
  }
  onDown(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc, (p) => p.type === 'seat' || WIREABLE[p.type]);
    if (!hit) return;
    const part = this.bp.get(hit.partId);
    if (part.type === 'seat') { this.seat = part.id; this.build.toast('Пульт выбран — теперь кликай по исполнительным устройствам'); return; }
    if (!this.seat) { this.build.toast('Сначала кликни по сиденью-пульту', 'warn'); return; }
    const seat = this.bp.get(this.seat);
    this.bp.commit();
    const existing = seat.wires.findIndex((w) => w.to === part.id);
    const wires = [...seat.wires];
    if (existing >= 0) { wires.splice(existing, 1); this.build.toast('Провод отключён'); }
    else { wires.push({ to: part.id, ch: WIREABLE[part.type], invert: false }); this.build.toast(`Подключено: ${partName(part)} → ${CHANNELS[WIREABLE[part.type]]}`); }
    this.bp.update(seat.id, { wires });
  }
  cancel() { if (this.seat) { this.seat = null; return true; } return false; }
}
