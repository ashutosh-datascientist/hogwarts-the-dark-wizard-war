import * as THREE from 'three';
import { CharacterAnimState, CharacterDefinition } from './types';
import { ImportedCharacterAsset } from './CharacterManager';

export interface RigHandles {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  eyelids: THREE.Mesh[];
  armR: THREE.Group;
  forearmR: THREE.Group;
  handR: THREE.Group;
  armL: THREE.Group;
  forearmL: THREE.Group;
  legL: THREE.Group;
  shinL: THREE.Group;
  legR: THREE.Group;
  shinR: THREE.Group;
  robeBack: THREE.Mesh;
  robeLeft: THREE.Mesh;
  robeRight: THREE.Mesh;
  wandTip: THREE.Object3D;
  shieldMesh: THREE.Mesh;
  mixer: THREE.AnimationMixer;
  actions: Record<CharacterAnimState, THREE.AnimationAction>;
  materialsForHitFlash: THREE.MeshStandardMaterial[];
  isImportedGlb: boolean;
  dispose: () => void;
}

/**
 * Generates high-detail 512x512 human facial skin texture (pores, brow shading,
 * cheek blush/hollows, natural lips, Harry's lightning scar, Voldemort's gaunt veins,
 * Dumbledore/McGonagall age lines) plus a matching bump map.
 */
