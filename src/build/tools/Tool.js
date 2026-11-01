// Base class for editor tools.
import * as THREE from 'three';
import { disposeGroup } from '../overlays.js';

export class Tool {
  constructor(build) {
    this.build = build;
    this.preview = new THREE.Group();
    this.preview.name = 'toolPreview';
  }
  get bp() { return this.build.blueprint; }
  get settings() { return this.build.settings; }
  activate() { this.build.overlay.add(this.preview); this.reset(); }
  deactivate() { this.clearPreview(); this.build.overlay.remove(this.preview); }
  reset() { this.clearPreview(); }
  clearPreview() { disposeGroup(this.preview); }
  hint() { return ''; }
  snapOptions() { return {}; }
  /** Return false to fall through to the default handling. */
  onMove() {}
  onDown() {}
  onUp() {}
  onKey() { return false; }
  cancel() { this.reset(); return false; }
}
