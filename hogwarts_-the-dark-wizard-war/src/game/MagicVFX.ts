import * as THREE from 'three';
import { SpellDefinition, SpellTier } from './types';

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface Shockwave {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  duration: number;
  maxScale: number;
}

interface DebrisChunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  life: number;
}

interface SmokeCloud {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vel: THREE.Vector3;
  age: number;
  life: number;
  startScale: number;
}

function createPlasmaMaterial(primary: string, secondary: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(primary) },
      uColorB: { value: new THREE.Color(secondary) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 pos = position;
        float disp = sin(pos.x * 8.0 + uTime * 14.0) * cos(pos.y * 8.0 - uTime * 11.0) * 0.12;
        pos += normal * disp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        float pulse = sin(vUv.x * 18.0 + uTime * 12.0) * cos(vUv.y * 14.0 - uTime * 9.0);
        float core = smoothstep(-0.3, 0.85, pulse);
        vec3 col = mix(uColorB, uColorA, core);
        col += vec3(0.45) * pow(max(0.0, vNormal.z), 2.0);
        gl_FragColor = vec4(col, 0.96);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function createShockwaveMaterial(colorHex: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.68, 0.86, d) * (1.0 - smoothstep(0.86, 1.0, d));
        float fade = 1.0 - uProgress;
        gl_FragColor = vec4(uColor * 1.6, ring * fade * 0.95);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export class MagicVFX {
  private scene: THREE.Scene;

  // Pooled GPU particle system
  private readonly maxParticles = 700;
  private particles: Particle[] = [];
  private particleGeo: THREE.BufferGeometry;
  private particlePoints: THREE.Points;
  private pPositions: Float32Array;
  private pColors: Float32Array;

  private shockwaves: Shockwave[] = [];
  private debris: DebrisChunk[] = [];
  private smokes: SmokeCloud[] = [];
  private particlesEnabled = true;

  private sharedSmokeGeo = new THREE.DodecahedronGeometry(0.45, 1);
  private sharedDebrisGeo = new THREE.DodecahedronGeometry(0.18, 0);
  private sharedDebrisMat = new THREE.MeshStandardMaterial({
    color: '#2d3642',
    roughness: 0.85,
    metalness: 0.1,
  });

  public setParticlesEnabled(enabled: boolean): void {
    this.particlesEnabled = enabled;
    this.particlePoints.visible = enabled;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.pPositions = new Float32Array(this.maxParticles * 3);
    this.pColors = new Float32Array(this.maxParticles * 3);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 1,
        color: new THREE.Color(1, 1, 1),
      });
      this.pPositions[i * 3 + 1] = -100;
    }

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pPositions, 3)
    );
    this.particleGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.pColors, 3)
    );

    const pMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particlePoints = new THREE.Points(this.particleGeo, pMat);
    this.particlePoints.frustumCulled = false;
    scene.add(this.particlePoints);
  }

  /**
   * Builds a rich multi-layered 3D spell projectile group (plasma core + spiral tendrils
   * + crackling lightning halo + optional Phoenix wings / Time-Turner rings / Dark vortex).
   */
  public createProjectileVisual(spell: SpellDefinition): {
    group: THREE.Group;
    plasmaMat: THREE.ShaderMaterial;
    lightningLine: THREE.Line;
  } {
    const group = new THREE.Group();
    const scale =
      spell.tier === 'ULTIMATE' ? 1.85 : spell.tier === 'MID' ? 1.15 : 0.72;

    const plasmaMat = createPlasmaMaterial(spell.primaryColor, spell.secondaryColor);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.32 * scale, 2),
      plasmaMat
    );
    group.add(core);

    // Outer distorted aura shell
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.48 * scale, 16, 12),
      new THREE.MeshBasicMaterial({
        color: spell.secondaryColor,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(aura);

    // Twisting spiral energy tendrils (2 helical TubeGeometries)
    for (let t = 0; t < 2; t++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const ang = u * Math.PI * 3.5 + t * Math.PI;
        const r = (0.14 + u * 0.42) * scale;
        pts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r, -u * 2.2 * scale));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 18, 0.045 * scale, 6, false),
        new THREE.MeshBasicMaterial({
          color: t === 0 ? spell.primaryColor : spell.secondaryColor,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(tube);
    }

    // Jagged lightning halo around projectile
    const boltPts: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = (0.45 + Math.random() * 0.35) * scale;
      boltPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.8));
    }
    const lightningLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boltPts),
      new THREE.LineBasicMaterial({
        color: spell.primaryColor,
        transparent: true,
        opacity: 0.9,
      })
    );
    group.add(lightningLine);

    // Ultimate-specific monumental silhouettes
    if (spell.tier === 'ULTIMATE') {
      if (spell.vfxStyle === 'phoenix_fire' || spell.vfxStyle === 'patronus') {
        // Radiant Phoenix / Patronus guardian wings + luminous aura rings
        const wingMat = new THREE.MeshBasicMaterial({
          color: spell.primaryColor,
          transparent: true,
          opacity: 0.74,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        [-1, 1].forEach((side) => {
          const wingShape = new THREE.Shape();
          wingShape.moveTo(0, 0);
          wingShape.quadraticCurveTo(side * 1.4, 1.2, side * 2.8, 0.65);
          wingShape.quadraticCurveTo(side * 1.9, -0.3, 0, -0.55);
          const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wingMat);
          wing.rotation.x = 0.22;
          group.add(wing);
        });
        for (let r = 0; r < 2; r++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry((1.0 + r * 0.4) * 0.9, 0.05, 8, 32),
            new THREE.MeshBasicMaterial({
              color: r === 0 ? spell.primaryColor : spell.secondaryColor,
              transparent: true,
              opacity: 0.75,
              blending: THREE.AdditiveBlending,
            })
          );
          ring.rotation.x = r * 0.8;
          group.add(ring);
        }
      } else if (spell.vfxStyle === 'dark_curse' || spell.vfxStyle === 'shadow_wave') {
        // Swallowing black smoke vortex ring + crimson/emerald rim
        const darkRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.25, 0.24, 10, 28),
          new THREE.MeshStandardMaterial({
            color: '#030504',
            emissive: spell.secondaryColor,
            emissiveIntensity: 0.65,
            roughness: 0.9,
            transparent: true,
            opacity: 0.88,
          })
        );
        group.add(darkRing);
        const runeRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.65, 0.06, 8, 32),
          new THREE.MeshBasicMaterial({
            color: spell.primaryColor,
            transparent: true,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
          })
        );
        runeRing.rotation.y = Math.PI / 4;
        group.add(runeRing);
      } else if (spell.vfxStyle === 'time_surge' || spell.vfxStyle === 'transfigure') {
        // Interlocking golden/emerald arcane gyroscopic rings
        for (let g = 0; g < 3; g++) {
          const gyro = new THREE.Mesh(
            new THREE.TorusGeometry(0.95 + g * 0.32, 0.055, 10, 36),
            new THREE.MeshBasicMaterial({
              color: g % 2 === 0 ? spell.primaryColor : spell.secondaryColor,
              transparent: true,
              opacity: 0.82,
              blending: THREE.AdditiveBlending,
            })
          );
          gyro.rotation.set(g * 0.7, g * 1.1, g * 0.4);
          group.add(gyro);
        }
      } else if (spell.vfxStyle === 'fiendfyre') {
        // Roaring horned serpent-flame crest
        for (let f = 0; f < 4; f++) {
          const flameBlade = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 2.2, 6),
            new THREE.MeshBasicMaterial({
              color: f % 2 === 0 ? spell.primaryColor : spell.secondaryColor,
              transparent: true,
              opacity: 0.78,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          const ang = (f / 4) * Math.PI * 2;
          flameBlade.position.set(Math.cos(ang) * 0.7, Math.sin(ang) * 0.7, -0.4);
          flameBlade.rotation.x = -Math.PI / 2;
          group.add(flameBlade);
        }
      } else if (spell.vfxStyle === 'elf_shockwave') {
        // Expanding golden-cyan liberation shockwave rings
        for (let s = 0; s < 3; s++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.85 + s * 0.42, 0.07, 8, 28),
            new THREE.MeshBasicMaterial({
              color: s === 0 ? '#ffffff' : spell.primaryColor,
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending,
            })
          );
          group.add(ring);
        }
      }
    }

    // Dynamic PointLight on projectile
    const light = new THREE.PointLight(
      spell.primaryColor,
      spell.tier === 'ULTIMATE' ? 7.5 : spell.tier === 'MID' ? 4.2 : 2.2,
      spell.tier === 'ULTIMATE' ? 15 : 8,
      2
    );
    group.add(light);

    return { group, plasmaMat, lightningLine };
  }

  public spawnBurst(
    pos: THREE.Vector3,
    primaryHex: string,
    secondaryHex: string,
    smokeHex: string,
    count: number,
    speed: number,
    withShockwave = false,
    shockwaveScale = 5,
    withDebris = false
  ): void {
    if (!this.particlesEnabled) return;
    const colA = new THREE.Color(primaryHex);
    const colB = new THREE.Color(secondaryHex);

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const sp = speed * (0.35 + Math.random() * 0.85);
        p.vel.set(
          Math.sin(phi) * Math.cos(theta) * sp,
          Math.abs(Math.cos(phi)) * sp * 0.8 + 1.2,
          Math.sin(phi) * Math.sin(theta) * sp
        );
        p.age = 0;
        p.life = 0.35 + Math.random() * 0.55;
        p.color.copy(Math.random() > 0.4 ? colA : colB);
        spawned++;
      }
    }

    // Volumetric smoke puffs
    const smokeCount = withShockwave ? 5 : 2;
    for (let s = 0; s < smokeCount; s++) {
      const mat = new THREE.MeshStandardMaterial({
        color: smokeHex,
        emissive: secondaryHex,
        emissiveIntensity: 0.18,
        roughness: 0.95,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedSmokeGeo, mat);
      mesh.position.copy(pos).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.9,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 0.9
        )
      );
      const startScale = withShockwave ? 1.1 + Math.random() * 0.8 : 0.45 + Math.random() * 0.35;
      mesh.scale.setScalar(startScale);
      this.scene.add(mesh);
      this.smokes.push({
        mesh,
        mat,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2.5,
          1.4 + Math.random() * 1.8,
          (Math.random() - 0.5) * 2.5
        ),
        age: 0,
        life: 0.85 + Math.random() * 0.5,
        startScale,
      });
    }

    if (withShockwave) {
      this.spawnShockwave(pos, primaryHex, shockwaveScale, 0.52);
    }

    if (withDebris) {
      for (let d = 0; d < 8; d++) {
        const mesh = new THREE.Mesh(this.sharedDebrisGeo, this.sharedDebrisMat);
        mesh.position.set(pos.x, Math.max(0.25, pos.y), pos.z);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.debris.push({
          mesh,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 14,
            4 + Math.random() * 8,
            (Math.random() - 0.5) * 14
          ),
          rotVel: new THREE.Vector3(
            Math.random() * 10,
            Math.random() * 10,
            Math.random() * 10
          ),
          age: 0,
          life: 1.4,
        });
      }
    }
  }

  public spawnTrailSmoke(pos: THREE.Vector3, spell: SpellDefinition): void {
    if (!this.particlesEnabled) return;
    let spawned = 0;
    const target = spell.tier === 'ULTIMATE' ? 6 : spell.tier === 'MID' ? 3 : 2;
    const col = new THREE.Color(spell.primaryColor);
    for (let i = 0; i < this.maxParticles && spawned < target; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.4
          )
        );
        p.vel.set(
          (Math.random() - 0.5) * 1.8,
          0.5 + Math.random() * 1.2,
          (Math.random() - 0.5) * 1.8
        );
        p.age = 0;
        p.life = 0.28 + Math.random() * 0.25;
        p.color.copy(col);
        spawned++;
      }
    }
  }

  public spawnShockwave(
    pos: THREE.Vector3,
    colorHex: string,
    maxScale: number,
    duration = 0.55
  ): void {
    if (!this.particlesEnabled) return;
    const mat = createShockwaveMaterial(colorHex);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.position.set(pos.x, Math.max(0.08, pos.y * 0.2), pos.z);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      age: 0,
      duration,
      maxScale,
    });
  }

  public spawnImpactForTier(pos: THREE.Vector3, spell: SpellDefinition): void {
    const tier: SpellTier = spell.tier;
    if (tier === 'ULTIMATE') {
      this.spawnBurst(
        pos,
        spell.primaryColor,
        spell.secondaryColor,
        spell.smokeColor,
        95,
        16,
        true,
        13.5,
        true
      );
    } else if (tier === 'MID') {
      this.spawnBurst(
        pos,
        spell.primaryColor,
        spell.secondaryColor,
        spell.smokeColor,
        48,
        11,
        true,
        7.0,
        true
      );
    } else {
      this.spawnBurst(
        pos,
        spell.primaryColor,
        spell.secondaryColor,
        spell.smokeColor,
        22,
        7.5,
        true,
        3.2,
        false
      );
    }
  }

  public update(dt: number): void {
    // Update particles
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this.pPositions[i * 3 + 1] = -100;
        continue;
      }
      p.vel.y -= 5.0 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const fade = 1 - p.age / p.life;
      this.pPositions[i * 3] = p.pos.x;
      this.pPositions[i * 3 + 1] = p.pos.y;
      this.pPositions[i * 3 + 2] = p.pos.z;
      this.pColors[i * 3] = p.color.r * fade;
      this.pColors[i * 3 + 1] = p.color.g * fade;
      this.pColors[i * 3 + 2] = p.color.b * fade;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.duration);
      sw.mat.uniforms.uProgress.value = t;
      sw.mesh.scale.setScalar(0.8 + t * sw.maxScale);
      if (sw.age >= sw.duration) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // Update volumetric smoke clouds
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.age += dt;
      const t = sm.age / sm.life;
      sm.mesh.position.addScaledVector(sm.vel, dt);
      sm.mesh.rotation.y += dt * 1.4;
      sm.mesh.scale.setScalar(sm.startScale * (1 + t * 1.6));
      sm.mat.opacity = 0.62 * (1 - t);
      if (sm.age >= sm.life) {
        this.scene.remove(sm.mesh);
        sm.mat.dispose();
        this.smokes.splice(i, 1);
      }
    }

    // Update stone debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const db = this.debris[i];
      db.age += dt;
      db.vel.y -= 24 * dt;
      db.mesh.position.addScaledVector(db.vel, dt);
      if (db.mesh.position.y < 0.16) {
        db.mesh.position.y = 0.16;
        db.vel.y = Math.abs(db.vel.y) * 0.35;
        db.vel.x *= 0.72;
        db.vel.z *= 0.72;
      }
      db.mesh.rotation.x += db.rotVel.x * dt;
      db.mesh.rotation.y += db.rotVel.y * dt;
      if (db.age >= db.life) {
        this.scene.remove(db.mesh);
        this.debris.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.particlePoints);
    this.particleGeo.dispose();
    (this.particlePoints.material as THREE.Material).dispose();

    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.mat.dispose();
    }
    this.shockwaves = [];

    for (const sm of this.smokes) {
      this.scene.remove(sm.mesh);
      sm.mat.dispose();
    }
    this.smokes = [];

    for (const db of this.debris) {
      this.scene.remove(db.mesh);
    }
    this.debris = [];

    this.sharedSmokeGeo.dispose();
    this.sharedDebrisGeo.dispose();
    this.sharedDebrisMat.dispose();
  }
}