function createFaceTextures(
  def: CharacterDefinition
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const app = def.appearance;
  const isSerpent = app.hairStyle === 'bald_serpent';
  const isHouseElf = app.hairStyle === 'house_elf';
  const isFemale = def.voice.gender === 'female';
  const isElder = def.id === 'dumbledore' || def.id === 'mcgonagall';
  const isHarry = def.id === 'harry';
  const isGinger = def.id === 'ron' || def.id === 'ginny';

  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = app.skinTone;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  if (isSerpent) {
    // Gaunt reptilian temple & eye-socket hollows + subtle cyan-slate veins
    [212, 300].forEach((ex) => {
      const socketGrad = ctx.createRadialGradient(ex, 238, 4, ex, 238, 40);
      socketGrad.addColorStop(0, 'rgba(26,34,34,0.68)');
      socketGrad.addColorStop(0.55, 'rgba(42,52,50,0.34)');
      socketGrad.addColorStop(1, 'rgba(35,45,42,0)');
      ctx.fillStyle = socketGrad;
      ctx.fillRect(ex - 48, 190, 96, 96);
    });

    // Forked snake nostril slits
    ctx.strokeStyle = 'rgba(22, 28, 28, 0.88)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(256 + s * 5, 294);
      ctx.lineTo(256 + s * 9, 275);
      ctx.stroke();
    });

    // Sub-dermal veins on forehead & temples
    ctx.strokeStyle = 'rgba(46, 76, 70, 0.36)';
    ctx.lineWidth = 1.4;
    for (let v = 0; v < 8; v++) {
      ctx.beginPath();
      const sx = v < 4 ? 168 + v * 9 : 310 + (v - 4) * 9;
      ctx.moveTo(sx, 162);
      ctx.quadraticCurveTo(sx + (v < 4 ? 14 : -14), 205, sx + (v < 4 ? 5 : -5), 248);
      ctx.stroke();
    }

    // Thin pale-slate lips
    ctx.fillStyle = 'rgba(84, 94, 92, 0.72)';
    ctx.beginPath();
    ctx.ellipse(256, 326, 22, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(38, 46, 46, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(234, 326);
    ctx.lineTo(278, 326);
    ctx.stroke();
  } else {
    // Subsurface facial warmth zones (forehead, nose tip, cheeks) & jaw shadow
    const noseWarm = ctx.createRadialGradient(256, 284, 4, 256, 284, 34);
    noseWarm.addColorStop(0, 'rgba(195, 108, 92, 0.22)');
    noseWarm.addColorStop(1, 'rgba(195, 108, 92, 0)');
    ctx.fillStyle = noseWarm;
    ctx.fillRect(220, 248, 72, 72);

    // Sculpted cheekbone warmth + under-cheek contour
    [202, 310].forEach((cx, idx) => {
      const flush = ctx.createRadialGradient(cx, 276, 4, cx, 276, 40);
      flush.addColorStop(
        0,
        def.id === 'bellatrix'
          ? 'rgba(72, 62, 74, 0.34)'
          : isFemale
            ? 'rgba(198,94,94,0.32)'
            : 'rgba(186,98,84,0.24)'
      );
      flush.addColorStop(1, 'rgba(186,98,84,0)');
      ctx.fillStyle = flush;
      ctx.fillRect(cx - 46, 230, 92, 90);

      // Subtle cheekbone hollow beneath
      const hollow = ctx.createLinearGradient(cx - 24, 285, cx + 24, 320);
      hollow.addColorStop(0, 'rgba(65, 42, 35, 0.14)');
      hollow.addColorStop(1, 'rgba(65, 42, 35, 0)');
      ctx.fillStyle = hollow;
      ctx.fillRect(cx - 32 + (idx === 0 ? -4 : 4), 285, 64, 42);
    });

    // Jawline & chin shadow
    const chinShadow = ctx.createLinearGradient(0, 340, 0, 415);
    chinShadow.addColorStop(0, 'rgba(55, 36, 28, 0)');
    chinShadow.addColorStop(1, 'rgba(42, 26, 20, 0.26)');
    ctx.fillStyle = chinShadow;
    ctx.fillRect(160, 340, 192, 75);

    // Eye socket tear-trough & upper lid crease shading
    [216, 296].forEach((ex) => {
      const sg = ctx.createRadialGradient(ex, 240, 2, ex, 240, 28);
      sg.addColorStop(0, def.id === 'bellatrix' || def.id === 'snape' ? 'rgba(56,42,48,0.45)' : 'rgba(90,58,46,0.32)');
      sg.addColorStop(1, 'rgba(90,58,46,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(ex - 30, 210, 60, 60);

      // Subtle upper/lower lash contour
      ctx.strokeStyle = 'rgba(32, 22, 18, 0.55)';
      ctx.lineWidth = isFemale ? 1.9 : 1.3;
      ctx.beginPath();
      ctx.moveTo(ex - 16, 236);
      ctx.quadraticCurveTo(ex, 229, ex + 16, 236);
      ctx.stroke();
    });

    // Philtrum & nostril shadow
    ctx.fillStyle = 'rgba(72, 46, 38, 0.24)';
    ctx.beginPath();
    ctx.ellipse(248, 296, 4.5, 3.0, 0, 0, Math.PI * 2);
    ctx.ellipse(264, 296, 4.5, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(72, 46, 38, 0.14)';
    ctx.fillRect(253, 300, 6, 15);

    // Hair-stroke eyebrows (individual fine strokes rather than solid marker block)
    const browColor = isElder ? '#aeb8c2' : isHouseElf ? '#6d6254' : app.hairColor;
    ctx.strokeStyle = browColor;
    ctx.lineCap = 'round';
    [-1, 1].forEach((side) => {
      const startX = side < 0 ? 193 : 275;
      for (let h = 0; h < 16; h++) {
        const u = h / 15;
        const bx = startX + u * 44;
        const arch = Math.sin(u * Math.PI) * (isFemale ? 9 : 6.5);
        const by = 223 - arch;
        ctx.lineWidth = isFemale ? 1.5 : 2.1;
        ctx.beginPath();
        ctx.moveTo(bx, by + 2);
        ctx.lineTo(bx + side * 3.5, by - (isFemale ? 3.5 : 5));
        ctx.stroke();
      }
    });

    // Sculpted Cupid's-bow upper lip & fuller lower lip
    const upperLipCol = isFemale ? 'rgba(154, 58, 68, 0.85)' : 'rgba(142, 72, 66, 0.72)';
    const lowerLipCol = isFemale ? 'rgba(176, 76, 84, 0.82)' : 'rgba(162, 88, 80, 0.68)';
    ctx.fillStyle = upperLipCol;
    ctx.beginPath();
    ctx.moveTo(236, 325);
    ctx.quadraticCurveTo(246, 317, 256, 320);
    ctx.quadraticCurveTo(266, 317, 276, 325);
    ctx.quadraticCurveTo(256, 327, 236, 325);
    ctx.fill();

    ctx.fillStyle = lowerLipCol;
    ctx.beginPath();
    ctx.moveTo(238, 325);
    ctx.quadraticCurveTo(256, 338, 274, 325);
    ctx.quadraticCurveTo(256, 327, 238, 325);
    ctx.fill();

    // Lip parting line & mouth corner shadows
    ctx.strokeStyle = 'rgba(68, 30, 28, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(236, 325);
    ctx.quadraticCurveTo(256, 328, 276, 325);
    ctx.stroke();

    // Subtle natural freckles for Ron & Ginny
    if (isGinger) {
      ctx.fillStyle = 'rgba(150, 82, 54, 0.25)';
      for (let f = 0; f < 46; f++) {
        ctx.beginPath();
        ctx.arc(204 + Math.random() * 104, 260 + Math.random() * 34, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (app.hasBeard === 'stubble') {
      for (let s = 0; s < 950; s++) {
        ctx.fillStyle = 'rgba(32,26,22,0.18)';
        ctx.fillRect(204 + Math.random() * 104, 314 + Math.random() * 62, 1.6, 1.6);
      }
    } else if (!isFemale && !isHouseElf) {
      for (let s = 0; s < 280; s++) {
        ctx.fillStyle = 'rgba(40,30,25,0.065)';
        ctx.fillRect(214 + Math.random() * 84, 328 + Math.random() * 46, 1.5, 1.5);
      }
    }

    if (isElder || isHouseElf) {
      // Forehead, crow's feet & nasolabial character creases
      ctx.strokeStyle = 'rgba(82, 58, 48, 0.28)';
      ctx.lineWidth = 1.4;
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        ctx.moveTo(212, 180 + w * 9);
        ctx.quadraticCurveTo(256, 176 + w * 9, 300, 180 + w * 9);
        ctx.stroke();
      }
      // Nasolabial smile/expression folds
      ctx.beginPath();
      ctx.moveTo(234, 292);
      ctx.quadraticCurveTo(226, 314, 232, 336);
      ctx.moveTo(278, 292);
      ctx.quadraticCurveTo(286, 314, 280, 336);
      ctx.stroke();
    }

    // Harry's lightning-bolt scar
    if (isHarry) {
      ctx.strokeStyle = '#9e3b35';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(286, 174);
      ctx.lineTo(278, 189);
      ctx.lineTo(289, 193);
      ctx.lineTo(280, 209);
      ctx.stroke();

      bctx.strokeStyle = '#505050';
      bctx.lineWidth = 2.5;
      bctx.beginPath();
      bctx.moveTo(286, 174);
      bctx.lineTo(278, 189);
      bctx.lineTo(289, 193);
      bctx.lineTo(280, 209);
      bctx.stroke();
    }

    // Remus weathered werewolf scars
    if (def.id === 'remus') {
      ctx.strokeStyle = 'rgba(138, 76, 70, 0.6)';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(190, 230);
      ctx.lineTo(224, 296);
      ctx.moveTo(246, 256);
      ctx.lineTo(266, 284);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(70,45,35,0.038)' : 'rgba(255,245,235,0.032)';
    ctx.fillRect(x, y, 1.4, 1.4);
    const bv = Math.random() > 0.5 ? 114 : 142;
    bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bctx.fillRect(x, y, 1.4, 1.4);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  return { map, bumpMap };
}

function createIrisTexture(irisHex: string, slitPupil: boolean): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;

  // Natural sclera gradient (slightly shadowed near corners, clean white center)
  const sclera = ctx.createRadialGradient(64, 64, 16, 64, 64, 64);
  sclera.addColorStop(0, '#f3f5f7');
  sclera.addColorStop(0.75, '#dce2e8');
  sclera.addColorStop(1, '#aeb8c2');
  ctx.fillStyle = sclera;
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = 'rgba(180,60,60,0.18)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    ctx.lineTo(64 + Math.cos(a + 0.15) * 40, 64 + Math.sin(a + 0.15) * 40);
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 34);
  grad.addColorStop(0, irisHex);
  grad.addColorStop(0.76, irisHex);
  grad.addColorStop(1, '#080b10'); // Strong limbal ring
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12);
    ctx.lineTo(64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32);
    ctx.stroke();
  }

  ctx.fillStyle = '#030304';
  ctx.beginPath();
  if (slitPupil) {
    ctx.ellipse(64, 64, 5, 24, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(64, 64, 13, 0, Math.PI * 2);
  }
  ctx.fill();

  // Crisp corneal catchlight
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(54, 53, 4.2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClothTextures(primaryHex: string, secondaryHex: string): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = s;
  b.height = s;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, s, s);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, s, s);

  for (let y = 0; y < s; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, y, s, 1);
    bctx.fillStyle = y % 4 === 0 ? '#969696' : '#6c6c6c';
    bctx.fillRect(0, y, s, 1);
  }
  for (let x = 0; x < s; x += 2) {
    ctx.fillStyle = x % 4 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, 0, 1, s);
    bctx.fillStyle = x % 4 === 0 ? '#929292' : '#707070';
    bctx.fillRect(x, 0, 1, s);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  grad.addColorStop(1, secondaryHex);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

function buildSculptedHeadGeometry(isSerpent: boolean, isHouseElf: boolean): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.125, 48, 36);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    x *= isHouseElf ? 1.04 : 0.84;
    y *= isHouseElf ? 1.02 : 1.14;
    z *= isHouseElf ? 1.02 : 0.96;

    if (y < 0.01) {
      const jawT = Math.min(1, (-y) / 0.14);
      x *= 1.0 - jawT * (isHouseElf ? 0.56 : 0.42);
      if (z > 0) z *= 1.0 - jawT * 0.14;
      if (z > 0.04 && Math.abs(x) < 0.035 && y < -0.07) {
        z += 0.014;
      }
    }

    if (z > 0.03 && y > -0.025 && y < 0.035 && Math.abs(x) > 0.035) {
      z += 0.012;
      x += Math.sign(x) * 0.008;
    }

    if (z > 0.06 && y > 0.028 && y < 0.055 && Math.abs(x) < 0.068) {
      z += isSerpent ? 0.015 : 0.01;
    }

    const eyeDistL = Math.hypot(x + 0.036, y - 0.018);
    const eyeDistR = Math.hypot(x - 0.036, y - 0.018);
    if (z > 0.05 && (eyeDistL < 0.028 || eyeDistR < 0.028)) {
      const d = Math.min(eyeDistL, eyeDistR) / 0.028;
      z -= (1 - d) * 0.022;
    }

    if (z > 0.07 && Math.abs(x) < 0.024 && y > -0.028 && y < 0.032) {
      const nx = 1 - Math.abs(x) / 0.024;
      const ny = 1 - Math.abs(y) / 0.032;
      if (isSerpent) {
        z -= 0.005 * nx * ny;
      } else {
        const tipBias = y < 0.005 ? 1.35 : 0.8;
        z += (isHouseElf ? 0.042 : 0.028) * nx * ny * tipBias;
      }
    }

    if (z > 0.065 && Math.abs(x) < 0.034 && y > -0.068 && y < -0.032) {
      const lipWave = Math.sin(((y + 0.05) / 0.018) * Math.PI);
      z += Math.max(0, lipWave) * 0.006 * (1 - Math.abs(x) / 0.034);
    }

    if (isSerpent && z > 0 && Math.abs(x) > 0.035 && y < 0 && y > -0.065) {
      x *= 0.88;
    }

    pos.setXYZ(i, x, y, z);
  }

  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const py = pos.getY(i);
    const u = 0.5 + Math.atan2(px, pz) / (Math.PI * 2);
    const v = 0.5 + Math.asin(THREE.MathUtils.clamp(py / 0.145, -1, 1)) / Math.PI;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildSculptedLathe(
  profile: [number, number][],
  radialSegs = 20,
  xScale = 1,
  zScale = 1
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, radialSegs);
  geo.scale(xScale, 1, zScale);
  geo.computeVertexNormals();
  return geo;
}

