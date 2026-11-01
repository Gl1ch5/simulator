import { Tool } from './Tool.js';
import { getMaterial } from '../../model/materials.js';
import { partName } from '../../parts/registry.js';

export class PaintTool extends Tool {
  constructor(b) { super(b); this.id = 'paint'; this.name = 'Материал (покраска)'; this.hotkey = 'O'; }
  hint() { return `Кликни по детали, чтобы назначить материал: <b>${getMaterial(this.settings.material).name}</b>. Масса пересчитается`; }
  snapOptions() { return { vertices: false }; }
  onMove(snap, e, ndc) { const h = this.build.snapper.pickPart(ndc, (p) => 'material' in p); this.build.setHover(h ? h.partId : null); }
  onDown(snap, e, ndc) {
    const h = this.build.snapper.pickPart(ndc, (p) => 'material' in p);
    if (!h) return;
    this.bp.commit();
    this.bp.update(h.partId, { material: this.settings.material });
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}

export class DeleteTool extends Tool {
  constructor(b) { super(b); this.id = 'delete'; this.name = 'Удалить'; this.hotkey = 'X'; }
  hint() { return 'Кликни по детали, чтобы удалить её (вместе с установленными на ней узлами). <b>Ctrl+Z</b> — отменить'; }
  snapOptions() { return { vertices: false }; }
  onMove(snap, e, ndc) { const h = this.build.snapper.pickPart(ndc); this.build.setHover(h ? h.partId : null); }
  onDown(snap, e, ndc) {
    const h = this.build.snapper.pickPart(ndc);
    if (!h) return;
    const p = this.bp.get(h.partId);
    this.bp.commit();
    this.bp.remove(h.partId);
    this.build.setHover(null);
    this.build.toast(`Удалено: ${partName(p)}`);
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}
