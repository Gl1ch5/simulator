// WebGL renderer + post-processing pipeline (GTAO, outline, bloom, SMAA).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export class RenderSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.03, 3000);
    this.camera.position.set(4.5, 3.2, 5.5);

    this.quality = 'high';
    this.buildComposer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const w = Math.max(size.x, 1), h = Math.max(size.y, 1);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.composer.addPass(this.gtao);
    } else this.gtao = null;

    this.hoverOutline = new OutlinePass(new THREE.Vector2(w, h), this.scene, this.camera);
    Object.assign(this.hoverOutline, { edgeStrength: 2.2, edgeGlow: 0, edgeThickness: 1, pulsePeriod: 0 });
    this.hoverOutline.visibleEdgeColor.set(0xffffff);
    this.hoverOutline.hiddenEdgeColor.set(0x666666);
    this.composer.addPass(this.hoverOutline);

    this.selectOutline = new OutlinePass(new THREE.Vector2(w, h), this.scene, this.camera);
    Object.assign(this.selectOutline, { edgeStrength: 4, edgeGlow: 0.6, edgeThickness: 1.5, pulsePeriod: 0 });
    this.selectOutline.visibleEdgeColor.set(0x39d0ff);
    this.selectOutline.hiddenEdgeColor.set(0x1a6080);
    this.composer.addPass(this.selectOutline);

    if (this.quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    if (this.quality !== 'low') this.composer.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
  }

  setQuality(q) {
    if (q === this.quality) return;
    const hov = this.hoverOutline.selectedObjects, sel = this.selectOutline.selectedObjects;
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
    this.composer.dispose?.();
    this.buildComposer();
    this.hoverOutline.selectedObjects = hov;
    this.selectOutline.selectedObjects = sel;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
  }

  render() { this.composer.render(); }
}