function buildDrapedSkirtGeometry(
  topR: number,
  bottomR: number,
  height: number,
  pleatCount: number,
  tattered: boolean
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topR, bottomR, height, 36, 12, true);
  geo.translate(0, -height / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const t = Math.abs(y) / height;

    const frontDiff = Math.abs(Math.atan2(Math.sin(ang - Math.PI / 2), Math.cos(ang - Math.PI / 2)));
    const fold = Math.sin(ang * pleatCount) * 0.022 * t;
    const rScale = 1 + fold + (frontDiff < 0.35 && !tattered ? 0.04 : 0);

    if (tattered && t > 0.72) {
      const jag = Math.sin(ang * 9) * 0.065 + Math.cos(ang * 14) * 0.04;
      y += jag * ((t - 0.72) / 0.28);
    }

    pos.setXYZ(i, x * rScale, y, z * rScale);
  }
  geo.computeVertexNormals();
  return geo;
}

function createShieldShaderMaterial(colorHex: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec2 vUv;
      void main() {
        if (uOpacity <= 0.01) discard;
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.4);
        float ripple = sin(vUv.y * 32.0 - uTime * 7.0) * 0.5 + 0.5;
        float hex = sin(vUv.x * 40.0 + uTime * 2.5) * sin(vUv.y * 26.0);
        float pattern = smoothstep(0.32, 0.9, ripple * 0.5 + hex * 0.5);
        vec3 col = mix(uColor * 0.75, vec3(0.92, 0.97, 1.0), fresnel * 0.65 + pattern * 0.25);
        float alpha = (fresnel * 0.78 + 0.12 + pattern * 0.16) * uOpacity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function buildAnimationClips(): Record<CharacterAnimState, THREE.AnimationClip> {
  const q = (x: number, y: number, z: number) => {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    return [quat.x, quat.y, quat.z, quat.w];
  };

  const makeClip = (
    name: CharacterAnimState,
    duration: number,
    tracks: THREE.KeyframeTrack[]
  ) => new THREE.AnimationClip(name, duration, tracks);

  const idle = makeClip('idle', 2.6, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 1.3, 2.6], [0, 0.96, 0, 0, 0.985, 0, 0, 0.96, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 1.3, 2.6], [...q(0.04, -0.22, 0), ...q(0.07, -0.19, 0), ...q(0.04, -0.22, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 1.3, 2.6], [...q(-0.48, 0.18, -0.18), ...q(-0.42, 0.22, -0.15), ...q(-0.48, 0.18, -0.18)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 1.3, 2.6], [...q(-0.72, 0, 0), ...q(-0.64, 0, 0), ...q(-0.72, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 1.3, 2.6], [...q(-0.22, -0.12, 0.24), ...q(-0.26, -0.15, 0.26), ...q(-0.22, -0.12, 0.24)]),
    new THREE.QuaternionKeyframeTrack('legL.quaternion', [0, 2.6], [...q(-0.1, 0.1, 0.04), ...q(-0.1, 0.1, 0.04)]),
    new THREE.QuaternionKeyframeTrack('legR.quaternion', [0, 2.6], [...q(0.14, -0.1, -0.04), ...q(0.14, -0.1, -0.04)]),
  ]);

  const walk = makeClip('walk', 0.84, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.21, 0.42, 0.63, 0.84], [0, 0.94, 0, 0, 0.98, 0, 0, 0.94, 0, 0, 0.98, 0, 0, 0.94, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.42, 0.84], [...q(0.06, -0.1, 0), ...q(0.06, 0.1, 0), ...q(0.06, -0.1, 0)]),
    new THREE.QuaternionKeyframeTrack('legL.quaternion', [0, 0.21, 0.42, 0.63, 0.84], [...q(-0.4, 0, 0), ...q(0, 0, 0), ...q(0.38, 0, 0), ...q(0, 0, 0), ...q(-0.4, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('legR.quaternion', [0, 0.21, 0.42, 0.63, 0.84], [...q(0.38, 0, 0), ...q(0, 0, 0), ...q(-0.4, 0, 0), ...q(0, 0, 0), ...q(0.38, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('shinL.quaternion', [0, 0.21, 0.42, 0.63, 0.84], [...q(0.16, 0, 0), ...q(0.46, 0, 0), ...q(0.12, 0, 0), ...q(0.06, 0, 0), ...q(0.16, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('shinR.quaternion', [0, 0.21, 0.42, 0.63, 0.84], [...q(0.12, 0, 0), ...q(0.06, 0, 0), ...q(0.16, 0, 0), ...q(0.46, 0, 0), ...q(0.12, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.42, 0.84], [...q(0.3, 0, 0.18), ...q(-0.3, 0, 0.18), ...q(0.3, 0, 0.18)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.42, 0.84], [...q(-0.54, 0.12, -0.16), ...q(-0.38, 0.12, -0.16), ...q(-0.54, 0.12, -0.16)]),
  ]);

  const run = makeClip('run', 0.56, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.14, 0.28, 0.42, 0.56], [0, 0.9, 0, 0, 1.0, 0, 0, 0.9, 0, 0, 1.0, 0, 0, 0.9, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.28, 0.56], [...q(0.24, -0.14, 0), ...q(0.24, 0.14, 0), ...q(0.24, -0.14, 0)]),
    new THREE.QuaternionKeyframeTrack('legL.quaternion', [0, 0.14, 0.28, 0.42, 0.56], [...q(-0.7, 0, 0), ...q(0.06, 0, 0), ...q(0.65, 0, 0), ...q(-0.06, 0, 0), ...q(-0.7, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('legR.quaternion', [0, 0.14, 0.28, 0.42, 0.56], [...q(0.65, 0, 0), ...q(-0.06, 0, 0), ...q(-0.7, 0, 0), ...q(0.06, 0, 0), ...q(0.65, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('shinL.quaternion', [0, 0.14, 0.28, 0.42, 0.56], [...q(0.36, 0, 0), ...q(0.88, 0, 0), ...q(0.2, 0, 0), ...q(0.15, 0, 0), ...q(0.36, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('shinR.quaternion', [0, 0.14, 0.28, 0.42, 0.56], [...q(0.2, 0, 0), ...q(0.15, 0, 0), ...q(0.36, 0, 0), ...q(0.88, 0, 0), ...q(0.2, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.28, 0.56], [...q(0.58, 0, 0.22), ...q(-0.58, 0, 0.22), ...q(0.58, 0, 0.22)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.28, 0.56], [...q(-0.68, 0.1, -0.18), ...q(-0.28, 0.1, -0.18), ...q(-0.68, 0.1, -0.18)]),
  ]);

  const cast_basic = makeClip('cast_basic', 0.42, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.12, 0.26, 0.42], [...q(0, -0.22, 0), ...q(-0.08, -0.36, 0), ...q(0.16, 0.2, 0), ...q(0.04, -0.22, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.12, 0.26, 0.42], [...q(-0.48, 0.18, -0.18), ...q(-1.18, -0.26, -0.35), ...q(-1.46, 0.04, 0.05), ...q(-0.48, 0.18, -0.18)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 0.12, 0.26, 0.42], [...q(-0.7, 0, 0), ...q(-0.95, 0, 0), ...q(-0.1, 0, 0), ...q(-0.72, 0, 0)]),
  ]);

  const cast_mid = makeClip('cast_mid', 0.65, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.2, 0.42, 0.65], [...q(0, -0.2, 0), ...q(-0.18, -0.48, -0.08), ...q(0.24, 0.3, 0.06), ...q(0.04, -0.22, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.2, 0.42, 0.65], [...q(-0.48, 0.2, -0.2), ...q(-2.15, -0.32, -0.52), ...q(-1.38, 0.12, 0.15), ...q(-0.48, 0.18, -0.18)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 0.2, 0.42, 0.65], [...q(-0.7, 0, 0), ...q(-0.35, 0, 0), ...q(-0.08, 0, 0), ...q(-0.72, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.2, 0.42, 0.65], [...q(-0.22, 0, 0.22), ...q(-0.68, 0.2, 0.45), ...q(-0.35, -0.2, 0.35), ...q(-0.22, -0.12, 0.24)]),
  ]);

  const cast_ultimate = makeClip('cast_ultimate', 1.15, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.45, 0.72, 1.15], [0, 0.96, 0, 0, 1.06, 0, 0, 0.92, 0, 0, 0.96, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.45, 0.72, 1.15], [...q(0, -0.2, 0), ...q(-0.3, -0.1, 0), ...q(0.34, 0.12, 0), ...q(0.04, -0.22, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.45, 0.72, 1.15], [...q(-0.48, 0.18, -0.18), ...q(-2.65, 0.1, -0.32), ...q(-1.5, 0, 0), ...q(-0.48, 0.18, -0.18)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 0.45, 0.72, 1.15], [...q(-0.72, 0, 0), ...q(-0.15, 0, 0), ...q(-0.05, 0, 0), ...q(-0.72, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.45, 0.72, 1.15], [...q(-0.22, -0.12, 0.24), ...q(-2.25, 0, 0.42), ...q(-0.92, -0.2, 0.45), ...q(-0.22, -0.12, 0.24)]),
  ]);

  const clash = makeClip('clash', 0.4, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.2, 0.4], [0, 0.88, 0, 0, 0.9, 0, 0, 0.88, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.2, 0.4], [...q(0.12, 0.08, 0), ...q(0.15, 0.05, 0), ...q(0.12, 0.08, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.2, 0.4], [...q(-1.46, 0.12, 0), ...q(-1.43, 0.08, -0.04), ...q(-1.46, 0.12, 0)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 0.4], [...q(-0.12, 0, 0), ...q(-0.12, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.2, 0.4], [...q(-1.3, -0.28, 0.15), ...q(-1.34, -0.25, 0.12), ...q(-1.3, -0.28, 0.15)]),
    new THREE.QuaternionKeyframeTrack('legL.quaternion', [0, 0.4], [...q(-0.36, 0.1, 0.12), ...q(-0.36, 0.1, 0.12)]),
    new THREE.QuaternionKeyframeTrack('legR.quaternion', [0, 0.4], [...q(0.4, -0.1, -0.12), ...q(0.4, -0.1, -0.12)]),
  ]);

  const shield = makeClip('shield', 0.6, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.6], [...q(-0.04, -0.25, 0), ...q(-0.04, -0.25, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.6], [...q(-1.26, 0.42, -0.2), ...q(-1.26, 0.42, -0.2)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 0.6], [...q(-0.78, 0, 0.22), ...q(-0.78, 0, 0.22)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.6], [...q(-0.65, -0.3, 0.25), ...q(-0.65, -0.3, 0.25)]),
  ]);

  const dodge = makeClip('dodge', 0.35, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.18, 0.35], [0, 0.85, 0, 0, 0.72, 0, 0, 0.94, 0]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.18, 0.35], [...q(0.1, 0, 0), ...q(0.48, 0.35, 0.2), ...q(0.05, -0.15, 0)]),
  ]);

  const hit = makeClip('hit', 0.38, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.12, 0.38], [...q(0, 0, 0), ...q(-0.38, 0.18, -0.12), ...q(0.04, -0.22, 0)]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.12, 0.38], [...q(0, 0, 0), ...q(-0.32, 0.15, 0), ...q(0, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.12, 0.38], [...q(-0.48, 0.18, -0.18), ...q(-0.15, 0.45, -0.55), ...q(-0.48, 0.18, -0.18)]),
  ]);

  const victory = makeClip('victory', 1.6, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.8, 1.6], [...q(-0.08, 0, 0), ...q(-0.12, 0.08, 0), ...q(-0.08, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.8, 1.6], [...q(-2.65, 0, -0.25), ...q(-2.78, 0.1, -0.3), ...q(-2.65, 0, -0.25)]),
    new THREE.QuaternionKeyframeTrack('forearmR.quaternion', [0, 1.6], [...q(-0.15, 0, 0), ...q(-0.15, 0, 0)]),
  ]);

  const defeat = makeClip('defeat', 1.1, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.5, 1.1], [0, 0.96, 0, 0, 0.42, 0, 0, 0.25, 0]),
    new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0, 0.6, 1.1], [...q(0, 0, 0), ...q(0.45, 0, 0.15), ...q(1.25, 0.1, 0.2)]),
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.6, 1.1], [...q(0.1, 0, 0), ...q(0.45, 0, 0), ...q(0.25, 0, 0)]),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 1.1], [...q(-0.4, 0, -0.2), ...q(0.2, 0, -0.6)]),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 1.1], [...q(-0.2, 0, 0.2), ...q(0.15, 0, 0.65)]),
  ]);

  return {
    idle,
    walk,
    run,
    cast_basic,
    cast_mid,
    cast_ultimate,
    clash,
    shield,
    dodge,
    hit,
    victory,
    defeat,
  };
}

