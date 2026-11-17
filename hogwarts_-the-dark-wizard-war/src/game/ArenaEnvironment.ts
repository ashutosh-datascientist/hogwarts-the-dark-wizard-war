import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MagicVFX } from './MagicVFX';
import { DestructibleEnvironment, DestructionSoundKind } from './DestructibleEnvironment';

export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export class ArenaEnvironment {
  public readonly world: CANNON.World;
  public readonly obstacles: ObstacleCollider[] = [];
  public readonly destructibles: DestructibleEnvironment;
  private puddleShaders: THREE.ShaderMaterial[] = [];
  private brazierLights: THREE.PointLight[] = [];
  private skyShader: THREE.ShaderMaterial | null = null;
  private mistMesh: THREE.Mesh | null = null;
  private healthOrbMesh: THREE.Group;
  private healthOrbActive = false;
  private healthOrbPos = new THREE.Vector3(0, 1.1, 0);
  private healthOrbTimer = 18;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    vfx: MagicVFX,
    shadowsEnabled: boolean,
    onDestructionSound?: (kind: DestructionSoundKind, intensity: number) => void
  ) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Environment reflection map for wet stone & metallic highlights
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const fogColor = new THREE.Color(0x060b13);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(0x060b13, 0.014);

    this.buildSkyDome(scene);
    this.buildLighting(scene, shadowsEnabled);
    this.buildCourtyardFloor(scene, renderer);
    this.buildPuddles(scene);
    this.buildCourtyardMist(scene);
    const { stoneMat, darkTrimMat } = this.buildCourtyardStructures(scene, renderer);
    this.destructibles = new DestructibleEnvironment(
      scene,
      this.world,
      vfx,
      stoneMat,
      darkTrimMat,
      onDestructionSound
    );
    this.buildHogwartsCastle(scene);

    this.healthOrbMesh = this.buildHealthOrb();
    this.healthOrbMesh.visible = false;
    scene.add(this.healthOrbMesh);
  }

  private buildSkyDome(scene: THREE.Scene): void {
    this.skyShader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFlash;
        varying vec3 vWorldPos;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec2 uv = dir.xz / (dir.y + 0.25);
          float n = fbm(uv * 1.45 + vec2(uTime * 0.032, uTime * 0.014));
          float n2 = fbm(uv * 3.1 - vec2(uTime * 0.045, 0.0));
          float clouds = smoothstep(0.3, 0.78, n * 0.65 + n2 * 0.35);

          vec3 baseSky = mix(vec3(0.025, 0.042, 0.075), vec3(0.008, 0.015, 0.03), h);
          vec3 cloudCol = mix(vec3(0.045, 0.07, 0.12), vec3(0.11, 0.16, 0.24), clouds);
          vec3 col = mix(baseSky, cloudCol, smoothstep(0.02, 0.38, h));

          col += vec3(0.58, 0.74, 1.0) * uFlash * (0.28 + clouds * 0.95);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 28, 18), this.skyShader);
    scene.add(sky);
  }

  private buildLighting(scene: THREE.Scene, shadowsEnabled: boolean): void {
    const hemi = new THREE.HemisphereLight(0x6388b0, 0x101722, 1.12);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0x9bc7f0, 1.65);
    key.position.set(22, 34, 20);
    key.castShadow = shadowsEnabled;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 95;
    key.shadow.camera.left = -32;
    key.shadow.camera.right = 32;
    key.shadow.camera.top = 32;
    key.shadow.camera.bottom = -32;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    // Subtle cool facial fill light so characters remain crisp during heavy storm
    const fill = new THREE.DirectionalLight(0x88b3e2, 0.72);
    fill.position.set(-16, 12, 26);
    scene.add(fill);

    // Warm rim highlight from Hogwarts Great Hall stained glass
    const rim = new THREE.DirectionalLight(0xe59c4d, 0.62);
    rim.position.set(-18, 14, -36);
    scene.add(rim);
  }

  private createStoneTexturePair(
    renderer: THREE.WebGLRenderer,
    repeatX: number,
    repeatY: number
  ): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const size = 1024;
    const colorC = document.createElement('canvas');
    colorC.width = size;
    colorC.height = size;
    const ctx = colorC.getContext('2d')!;

    const bumpC = document.createElement('canvas');
    bumpC.width = size;
    bumpC.height = size;
    const bctx = bumpC.getContext('2d')!;

    const roughC = document.createElement('canvas');
    roughC.width = size;
    roughC.height = size;
    const rctx = roughC.getContext('2d')!;

    // Dark wet mortar bed
    ctx.fillStyle = '#0e131a';
    ctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#202020';
    bctx.fillRect(0, 0, size, size);
    rctx.fillStyle = '#181818'; // glossy wet seams
    rctx.fillRect(0, 0, size, size);

    const rows = 16;
    const cols = 10;
    const tileH = size / rows;
    const tileW = size / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (tileW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * tileW + offset;
        const y = r * tileH;
        const base = 24 + Math.floor(Math.random() * 20);
        ctx.fillStyle = `rgb(${base}, ${base + 4}, ${base + 11})`;
        ctx.fillRect(x + 3, y + 3, tileW - 6, tileH - 6);

        const bumpBase = 155 + Math.floor(Math.random() * 65);
        bctx.fillStyle = `rgb(${bumpBase},${bumpBase},${bumpBase})`;
        bctx.fillRect(x + 4, y + 4, tileW - 8, tileH - 8);

        // Wetness patches: darker roughness = mirror-like storm reflection
        const wet = Math.random() > 0.35 ? 28 + Math.floor(Math.random() * 45) : 95 + Math.floor(Math.random() * 55);
        rctx.fillStyle = `rgb(${wet},${wet},${wet})`;
        rctx.fillRect(x + 3, y + 3, tileW - 6, tileH - 6);

        // Subtle lichen / stone grain
        for (let s = 0; s < 18; s++) {
          const sx = x + 6 + Math.random() * (tileW - 14);
          const sy = y + 6 + Math.random() * (tileH - 14);
          ctx.fillStyle =
            Math.random() > 0.6
              ? 'rgba(30,48,38,0.16)'
              : Math.random() > 0.5
                ? 'rgba(255,255,255,0.04)'
                : 'rgba(0,0,0,0.2)';
          ctx.fillRect(sx, sy, 4, 3);
        }
      }
    }

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const prep = (canvas: HTMLCanvasElement, isSrgb: boolean) => {
      const tex = new THREE.CanvasTexture(canvas);
      if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.anisotropy = maxAniso;
      return tex;
    };

    return {
      map: prep(colorC, true),
      bumpMap: prep(bumpC, false),
      roughnessMap: prep(roughC, false),
    };
  }

  private buildCourtyardFloor(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const { map, bumpMap, roughnessMap } = this.createStoneTexturePair(renderer, 14, 14);

    const floorMat = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.04,
      roughnessMap,
      roughness: 0.34,
      metalness: 0.16,
      envMapIntensity: 1.55,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Carved Hogwarts courtyard ritual circle
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#232b36',
      bumpMap,
      bumpScale: 0.03,
      roughness: 0.28,
      metalness: 0.22,
    });
    const sealRing = new THREE.Mesh(new THREE.RingGeometry(10.5, 11.6, 56), ringMat);
    sealRing.rotation.x = -Math.PI / 2;
    sealRing.position.y = 0.02;
    sealRing.receiveShadow = true;
    scene.add(sealRing);
  }

  private buildPuddles(scene: THREE.Scene): void {
    const puddleCoords = [
      [-5, 3, 3.8],
      [6, -4, 4.4],
      [-11, -7, 3.2],
      [10, 7, 3.6],
      [0, 0, 3.1],
      [-3, -11, 4.0],
    ];

    puddleCoords.forEach(([px, pz, rad], idx) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: idx * 1.7 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float dist = length(p) * 2.0;
            if (dist > 1.0) discard;

            float r1 = sin(length(p - vec2(0.14, -0.1)) * 58.0 - uTime * 8.5);
            float r2 = sin(length(p - vec2(-0.18, 0.15)) * 50.0 - uTime * 7.6 + 2.1);
            float r3 = sin(length(p - vec2(0.04, 0.18)) * 62.0 - uTime * 9.2 + 4.3);
            float rings = smoothstep(0.65, 0.98, (r1 + r2 + r3) * 0.33 + 0.3);

            float edge = 1.0 - smoothstep(0.62, 1.0, dist);
            vec3 waterCol = mix(vec3(0.04, 0.08, 0.14), vec3(0.36, 0.5, 0.68), rings * 0.72);
            gl_FragColor = vec4(waterCol, edge * (0.48 + rings * 0.28));
          }
        `,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.puddleShaders.push(mat);

      const mesh = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(px, 0.03, pz);
      scene.add(mesh);
    });
  }

  private buildCourtyardMist(scene: THREE.Scene): void {
    const mistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 6.0;
          float w = sin(p.x + uTime * 0.45) * cos(p.y - uTime * 0.32);
          float d = length(vUv - 0.5) * 2.0;
          float alpha = smoothstep(0.2, 0.85, w * 0.5 + 0.5) * (1.0 - smoothstep(0.45, 1.0, d)) * 0.14;
          gl_FragColor = vec4(0.28, 0.36, 0.48, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.mistMesh = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), mistMat);
    this.mistMesh.rotation.x = -Math.PI / 2;
    this.mistMesh.position.y = 0.25;
    scene.add(this.mistMesh);
  }

  private buildCourtyardStructures(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer
  ): { stoneMat: THREE.MeshStandardMaterial; darkTrimMat: THREE.MeshStandardMaterial } {
    const { map, bumpMap } = this.createStoneTexturePair(renderer, 2, 4);
    const stoneMat = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.03,
      roughness: 0.62,
      metalness: 0.1,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: '#171c24',
      roughness: 0.5,
      metalness: 0.2,
    });

    // Gothic Cloister Archways flanking the courtyard
    [-26, 26].forEach((ax) => {
      const arch = new THREE.Group();
      arch.position.set(ax, 0, -2);
      arch.rotation.y = Math.PI / 2;

      const leftCol = new THREE.Mesh(new THREE.BoxGeometry(1.9, 8.8, 1.9), stoneMat);
      leftCol.position.set(-4.2, 4.4, 0);
      leftCol.castShadow = true;
      const rightCol = leftCol.clone();
      rightCol.position.x = 4.2;

      const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.0, 1.6, 2.3), darkTrimMat);
      lintel.position.set(0, 9.2, 0);
      lintel.castShadow = true;

      const gable = new THREE.Mesh(new THREE.ConeGeometry(4.3, 3.4, 4), stoneMat);
      gable.rotation.y = Math.PI / 4;
      gable.position.set(0, 11.4, 0);
      gable.scale.set(1.4, 1, 0.45);

      arch.add(leftCol, rightCol, lintel, gable);
      scene.add(arch);

      this.addStaticCylinderCollider(ax, -6.2, 1.25, 9);
      this.addStaticCylinderCollider(ax, 2.2, 1.25, 9);
    });

    // Surrounding cliffs fading into horizon fog
    const cliffMat = new THREE.MeshStandardMaterial({ color: '#0e131a', roughness: 0.92 });
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      const dist = 37 + (i % 3) * 6;
      const cliff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(6 + (i % 4) * 2.5, 1),
        cliffMat
      );
      cliff.position.set(Math.cos(ang) * dist, 1.2, Math.sin(ang) * dist);
      cliff.scale.set(1.4, 0.8 + (i % 3) * 0.4, 1.2);
      scene.add(cliff);
    }

    // 4 Iron Fire Braziers casting warm amber wet reflections
    const brazierCoords: [number, number][] = [
      [-11, -11],
      [11, -11],
      [-11, 11],
      [11, 11],
    ];
    const ironMat = new THREE.MeshStandardMaterial({
      color: '#191b20',
      metalness: 0.82,
      roughness: 0.34,
    });
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ff8e30' });

    brazierCoords.forEach(([bx, bz]) => {
      const g = new THREE.Group();
      g.position.set(bx, 0, bz);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.5, 10), ironMat);
      stand.position.y = 0.75;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.3, 0.45, 12), ironMat);
      bowl.position.y = 1.65;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.88, 8), flameMat);
      fire.position.y = 2.15;
      g.add(stand, bowl, fire);
      scene.add(g);

      const light = new THREE.PointLight(0xff7d26, 3.6, 17, 2);
      light.position.set(bx, 2.4, bz);
      scene.add(light);
      this.brazierLights.push(light);
      this.addStaticCylinderCollider(bx, bz, 0.72, 2.2);
    });

    return { stoneMat, darkTrimMat };
  }

  private buildHogwartsCastle(scene: THREE.Scene): void {
    const castleGroup = new THREE.Group();
    castleGroup.position.set(0, 0, -48);

    const wallMat = new THREE.MeshStandardMaterial({
      color: '#191f29',
      roughness: 0.82,
      metalness: 0.1,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#0e131b',
      roughness: 0.48,
      metalness: 0.28,
    });
    const windowGlowMat = new THREE.MeshBasicMaterial({ color: '#f6b347' });

    const keep = new THREE.Mesh(new THREE.BoxGeometry(38, 20, 14), wallMat);
    keep.position.set(0, 10, 0);
    castleGroup.add(keep);

    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(20, 11.5, 4), roofMat);
    keepRoof.rotation.y = Math.PI / 4;
    keepRoof.position.set(0, 25, 0);
    keepRoof.scale.set(1.5, 1, 0.7);
    castleGroup.add(keepRoof);

    const towerSpecs: [number, number, number, number][] = [
      [-24, 0, 5.2, 35],
      [24, 0, 5.2, 35],
      [-14, -8, 4.0, 45],
      [14, -8, 4.2, 49],
      [0, -14, 6.2, 60],
      [-34, -4, 4.5, 29],
      [34, -4, 4.5, 29],
    ];

    towerSpecs.forEach(([tx, tz, rad, h]) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.88, rad, h, 14), wallMat);
      body.position.set(tx, h / 2, tz);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(rad * 1.12, h * 0.42, 14), roofMat);
      spire.position.set(tx, h + h * 0.21, tz);
      castleGroup.add(body, spire);

      for (let w = 0; w < 3; w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.9, 0.3), windowGlowMat);
        win.position.set(tx + (w - 1) * (rad * 0.5), h * 0.6, tz + rad * 0.92);
        castleGroup.add(win);
      }
    });

    for (let i = -3; i <= 3; i++) {
      const lancet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.4, 0.3), windowGlowMat);
      lancet.position.set(i * 4.4, 9.8, 7.05);
      castleGroup.add(lancet);
    }

    const viaduct = new THREE.Mesh(new THREE.BoxGeometry(94, 6, 8), wallMat);
    viaduct.position.set(0, 3, 12);
    castleGroup.add(viaduct);

    scene.add(castleGroup);
  }

  private buildHealthOrb(): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 1),
      new THREE.MeshBasicMaterial({ color: '#fde047' })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#38bdf8' })
    );
    const light = new THREE.PointLight(0xfde047, 2.5, 9, 2);
    g.add(core, ring, light);
    return g;
  }

  private addStaticCylinderCollider(x: number, z: number, radius: number, height: number): void {
    this.obstacles.push({ x, z, radius, height });
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, height / 2, z),
      shape: new CANNON.Cylinder(radius, radius, height, 10),
    });
    this.world.addBody(body);
  }

  public isHealthOrbActive(): boolean {
    return this.healthOrbActive;
  }

  public tryPickupHealthOrb(pos: THREE.Vector3): number {
    if (!this.healthOrbActive) return 0;
    const dist = Math.hypot(pos.x - this.healthOrbPos.x, pos.z - this.healthOrbPos.z);
    if (dist < 1.8) {
      this.healthOrbActive = false;
      this.healthOrbMesh.visible = false;
      this.healthOrbTimer = 24 + Math.random() * 12;
      return 140;
    }
    return 0;
  }

  public update(dt: number, elapsed: number, lightningFlash: number, physicsStep: boolean): void {
    if (physicsStep) {
      this.world.step(1 / 60, dt, 3);
      this.destructibles.update(dt);
    }

    if (this.skyShader) {
      this.skyShader.uniforms.uTime.value = elapsed;
      this.skyShader.uniforms.uFlash.value = lightningFlash;
    }

    if (this.mistMesh) {
      (this.mistMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    }

    for (let i = 0; i < this.puddleShaders.length; i++) {
      this.puddleShaders[i].uniforms.uTime.value = elapsed + i * 1.4;
    }

    for (let i = 0; i < this.brazierLights.length; i++) {
      this.brazierLights[i].intensity =
        3.2 + Math.sin(elapsed * 14 + i * 2.1) * 0.55 + Math.cos(elapsed * 23 + i) * 0.25;
    }

    if (physicsStep) {
      if (!this.healthOrbActive) {
        this.healthOrbTimer -= dt;
        if (this.healthOrbTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 6;
          this.healthOrbPos.set(Math.cos(angle) * r, 1.15, Math.sin(angle) * r);
          this.healthOrbMesh.position.copy(this.healthOrbPos);
          this.healthOrbMesh.visible = true;
          this.healthOrbActive = true;
        }
      } else {
        this.healthOrbMesh.rotation.y += dt * 2.2;
        this.healthOrbMesh.children[1].rotation.x += dt * 3.0;
        this.healthOrbMesh.position.y = 1.15 + Math.sin(elapsed * 3.2) * 0.16;
      }
    }
  }

  public dispose(scene: THREE.Scene): void {
    if (scene.environment) {
      scene.environment.dispose();
      scene.environment = null;
    }
    this.skyShader?.dispose();
    if (this.mistMesh) {
      this.mistMesh.geometry.dispose();
      (this.mistMesh.material as THREE.Material).dispose();
    }
    this.puddleShaders.forEach((m) => m.dispose());
    scene.remove(this.healthOrbMesh);
  }
}
