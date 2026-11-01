// HDR sky, sun, ground and atmosphere.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export class Environment {
  constructor(rs) {
    this.rs = rs;
    const scene = rs.scene;
    scene.fog = new THREE.Fog(0xbcd0e0, 120, 650);

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4036, 0.25);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
    this.sunDir = new THREE.Vector3(-0.45, 0.75, 0.35).normalize();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.focus = new THREE.Vector3();
  }

  async load(onProgress) {
    const tl = new THREE.TextureLoader();
    const pmrem = new THREE.PMREMGenerator(this.rs.renderer);
    const hdr = await new RGBELoader().loadAsync('hdr/sky_2k.hdr', (e) => onProgress?.(e.loaded / (e.total || 6e6)));
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdr).texture;
    this.rs.scene.environment = env;
    this.rs.scene.background = hdr;
    this.rs.scene.backgroundIntensity = 1.0;
    this.rs.scene.environmentIntensity = 1.0;
    pmrem.dispose();

    const load = (name, srgb, rep) => {
      const t = tl.load(`textures/${name}`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      t.anisotropy = 16;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    // Asphalt test field
    const groundSize = 1200;
    const rep = groundSize / 8;
    const gmat = new THREE.MeshStandardMaterial({
      map: load('aerial_asphalt_01_diff.jpg', true, rep),
      normalMap: load('aerial_asphalt_01_nor_gl.jpg', false, rep),
      roughnessMap: load('aerial_asphalt_01_rough.jpg', false, rep),
      color: 0xb8b8b8,
      envMapIntensity: 0.6,
    });
    gmat.normalScale.set(0.8, 0.8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.rs.scene.add(ground);
    this.ground = ground;

    // Concrete workshop pad around the origin
    const pmat = new THREE.MeshStandardMaterial({
      map: load('concrete_floor_02_diff.jpg', true, 3),
      normalMap: load('concrete_floor_02_nor_gl.jpg', false, 3),
      roughnessMap: load('concrete_floor_02_rough.jpg', false, 3),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), pmat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.001;
    pad.receiveShadow = true;
    this.rs.scene.add(pad);
    // hazard border
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xf2b417, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(14.3, 0.15), borderMat);
      b.rotation.x = -Math.PI / 2;
      b.rotation.z = (i * Math.PI) / 2;
      const d = 7.075;
      b.position.set(i === 1 ? d : i === 3 ? -d : 0, 0.002, i === 0 ? d : i === 2 ? -d : 0);
      b.receiveShadow = true;
      this.rs.scene.add(b);
    }
  }

  /** Keep the shadow frustum centred on what the player is looking at. */
  update(target) {
    this.focus.copy(target);
    const snap = 0.5;
    const fx = Math.round(target.x / snap) * snap, fz = Math.round(target.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, 60);
  }
}
