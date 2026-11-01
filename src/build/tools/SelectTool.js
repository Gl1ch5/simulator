import { Tool } from './Tool.js';

export class SelectTool extends Tool {
  constructor(b) { super(b); this.id = 'select'; this.name = 'Выбор / перемещение'; this.hotkey = 'V'; }
  hint() {
    return this.build.selected
      ? 'Тяни стрелки гизмо для перемещения · <b>Пробел</b> — перемещение/поворот · <b>Del</b> — удалить · <b>Ctrl+D</b> — дублировать'
      : 'Кликни по детали, чтобы выбрать её. Правая кнопка — вращать камеру, колесо — зум, средняя — панорама';
  }
  snapOptions() { return { vertices: false }; }
  onMove(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc);
    this.build.setHover(hit ? hit.partId : null);
  }
  onDown(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc);
    this.build.select(hit ? hit.partId : null);
  }
  onKey(e) {
    if (e.code === 'Space') { e.preventDefault(); this.build.app.toggleGizmoMode(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && this.build.selected) {
      e.preventDefault();
      const src = this.bp.get(this.build.selected);
      const copy = JSON.parse(JSON.stringify(src));
      delete copy.id;
      const step = this.build.workPlane.step;
      copy.pos = [copy.pos[0] + step * 2, copy.pos[1], copy.pos[2] + step * 2];
      if (copy.wires) copy.wires = [];
      this.bp.commit();
      const np = this.bp.add(copy);
      this.build.select(np.id);
      return true;
    }
    return false;
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}