const SHARED_CLIPS = buildAnimationClips();

export class CharacterRigBuilder {
  public static build(
    def: CharacterDefinition,
    imported?: ImportedCharacterAsset
  ): RigHandles {
    const root = new THREE.Group();
    const app = def.appearance;
    const isSerpent = app.hairStyle === 'bald_serpent';
    const isHouseElf = app.hairStyle === 'house_elf';
    const isDarkFaction = def.faction === 'DARK_ARTS';

    // 1. Imported Photorealistic GLB/GLTF Model Pipeline (when supplied by user)
    if (imported) {
      const model = imported.gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.5, box.max.y - box.min.y);
      const normScale = (1.82 * app.heightScale) / height;
      model.scale.setScalar(normScale);
      model.position.y = -box.min.y * normScale;
      root.add(model);

      let handBone: THREE.Object3D | null = null;
      model.traverse((obj) => {
        const n = obj.name.toLowerCase();
        if (!handBone && (n.includes('righthand') || n.includes('hand_r') || n.includes('hand.r'))) {
          handBone = obj;
        }
      });

      const wandTip = new THREE.Object3D();
      if (handBone) {
        wandTip.position.set(0, 0.15, 0.35);
        (handBone as THREE.Object3D).add(wandTip);
      } else {
        wandTip.position.set(0.32, 1.32 * app.heightScale, 0.58);
        root.add(wandTip);
      }

      const shieldMat = createShieldShaderMaterial(def.spells.basic.primaryColor);
      const shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.38 * app.heightScale, 32, 24),
        shieldMat
      );
      shieldMesh.position.y = 1.05 * app.heightScale;
      shieldMesh.visible = false;
      root.add(shieldMesh);

      const mixer = new THREE.AnimationMixer(model);
      const fallbackDummy = new THREE.Group();
      const actions = {} as Record<CharacterAnimState, THREE.AnimationAction>;
      (Object.keys(SHARED_CLIPS) as CharacterAnimState[]).forEach((state) => {
        const clip =
          imported.gltf.animations.find((a) =>
            a.name.toLowerCase().includes(state.split('_')[0])
          ) || SHARED_CLIPS[state];
        actions[state] = mixer.clipAction(clip);
      });
      actions.idle.play();

      return {
        root,
        pelvis: fallbackDummy,
        spine: fallbackDummy,
        chest: fallbackDummy,
        head: fallbackDummy,
        eyes: [],
        eyelids: [],
        armR: fallbackDummy,
        forearmR: fallbackDummy,
        handR: fallbackDummy,
        armL: fallbackDummy,
        forearmL: fallbackDummy,
        legL: fallbackDummy,
        shinL: fallbackDummy,
        legR: fallbackDummy,
        shinR: fallbackDummy,
        robeBack: new THREE.Mesh(),
        robeLeft: new THREE.Mesh(),
        robeRight: new THREE.Mesh(),
        wandTip,
        shieldMesh,
        mixer,
        actions,
        materialsForHitFlash: [],
        isImportedGlb: true,
        dispose: () => {
          shieldMat.dispose();
          shieldMesh.geometry.dispose();
        },
      };
    }

    // 2. Sculpted Organic Procedural Humanoid Rig for all 15 characters
    const hitMats: THREE.MeshStandardMaterial[] = [];

    const { map: faceMap, bumpMap: faceBump } = createFaceTextures(def);
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceMap,
      bumpMap: faceBump,
      bumpScale: 0.004,
      roughness: isSerpent ? 0.56 : 0.62,
      metalness: 0.02,
    });
    hitMats.push(faceMat);

    const skinMat = new THREE.MeshStandardMaterial({
      color: app.skinTone,
      bumpMap: faceBump,
      bumpScale: 0.003,
      roughness: 0.62,
      metalness: 0.02,
    });
    hitMats.push(skinMat);

    const { map: clothMap, bumpMap: clothBump } = createClothTextures(
      app.robePrimary,
      app.robeSecondary
    );
    const robeMat = new THREE.MeshStandardMaterial({
      map: clothMap,
      bumpMap: clothBump,
      bumpScale: 0.008,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    hitMats.push(robeMat);

    const innerFabricMat = new THREE.MeshStandardMaterial({
      color: app.robeSecondary,
      bumpMap: clothBump,
      bumpScale: 0.006,
      roughness: 0.76,
      metalness: 0.05,
    });
    hitMats.push(innerFabricMat);

    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#171514',
      roughness: 0.34,
      metalness: 0.14,
    });

    const metalTrimMat = new THREE.MeshStandardMaterial({
      color: app.trimColor,
      roughness: 0.3,
      metalness: 0.78,
    });

    const hairMat = new THREE.MeshStandardMaterial({
      color: app.hairColor,
      roughness: 0.52,
      metalness: 0.08,
    });

    const rigPivot = new THREE.Group();
    rigPivot.scale.set(app.buildScale, app.heightScale, app.buildScale);
    root.add(rigPivot);

    // Contact shadow grounding
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const sctx = shadowCanvas.getContext('2d')!;
    const sgrad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    sgrad.addColorStop(0, 'rgba(0,0,0,0.68)');
    sgrad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 64, 64);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 1.45),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    root.add(contactShadow);

    // Pelvis
    const pelvis = new THREE.Group();
    pelvis.name = 'pelvis';
    pelvis.position.set(0, 0.96, 0);
    rigPivot.add(pelvis);

    const hipGeo = buildSculptedLathe(
      [
        [0.145, -0.11],
        [0.175, -0.02],
        [0.165, 0.08],
        [0.142, 0.12],
      ],
      22,
      1.08,
      0.82
    );
    const hipMesh = new THREE.Mesh(hipGeo, innerFabricMat);
    hipMesh.castShadow = true;
    pelvis.add(hipMesh);

    if (!isSerpent && !isHouseElf) {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.02, 10, 24), leatherMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.06, 0.82, 1);
      belt.position.y = 0.08;
      pelvis.add(belt);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), metalTrimMat);
      buckle.position.set(0, 0.08, 0.135);
      pelvis.add(buckle);
    }

    const tatteredSkirt = isSerpent || isHouseElf || def.id === 'bellatrix';
    const skirtGeo = buildDrapedSkirtGeometry(
      0.165,
      tatteredSkirt ? 0.42 : 0.33,
      isHouseElf ? 0.56 : 0.92,
      tatteredSkirt ? 11 : 8,
      tatteredSkirt
    );
    const robeBack = new THREE.Mesh(skirtGeo, robeMat);
    robeBack.position.set(0, 0.07, -0.02);
    robeBack.castShadow = true;
    pelvis.add(robeBack);

    // Sculpted side cloak/robe panels so character coats & robes drape & billow naturally
    const sideHeight = isHouseElf ? 0.54 : 0.88;
    const makeSidePanelGeo = (side: -1 | 1) => {
      const geo = new THREE.CylinderGeometry(0.18, 0.34, sideHeight, 14, 6, true, 0, Math.PI * 0.55);
      geo.translate(0, -sideHeight / 2, 0);
      geo.rotateY(side > 0 ? Math.PI * 0.22 : -Math.PI * 0.77);
      return geo;
    };
    const robeLeft = new THREE.Mesh(makeSidePanelGeo(-1), robeMat);
    robeLeft.position.set(-0.02, 0.07, 0);
    robeLeft.castShadow = true;
    pelvis.add(robeLeft);

    const robeRight = new THREE.Mesh(makeSidePanelGeo(1), robeMat);
    robeRight.position.set(0.02, 0.07, 0);
    robeRight.castShadow = true;
    pelvis.add(robeRight);

    // Spine & Sculpted Chest/Shoulders
    const spine = new THREE.Group();
    spine.name = 'spine';
    spine.position.set(0, 0.11, 0);
    pelvis.add(spine);

    const waistGeo = buildSculptedLathe(
      [
        [0.142, 0],
        [0.135, 0.11],
        [0.152, 0.22],
      ],
      22,
      1.06,
      0.78
    );
    const waistMesh = new THREE.Mesh(waistGeo, innerFabricMat);
    waistMesh.castShadow = true;
    spine.add(waistMesh);

    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.set(0, 0.21, 0);
    spine.add(chest);

    const chestGeo = buildSculptedLathe(
      [
        [0.152, 0],
        [0.195, 0.14],
        [0.212, 0.26],
        [0.185, 0.34],
        [0.082, 0.37],
      ],
      24,
      1.12,
      0.76
    );
    const chestMesh = new THREE.Mesh(chestGeo, robeMat);
    chestMesh.castShadow = true;
    chest.add(chestMesh);

    if (isDarkFaction && !isHouseElf) {
      // Draped high collar / Death Eater cloak shoulder mantle
      const cowlGeo = buildSculptedLathe(
        [
          [0.24, 0.22],
          [0.21, 0.33],
          [0.15, 0.41],
        ],
        22,
        1.14,
        0.88
      );
      const cowl = new THREE.Mesh(cowlGeo, robeMat);
      cowl.castShadow = true;
      chest.add(cowl);
    } else if (!isHouseElf) {
      // Ornate Hogwarts sash / lapels / house tie
      const trimStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.3, 0.015),
        metalTrimMat
      );
      trimStripe.position.set(0, 0.2, 0.138);
      if (def.id === 'dumbledore' || def.id === 'mcgonagall') {
        chest.add(trimStripe);
      } else {
        const shirtV = new THREE.Mesh(
          new THREE.ConeGeometry(0.078, 0.16, 4),
          new THREE.MeshStandardMaterial({ color: '#d8dce0', roughness: 0.85 })
        );
        shirtV.rotation.x = Math.PI;
        shirtV.rotation.y = Math.PI / 4;
        shirtV.position.set(0, 0.28, 0.115);
        shirtV.scale.set(1, 1, 0.3);
        chest.add(shirtV);

        const tieColor = def.id === 'draco' || def.id === 'lucius' || def.id === 'snape' ? '#14532d' : '#7f1d1d';
        const tie = new THREE.Mesh(
          new THREE.BoxGeometry(0.032, 0.19, 0.015),
          new THREE.MeshStandardMaterial({ color: tieColor, roughness: 0.55 })
        );
        tie.position.set(0, 0.22, 0.135);
        chest.add(tie);
      }
    }

    // Neck
    const neckGeo = buildSculptedLathe(
      [
        [0.068, 0],
        [0.056, 0.06],
        [0.054, 0.12],
      ],
      16
    );
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 0.35, 0.01);
    chest.add(neck);

    // Sculpted Organic Head
    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.49, 0.022);
    chest.add(head);

    const headGeo = buildSculptedHeadGeometry(isSerpent, isHouseElf);
    const headMesh = new THREE.Mesh(headGeo, faceMat);
    headMesh.castShadow = true;
    head.add(headMesh);

    // Eyes with Iris + Clearcoat Cornea
    const irisTex = createIrisTexture(app.eyeColor, isSerpent);
    const eyeBallMat = new THREE.MeshPhysicalMaterial({
      map: irisTex,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      emissive: isSerpent ? '#5e0a0a' : isHouseElf ? '#14532d' : '#000000',
      emissiveIntensity: isSerpent ? 0.45 : isHouseElf ? 0.25 : 0,
    });
    const lidMat = new THREE.MeshStandardMaterial({
      color: app.skinTone,
      roughness: 0.6,
    });

    const eyes: THREE.Mesh[] = [];
    const eyelids: THREE.Mesh[] = [];
    const eyeRadius = isHouseElf ? 0.022 : 0.0145;
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius, 16, 12), eyeBallMat);
      eye.position.set(side * (isHouseElf ? 0.044 : 0.036), 0.018, isHouseElf ? 0.105 : 0.094);
      eye.rotation.y = -Math.PI / 2;
      head.add(eye);
      eyes.push(eye);

      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(eyeRadius * 1.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        lidMat
      );
      lid.position.copy(eye.position);
      lid.rotation.x = -0.28;
      head.add(lid);
      eyelids.push(lid);

      if (isHouseElf) {
        // Long pointed house-elf ears
        const elfEar = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.2, 8), skinMat);
        elfEar.rotation.z = side * -1.35;
        elfEar.rotation.y = side * -0.25;
        elfEar.position.set(side * 0.165, 0.01, -0.01);
        head.add(elfEar);
      } else {
        const ear = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.007, 8, 14, Math.PI * 1.5), skinMat);
        ear.rotation.y = side * (Math.PI / 2);
        ear.position.set(side * 0.104, 0.002, -0.012);
        head.add(ear);
      }
    });

    // Glasses (Round for Harry, Half-moon for Dumbledore & McGonagall)
    if (app.hasGlasses) {
      const frameMat = new THREE.MeshStandardMaterial({
        color: app.hasGlasses === 'half_moon' ? '#d4af37' : '#1b1f26',
        metalness: 0.85,
        roughness: 0.25,
      });
      const lensMat = new THREE.MeshPhysicalMaterial({
        color: '#d8eeff',
        transparent: true,
        opacity: 0.22,
        roughness: 0.06,
        clearcoat: 1.0,
      });
      const yOffset = app.hasGlasses === 'half_moon' ? 0.011 : 0.018;
      const rLens = app.hasGlasses === 'half_moon' ? 0.019 : 0.023;
      [-1, 1].forEach((side) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(rLens, 0.0025, 8, 22), frameMat);
        rim.position.set(side * 0.036, yOffset, 0.114);
        if (app.hasGlasses === 'half_moon') rim.scale.set(1.1, 0.65, 1);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(rLens * 0.9, 18), lensMat);
        lens.position.copy(rim.position);
        if (app.hasGlasses === 'half_moon') lens.scale.set(1.1, 0.65, 1);
        head.add(rim, lens);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), frameMat);
      bridge.position.set(0, yOffset, 0.114);
      head.add(bridge);
    }

    // Hair & Hats tailored per hairStyle with natural hairline & layered locks
    if (!isSerpent && !isHouseElf) {
      const scalp = new THREE.Mesh(
        new THREE.SphereGeometry(0.116, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hairMat
      );
      scalp.scale.set(0.87, 1.08, 0.98);
      scalp.position.set(0, 0.018, -0.014);
      head.add(scalp);

      // Subtle sideburn / temple locks framing the cheeks
      [-1, 1].forEach((side) => {
        const temple = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.012, 0.045, 4, 8),
          hairMat
        );
        temple.position.set(side * 0.095, 0.02, 0.015);
        temple.rotation.z = side * 0.12;
        head.add(temple);
      });

      const isLongHair =
        app.hairStyle === 'long_beard' ||
        app.hairStyle === 'greasy_curtain' ||
        app.hairStyle === 'wild_curls' ||
        app.hairStyle === 'bushy_waves' ||
        app.hairStyle === 'shaggy_shoulder' ||
        app.hairStyle === 'sleek_platinum' ||
        app.hairStyle === 'long_ginger';

      const lockCount = isLongHair ? 24 : 18;
      const dropY = isLongHair ? -0.155 : -0.012;

      for (let h = 0; h < lockCount; h++) {
        const ang = (h / lockCount) * Math.PI * 1.88 - Math.PI * 0.94;
        const r = 0.101;
        const isFront = Math.cos(ang) > 0.36;
        if (isFront && (app.hairStyle === 'slicked_blonde' || app.hairStyle === 'witch_hat_bun')) {
          continue; // slicked back forehead
        }
        const wave =
          app.hairStyle === 'wild_curls' || app.hairStyle === 'bushy_waves'
            ? Math.sin(h * 2.3) * 0.024
            : app.hairStyle === 'messy_short' || app.hairStyle === 'messy_ginger'
              ? Math.sin(h * 3.1) * 0.012
              : 0;
        const p0 = new THREE.Vector3(Math.sin(ang) * 0.032, 0.132, Math.cos(ang) * 0.032 - 0.01);
        const p1 = new THREE.Vector3(
          Math.sin(ang) * r * 1.07 + wave,
          0.088,
          Math.cos(ang) * r * 1.04
        );
        const p2 = new THREE.Vector3(
          Math.sin(ang + 0.08) * r * 1.11 - wave,
          isFront ? 0.048 : dropY,
          Math.cos(ang + 0.08) * r * 1.0
        );
        const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
        const lock = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 9, isLongHair ? 0.019 : 0.0155, 6, false),
          hairMat
        );
        head.add(lock);
      }

      if (app.hairStyle === 'long_beard') {
        // Dumbledore's embroidered wizard skullcap
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.082, 0.108, 0.11, 20),
          robeMat
        );
        cap.position.set(0, 0.145, -0.008);
        head.add(cap);
        const capBand = new THREE.Mesh(
          new THREE.TorusGeometry(0.106, 0.007, 8, 22),
          metalTrimMat
        );
        capBand.rotation.x = Math.PI / 2;
        capBand.position.set(0, 0.095, -0.008);
        head.add(capBand);
      } else if (app.hairStyle === 'witch_hat_bun') {
        // McGonagall's tall pointed Hogwarts witch hat + tight bun
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), hairMat);
        bun.position.set(0, 0.02, -0.125);
        head.add(bun);

        const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.014, 24), robeMat);
        hatBrim.position.set(0, 0.12, -0.01);
        hatBrim.rotation.x = -0.1;
        head.add(hatBrim);

        const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 20), robeMat);
        hatCone.position.set(0, 0.28, -0.025);
        hatCone.rotation.x = -0.16;
        head.add(hatCone);

        const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.008, 8, 20), metalTrimMat);
        hatBand.rotation.x = Math.PI / 2 - 0.12;
        hatBand.position.set(0, 0.132, -0.012);
        head.add(hatBand);
      }
    }

    // Beards
    if (app.hasBeard === 'long_silver') {
      const beardGeo = buildSculptedLathe(
        [
          [0.018, -0.36],
          [0.052, -0.2],
          [0.078, -0.04],
          [0.086, 0.02],
        ],
        16,
        0.95,
        0.65
      );
      const beard = new THREE.Mesh(beardGeo, hairMat);
      beard.position.set(0, -0.065, 0.075);
      head.add(beard);
    } else if (app.hasBeard === 'trimmed_dark') {
      const goatee = new THREE.Mesh(
        buildSculptedLathe([[0.02, -0.08], [0.055, 0]], 12, 0.9, 0.55),
        hairMat
      );
      goatee.position.set(0, -0.07, 0.072);
      head.add(goatee);
    }

    // Sculpted Arms, Forearms, Wrist Cuffs, Articulated 5-Finger Hands & Wands
    const upperArmGeo = buildSculptedLathe(
      [
        [0.038, -0.27],
        [0.046, -0.13],
        [0.054, 0],
      ],
      16
    );
    const forearmGeo = buildSculptedLathe(
      [
        [0.026, -0.25],
        [0.036, -0.12],
        [0.04, 0],
      ],
      16
    );

    const buildArticulatedHand = (hand: THREE.Group, isRightHand: boolean) => {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.026), skinMat);
      palm.position.set(0, -0.032, 0.004);
      hand.add(palm);

      const fingerSpecs = [
        { x: -0.019, len: 0.054, rad: 0.0068 }, // Index
        { x: -0.006, len: 0.059, rad: 0.007 },  // Middle
        { x: 0.007, len: 0.054, rad: 0.0065 },  // Ring
        { x: 0.019, len: 0.043, rad: 0.0058 },  // Pinky
      ];

      fingerSpecs.forEach((f, idx) => {
        const fingerGroup = new THREE.Group();
        fingerGroup.position.set(isRightHand ? -f.x : f.x, -0.062, 0.006);
        const prox = new THREE.Mesh(
          new THREE.CapsuleGeometry(f.rad, f.len * 0.45, 4, 7),
          skinMat
        );
        prox.position.y = -f.len * 0.25;
        fingerGroup.add(prox);

        const distSeg = new THREE.Mesh(
          new THREE.CapsuleGeometry(f.rad * 0.84, f.len * 0.4, 4, 7),
          skinMat
        );
        distSeg.position.set(0, -f.len * 0.62, isRightHand && !isHouseElf ? 0.012 : 0.006);
        distSeg.rotation.x = isRightHand && !isHouseElf ? -1.05 : -0.45;
        fingerGroup.add(distSeg);

        // Right hand fingers curl neatly around wand grip; left hand relaxes slightly staggered
        fingerGroup.rotation.x = isRightHand && !isHouseElf ? -0.92 - idx * 0.05 : -0.24 - idx * 0.06;
        hand.add(fingerGroup);
      });

      // Opposable thumb
      const thumbGroup = new THREE.Group();
      thumbGroup.position.set(isRightHand ? -0.026 : 0.026, -0.026, 0.014);
      const thumbMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.034, 4, 7), skinMat);
      thumbMesh.position.set(0, -0.018, 0.008);
      thumbGroup.add(thumbMesh);
      thumbGroup.rotation.z = isRightHand ? -0.55 : 0.55;
      thumbGroup.rotation.x = isRightHand && !isHouseElf ? -0.65 : -0.25;
      hand.add(thumbGroup);
    };

    const buildArm = (side: 1 | -1, namePrefix: string) => {
      const shoulder = new THREE.Group();
      shoulder.name = `arm${namePrefix}`;
      shoulder.position.set(side * 0.21, 0.31, 0);
      chest.add(shoulder);

      const upperMesh = new THREE.Mesh(upperArmGeo, isHouseElf ? skinMat : robeMat);
      upperMesh.castShadow = true;
      shoulder.add(upperMesh);

      const forearm = new THREE.Group();
      forearm.name = `forearm${namePrefix}`;
      forearm.position.set(0, -0.27, 0);
      shoulder.add(forearm);

      const foreMesh = new THREE.Mesh(forearmGeo, isHouseElf ? skinMat : robeMat);
      foreMesh.castShadow = true;
      forearm.add(foreMesh);

      if (!isHouseElf) {
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.033, 0.03, 0.038, 12),
          innerFabricMat
        );
        cuff.position.y = -0.235;
        forearm.add(cuff);
      }

      const hand = new THREE.Group();
      hand.name = `hand${namePrefix}`;
      hand.position.set(0, -0.255, 0);
      forearm.add(hand);

      buildArticulatedHand(hand, side === 1);

      return { shoulder, forearm, hand };
    };

    const rightArm = buildArm(1, 'R');
    const leftArm = buildArm(-1, 'L');

    // Individual Wand (or glowing elf-magic fingertip aura for Dobby)
    const wandTip = new THREE.Object3D();
    if (!isHouseElf) {
      const wandGeo = buildSculptedLathe(
        [
          [0.012, 0],
          [0.011, 0.08],
          [0.007, 0.24],
          [0.0035, 0.42],
        ],
        10
      );
      wandGeo.rotateX(Math.PI / 2);
      const wandMat = new THREE.MeshStandardMaterial({
        color: app.wandWoodColor,
        roughness: 0.4,
        metalness: 0.12,
      });
      const wandMesh = new THREE.Mesh(wandGeo, wandMat);
      wandMesh.position.set(0, -0.045, 0.015);
      rightArm.hand.add(wandMesh);
      wandTip.position.set(0, -0.045, 0.435);
    } else {
      wandTip.position.set(0, -0.06, 0.08);
    }

    const wandEmber = new THREE.Mesh(
      new THREE.SphereGeometry(isHouseElf ? 0.032 : 0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: app.wandTipColor })
    );
    wandTip.add(wandEmber);
    rightArm.hand.add(wandTip);

    // Sculpted Legs & Boots
    const thighGeo = buildSculptedLathe(
      [
        [0.052, -0.42],
        [0.068, -0.2],
        [0.076, 0],
      ],
      16
    );
    const shinGeo = buildSculptedLathe(
      [
        [0.036, -0.42],
        [0.048, -0.22],
        [0.052, 0],
      ],
      16
    );

    const buildLeg = (side: -1 | 1, suffix: string) => {
      const leg = new THREE.Group();
      leg.name = `leg${suffix}`;
      leg.position.set(side * 0.095, -0.06, 0);
      pelvis.add(leg);
      leg.add(new THREE.Mesh(thighGeo, isHouseElf ? skinMat : innerFabricMat));

      const shin = new THREE.Group();
      shin.name = `shin${suffix}`;
      shin.position.set(0, -0.42, 0);
      leg.add(shin);
      shin.add(new THREE.Mesh(shinGeo, isHouseElf ? skinMat : leatherMat));

      const bootFoot = new THREE.Mesh(
        buildSculptedLathe([[0.032, 0], [0.042, 0.06], [0.038, 0.17]], 12, 0.95, 0.62),
        isHouseElf ? skinMat : leatherMat
      );
      bootFoot.rotation.x = Math.PI / 2;
      bootFoot.position.set(0, -0.42, -0.03);
      shin.add(bootFoot);

      return { leg, shin };
    };

    const leftLeg = buildLeg(-1, 'L');
    const rightLeg = buildLeg(1, 'R');

    // Protego Shield Dome
    const shieldMat = createShieldShaderMaterial(def.spells.basic.primaryColor);
    const shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 32, 24),
      shieldMat
    );
    shieldMesh.position.y = 1.05;
    shieldMesh.visible = false;
    rigPivot.add(shieldMesh);

    const mixer = new THREE.AnimationMixer(rigPivot);
    const actions = {} as Record<CharacterAnimState, THREE.AnimationAction>;
    (Object.keys(SHARED_CLIPS) as CharacterAnimState[]).forEach((state) => {
      const action = mixer.clipAction(SHARED_CLIPS[state]);
      if (
        state === 'cast_basic' ||
        state === 'cast_mid' ||
        state === 'cast_ultimate' ||
        state === 'dodge' ||
        state === 'hit' ||
        state === 'defeat'
      ) {
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = state === 'defeat';
      }
      actions[state] = action;
    });
    actions.idle.play();

    const dispose = () => {
      mixer.stopAllAction();
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      const texs = new Set<THREE.Texture>([faceMap, faceBump, irisTex, clothMap, clothBump]);
      root.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) geos.add(m.geometry);
        if (m.material) {
          const arr = Array.isArray(m.material) ? m.material : [m.material];
          arr.forEach((mat) => {
            mats.add(mat);
            const std = mat as THREE.MeshStandardMaterial;
            if (std.map) texs.add(std.map);
            if (std.bumpMap) texs.add(std.bumpMap);
          });
        }
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    };

    return {
      root,
      pelvis,
      spine,
      chest,
      head,
      eyes,
      eyelids,
      armR: rightArm.shoulder,
      forearmR: rightArm.forearm,
      handR: rightArm.hand,
      armL: leftArm.shoulder,
      forearmL: leftArm.forearm,
      legL: leftLeg.leg,
      shinL: leftLeg.shin,
      legR: rightLeg.leg,
      shinR: rightLeg.shin,
      robeBack,
      robeLeft,
      robeRight,
      wandTip,
      shieldMesh,
      mixer,
      actions,
      materialsForHitFlash: hitMats,
      isImportedGlb: false,
      dispose,
    };
  }
}
