import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  AudioMixerSettings,
  BattleHudSnapshot,
  BattleMode,
  CharacterDefinition,
  Faction,
  FighterHudState,
  GamePhase,
  GraphicsQuality,
  GraphicsSettings,
  SubtitleState,
} from './types';
import { CHARACTERS, CHARACTER_MAP } from './data/characters';
import { CharacterManager } from './CharacterManager';
import { CharacterController } from './CharacterController';
import { CharacterRigBuilder, RigHandles } from './CharacterRigBuilder';
import { ArrowKeyController } from './ArrowKeyController';
import { NumericKeypadController } from './NumericKeypadController';
import { MouseController } from './MouseController';
import { ArenaEnvironment } from './ArenaEnvironment';
import { RainSystem } from './RainSystem';
import { LightningSystem } from './LightningSystem';
import { MagicVFX } from './MagicVFX';
import { SpellSystem } from './SpellSystem';
import { SpellCollisionSystem } from './SpellCollisionSystem';
import { CreatureUltimateSystem } from './CreatureUltimateSystem';
import { CombatSystem } from './CombatSystem';
import { EnemyAI } from './EnemyAI';
import { AudioManager } from './AudioManager';
import { CameraController } from './CameraController';

const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _clashPos = new THREE.Vector3();
const _creaturePos = new THREE.Vector3();
const _pPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _previewTarget = new THREE.Vector3(0, 0, 2.5);

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class GameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: BattleHudSnapshot) => void;
  private onPortraitReady?: (id: string, dataUrl: string) => void;
  private onReady?: () => void;
  private onContextLost?: () => void;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private characterManager = new CharacterManager();
  private audio = new AudioManager();
  private arrowKeys = new ArrowKeyController();
  private numpad = new NumericKeypadController();
  private mouse = new MouseController();

  private arena: ArenaEnvironment;
  private rain: RainSystem;
  private lightning: LightningSystem;
  private vfx: MagicVFX;
  private spellSystem: SpellSystem;
  private creatureSystem: CreatureUltimateSystem;
  private collisionSystem: SpellCollisionSystem;
  private combatSystem: CombatSystem;
  private enemyAI = new EnemyAI();
  private cameraCtrl: CameraController;

  private allies: CharacterController[] = [];
  private enemies: CharacterController[] = [];
  private previewRig: RigHandles | null = null;
  private previewOrbitYaw = 0.25;
  private aimReticle: THREE.Mesh;

  private phase: GamePhase = 'MAIN_MENU';
  private battleMode: BattleMode = 'DUEL_1V1';
  private factionWarSize: 1 | 2 | 3 = 3;
  private playerFaction: Faction = 'DUMBLEDORES_ARMY';

  private selectedAllies: string[] = ['harry'];
  private selectedOpponents: string[] = ['voldemort'];
  private previewCharacterId = 'harry';

  private introTimer = 0;
  private introStep = 0;
  private winningFaction: Faction | null = null;

  private graphics: GraphicsSettings = {
    quality: 'HIGH',
    rainDensity: 0.9,
    particlesEnabled: true,
    bloomEnabled: true,
    shadowsEnabled: true,
    cameraShake: true,
    resolutionScale: 1.0,
    mouseSensitivity: 1.0,
  };

  private clock = new THREE.Clock();
  private elapsed = 0;
  private battleElapsed = 0;
  private hitstopTimer = 0;
  private hudThrottle = 0;
  private subtitle: SubtitleState | null = null;
  private endBannerTriggered = false;
  private matchVoicePlayed = false;
  private audioUnlockedOnInput = false;

  private portraitQueue: string[] = CHARACTERS.map((c) => c.id);
  private portraitRt: THREE.WebGLRenderTarget | null = null;
  private portraitScene: THREE.Scene | null = null;
  private portraitCam: THREE.PerspectiveCamera | null = null;

  private frameId = 0;
  private disposed = false;
  private readyEmitted = false;
  private previewBlinkTimer = 2.1;
  private previewBlinkPhase = 0;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: BattleHudSnapshot) => void,
    onPortraitReady?: (id: string, dataUrl: string) => void,
    onReady?: () => void,
    onContextLost?: () => void
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onPortraitReady = onPortraitReady;
    this.onReady = onReady;
    this.onContextLost = onContextLost;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.applyResolutionScale();
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.mouse.attach(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.2, 260);
    this.camera.position.set(0, 6.2, 22);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.55,
        0.45,
        0.8
      );
      this.composer.addPass(this.bloomPass);
    }

    this.vfx = new MagicVFX(this.scene);
    this.arena = new ArenaEnvironment(
      this.scene,
      this.renderer,
      this.vfx,
      !this.isSoftwareGl && this.graphics.shadowsEnabled,
      (kind, intensity) => this.audio.playDestruction(kind, intensity)
    );
    this.rain = new RainSystem(this.scene);
    this.rain.setDensity(this.graphics.rainDensity);
    this.lightning = new LightningSystem(this.scene);
    this.spellSystem = new SpellSystem(this.scene, this.vfx);
    this.creatureSystem = new CreatureUltimateSystem(this.scene, this.vfx, this.audio);
    this.collisionSystem = new SpellCollisionSystem(this.scene, this.vfx, this.audio);
    this.combatSystem = new CombatSystem(
      this.spellSystem,
      this.creatureSystem,
      this.audio
    );
    this.cameraCtrl = new CameraController(this.camera);

    this.aimReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.44, 24),
      new THREE.MeshBasicMaterial({
        color: '#93c5fd',
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.aimReticle.rotation.x = -Math.PI / 2;
    this.aimReticle.position.y = 0.05;
    this.aimReticle.visible = false;
    this.scene.add(this.aimReticle);

    this.initPortraitStudio();
    this.phase = 'MAIN_MENU';

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.audio.setOnVoiceAssetsChanged(() => this.pushHudSnapshot());
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });
    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    this.pushHudSnapshot();
    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.onContextLost?.();
  };

  private applyResolutionScale(): void {
    const base = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(Math.max(0.5, base * this.graphics.resolutionScale));
  }

  private initPortraitStudio(): void {
    const w = 180;
    const h = 210;
    this.portraitRt = new THREE.WebGLRenderTarget(w, h, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    this.portraitScene = new THREE.Scene();
    this.portraitScene.background = new THREE.Color('#09101a');
    this.portraitCam = new THREE.PerspectiveCamera(34, w / h, 0.1, 20);
    this.portraitCam.position.set(0.28, 1.44, 1.55);
    this.portraitCam.lookAt(0, 1.28, 0);

    const hemi = new THREE.HemisphereLight('#7db4ff', '#161b26', 1.25);
    const key = new THREE.DirectionalLight('#f8e7c9', 2.4);
    key.position.set(2.2, 3.0, 2.8);
    const rim = new THREE.DirectionalLight('#60a5fa', 1.6);
    rim.position.set(-2.5, 2.2, -2.0);
    this.portraitScene.add(hemi, key, rim);
  }

  private processNextPortrait(): void {
    if (
      this.portraitQueue.length === 0 ||
      !this.portraitRt ||
      !this.portraitScene ||
      !this.portraitCam ||
      !this.onPortraitReady
    ) {
      return;
    }

    const id = this.portraitQueue.shift()!;
    const def = this.characterManager.getCharacter(id);
    const rig = CharacterRigBuilder.build(def, this.characterManager.getImportedModel(id));
    rig.root.rotation.y = 0.2;
    this.portraitScene.add(rig.root);

    const targetY = id === 'dobby' ? 0.92 : 1.32;
    this.portraitCam.position.set(0.24, targetY + 0.14, id === 'dobby' ? 1.32 : 1.45);
    this.portraitCam.lookAt(0, targetY, 0);

    const prevRt = this.renderer.getRenderTarget();
    const prevTone = this.renderer.toneMappingExposure;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.setRenderTarget(this.portraitRt);
    this.renderer.clear();
    this.renderer.render(this.portraitScene, this.portraitCam);

    const w = this.portraitRt.width;
    const h = this.portraitRt.height;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.portraitRt, 0, 0, w, h, buf);

    this.renderer.setRenderTarget(prevRt);
    this.renderer.toneMappingExposure = prevTone;
    this.portraitScene.remove(rig.root);
    rig.dispose();

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const imgData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      const dstRow = y * w * 4;
      imgData.data.set(buf.subarray(srcRow, srcRow + w * 4), dstRow);
    }
    ctx.putImageData(imgData, 0, 0);
    this.onPortraitReady(id, c.toDataURL('image/png'));
  }

  private unlockAudioOnce = () => {
    if (!this.audioUnlockedOnInput) {
      this.audioUnlockedOnInput = true;
      this.audio.unlock();
    }
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.resolution.set(w, h);
  };

  private getTeamSize(): number {
    if (this.battleMode === 'DUEL_1V1') return 1;
    if (this.battleMode === 'TEAM_2V2') return 2;
    if (this.battleMode === 'TEAM_3V3') return 3;
    return this.factionWarSize;
  }

  private normalizeRosterDefaults(): void {
    const size = this.getTeamSize();
    const daPool = CHARACTERS.filter((c) => c.faction === 'DUMBLEDORES_ARMY').map((c) => c.id);
    const darkPool = CHARACTERS.filter((c) => c.faction === 'DARK_ARTS').map((c) => c.id);

    if (this.battleMode === 'FACTION_WAR') {
      const allyPool = this.playerFaction === 'DUMBLEDORES_ARMY' ? daPool : darkPool;
      const enemyPool = this.playerFaction === 'DUMBLEDORES_ARMY' ? darkPool : daPool;

      this.selectedAllies = this.selectedAllies.filter((id) => allyPool.includes(id)).slice(0, size);
      for (const id of allyPool) {
        if (this.selectedAllies.length >= size) break;
        if (!this.selectedAllies.includes(id)) this.selectedAllies.push(id);
      }

      this.selectedOpponents = this.selectedOpponents
        .filter((id) => enemyPool.includes(id))
        .slice(0, size);
      for (const id of enemyPool) {
        if (this.selectedOpponents.length >= size) break;
        if (!this.selectedOpponents.includes(id)) this.selectedOpponents.push(id);
      }
    } else {
      const preferredAllies = ['harry', 'hermione', 'ron', 'dumbledore', 'sirius', 'mcgonagall'];
      const preferredEnemies = ['voldemort', 'bellatrix', 'snape', 'lucius', 'draco'];

      this.selectedAllies = Array.from(new Set(this.selectedAllies)).slice(0, size);
      for (const id of [...preferredAllies, ...CHARACTERS.map((c) => c.id)]) {
        if (this.selectedAllies.length >= size) break;
        if (!this.selectedAllies.includes(id)) this.selectedAllies.push(id);
      }

      this.selectedOpponents = Array.from(new Set(this.selectedOpponents))
        .filter((id) => !this.selectedAllies.includes(id))
        .slice(0, size);
      for (const id of [...preferredEnemies, ...CHARACTERS.map((c) => c.id)]) {
        if (this.selectedOpponents.length >= size) break;
        if (!this.selectedAllies.includes(id) && !this.selectedOpponents.includes(id)) {
          this.selectedOpponents.push(id);
        }
      }
    }
  }

  private clearActiveCombatants(): void {
    this.audio.cancelMatchDialogue();
    this.matchVoicePlayed = false;
    for (const a of this.allies) a.dispose(this.scene, this.arena.world);
    for (const e of this.enemies) e.dispose(this.scene, this.arena.world);
    this.allies = [];
    this.enemies = [];
    this.enemyAI.reset();
    this.audio.setShieldHum(false);
    this.audio.setClashHum(false);
    this.spellSystem.clearAll();
    this.creatureSystem.clearAll();
    this.collisionSystem.reset();
    this.aimReticle.visible = false;
  }

  private clearPreviewRig(): void {
    if (this.previewRig) {
      this.scene.remove(this.previewRig.root);
      this.previewRig.dispose();
      this.previewRig = null;
    }
  }

  private spawnPreviewRig(characterId: string): void {
    this.clearPreviewRig();
    const def = this.characterManager.getCharacter(characterId);
    const rig = CharacterRigBuilder.build(
      def,
      this.characterManager.getImportedModel(characterId)
    );
    rig.root.position.copy(_previewTarget);
    rig.root.rotation.y = 0;
    this.scene.add(rig.root);
    this.previewRig = rig;
    this.previewCharacterId = characterId;
  }

  // Navigation & Setup APIs
  public openModeSelect(): void {
    this.audio.unlock();
    this.clearActiveCombatants();
    this.clearPreviewRig();
    this.subtitle = null;
    this.phase = 'SELECT_MODE';
    this.pushHudSnapshot();
  }

  public startBattleSetup(
    mode: BattleMode,
    playerFaction: Faction = this.playerFaction,
    factionWarSize: 1 | 2 | 3 = this.factionWarSize
  ): void {
    this.audio.unlock();
    this.clearActiveCombatants();
    this.subtitle = null;
    this.battleMode = mode;
    this.playerFaction = playerFaction;
    this.factionWarSize = factionWarSize;
    this.normalizeRosterDefaults();
    this.phase = 'SELECT_TEAM';
    this.previewOrbitYaw = 0.25;
    this.spawnPreviewRig(this.selectedAllies[0] ?? 'harry');
    this.pushHudSnapshot();
  }

  public setFactionSetup(playerFaction: Faction, factionWarSize: 1 | 2 | 3): void {
    this.playerFaction = playerFaction;
    this.factionWarSize = factionWarSize;
    this.normalizeRosterDefaults();
    if (this.phase === 'SELECT_TEAM' || this.phase === 'SELECT_OPPONENTS') {
      const targetId =
        this.phase === 'SELECT_TEAM'
          ? this.selectedAllies[0]
          : this.selectedOpponents[0];
      if (targetId) this.spawnPreviewRig(targetId);
    }
    this.pushHudSnapshot();
  }

  public inspectCharacter(characterId: string): void {
    this.audio.unlock();
    this.spawnPreviewRig(characterId);
    const def = this.characterManager.getCharacter(characterId);
    this.audio.playWandCharge(def.audioProfile);
    this.pushHudSnapshot();
  }

  public toggleTeamMember(characterId: string): void {
    this.audio.unlock();
    const def = this.characterManager.getCharacter(characterId);
    const size = this.getTeamSize();

    if (this.phase === 'SELECT_TEAM') {
      if (this.battleMode === 'FACTION_WAR' && def.faction !== this.playerFaction) {
        return;
      }
      if (size === 1) {
        this.selectedAllies = [characterId];
      } else {
        const idx = this.selectedAllies.indexOf(characterId);
        if (idx >= 0) {
          if (this.selectedAllies.length > 1) {
            this.selectedAllies.splice(idx, 1);
          }
        } else if (this.selectedAllies.length < size) {
          this.selectedAllies.push(characterId);
        } else {
          this.selectedAllies[size - 1] = characterId;
        }
      }
    } else if (this.phase === 'SELECT_OPPONENTS') {
      const enemyFaction: Faction =
        this.playerFaction === 'DUMBLEDORES_ARMY' ? 'DARK_ARTS' : 'DUMBLEDORES_ARMY';
      if (this.battleMode === 'FACTION_WAR' && def.faction !== enemyFaction) {
        return;
      }
      if (this.selectedAllies.includes(characterId)) return;

      if (size === 1) {
        this.selectedOpponents = [characterId];
      } else {
        const idx = this.selectedOpponents.indexOf(characterId);
        if (idx >= 0) {
          if (this.selectedOpponents.length > 1) {
            this.selectedOpponents.splice(idx, 1);
          }
        } else if (this.selectedOpponents.length < size) {
          this.selectedOpponents.push(characterId);
        } else {
          this.selectedOpponents[size - 1] = characterId;
        }
      }
    }

    this.spawnPreviewRig(characterId);
    this.audio.playWandCharge(def.audioProfile);
    this.pushHudSnapshot();
  }

  public removeTeamSlot(slotIndex: number, side: 'ally' | 'enemy'): void {
    const arr = side === 'ally' ? this.selectedAllies : this.selectedOpponents;
    if (arr.length <= 1 || slotIndex < 0 || slotIndex >= arr.length) return;
    arr.splice(slotIndex, 1);
    this.pushHudSnapshot();
  }

  public rotatePreview(deltaYaw: number): void {
    this.previewOrbitYaw += deltaYaw;
  }

  public confirmTeamSelection(): void {
    this.audio.unlock();
    this.normalizeRosterDefaults();
    this.phase = 'SELECT_OPPONENTS';
    this.previewOrbitYaw = 0.25;
    this.spawnPreviewRig(this.selectedOpponents[0] ?? 'voldemort');
    this.pushHudSnapshot();
  }

  public backToTeamSelection(): void {
    this.phase = 'SELECT_TEAM';
    this.previewOrbitYaw = 0.25;
    this.spawnPreviewRig(this.selectedAllies[0] ?? 'harry');
    this.pushHudSnapshot();
  }

  public confirmOpponentSelection(): void {
    this.audio.unlock();
    this.normalizeRosterDefaults();
    this.clearPreviewRig();
    this.spawnBattle();
    this.phase = 'INTRO';
    this.introTimer = 0;
    this.introStep = 0;
    this.aimReticle.visible = false;
    this.subtitle = null; // Strictly NO spoken dialogue during intros
    this.pushHudSnapshot();
  }

  public rematchBattle(): void {
    this.audio.unlock();
    this.spawnBattle();
    this.phase = 'INTRO';
    this.introTimer = 0;
    this.introStep = 0;
    this.aimReticle.visible = false;
    this.subtitle = null;
    this.pushHudSnapshot();
  }

  public skipIntro(): void {
    if (this.phase !== 'INTRO') return;
    this.phase = 'PLAYING';
    this.aimReticle.visible = true;
    this.subtitle = null;
    this.pushHudSnapshot();
  }

  private getSpawnOffsets(count: number): number[] {
    if (count === 1) return [0];
    if (count === 2) return [-4.2, 4.2];
    return [-5.8, 0, 5.8];
  }

  private spawnBattle(): void {
    this.clearActiveCombatants();
    this.arena.destructibles.reset();

    const allyOffsets = this.getSpawnOffsets(this.selectedAllies.length);
    const enemyOffsets = this.getSpawnOffsets(this.selectedOpponents.length);

    let nextFighterIdx = 1;

    this.selectedAllies.forEach((id, i) => {
      const def = this.characterManager.getCharacter(id);
      const ctrl = new CharacterController(
        def,
        this.scene,
        this.arena.world,
        new THREE.Vector3(allyOffsets[i] ?? 0, 0, 10.5),
        this.characterManager.getImportedModel(def.id)
      );
      ctrl.team = 'ally';
      ctrl.fighterIndex = nextFighterIdx++;
      ctrl.rig.root.rotation.y = Math.PI;
      this.allies.push(ctrl);
    });

    this.selectedOpponents.forEach((id, i) => {
      const def = this.characterManager.getCharacter(id);
      const ctrl = new CharacterController(
        def,
        this.scene,
        this.arena.world,
        new THREE.Vector3(enemyOffsets[i] ?? 0, 0, -10.5),
        this.characterManager.getImportedModel(def.id)
      );
      ctrl.team = 'enemy';
      ctrl.fighterIndex = nextFighterIdx++;
      ctrl.rig.root.rotation.y = 0;
      this.enemies.push(ctrl);
    });

    this.battleElapsed = 0;
    this.endBannerTriggered = false;
    this.matchVoicePlayed = false;
    this.winningFaction = null;
    this.numpad.clear();
  }

  public returnToCharacterSelect(): void {
    this.audio.unlock();
    this.clearActiveCombatants();
    this.subtitle = null;
    this.phase = 'SELECT_TEAM';
    this.previewOrbitYaw = 0.25;
    this.spawnPreviewRig(this.selectedAllies[0] ?? 'harry');
    this.pushHudSnapshot();
  }

  public returnToMainMenu(): void {
    this.clearActiveCombatants();
    this.clearPreviewRig();
    this.subtitle = null;
    this.phase = 'MAIN_MENU';
    this.pushHudSnapshot();
  }

  public exitGame(): void {
    this.clearActiveCombatants();
    this.clearPreviewRig();
    this.audio.setMuted(true);
    this.phase = 'EXITED';
    this.pushHudSnapshot();
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.aimReticle.visible = phase === 'PLAYING';
    if (phase !== 'PLAYING') {
      this.audio.setShieldHum(false);
      this.audio.setClashHum(false);
    }
    this.pushHudSnapshot();
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.isMuted());
    this.pushHudSnapshot();
  }

  public updateAudioMixer(next: Partial<AudioMixerSettings>): void {
    this.audio.unlock();
    this.audio.setMixerSettings(next);
    this.pushHudSnapshot();
  }

  public updateGraphics(next: Partial<GraphicsSettings>): void {
    this.graphics = { ...this.graphics, ...next };
    if (next.quality) {
      const map: Record<
        GraphicsQuality,
        { rain: number; bloom: boolean; shadows: boolean; particles: boolean }
      > = {
        LOW: { rain: 0.35, bloom: false, shadows: false, particles: true },
        MEDIUM: { rain: 0.6, bloom: true, shadows: true, particles: true },
        HIGH: { rain: 0.9, bloom: true, shadows: true, particles: true },
        ULTRA: { rain: 1.0, bloom: true, shadows: true, particles: true },
      };
      const preset = map[next.quality];
      this.graphics.rainDensity = preset.rain;
      this.graphics.bloomEnabled = preset.bloom;
      this.graphics.shadowsEnabled = preset.shadows;
      this.graphics.particlesEnabled = preset.particles;
    }
    this.rain.setDensity(this.graphics.rainDensity);
    this.vfx.setParticlesEnabled(this.graphics.particlesEnabled);
    this.renderer.shadowMap.enabled =
      !this.isSoftwareGl && this.graphics.shadowsEnabled;
    if (this.bloomPass) {
      this.bloomPass.enabled = this.graphics.bloomEnabled;
    }
    if (next.resolutionScale !== undefined) {
      this.applyResolutionScale();
    }
    if (next.mouseSensitivity !== undefined) {
      this.mouse.setSensitivity(this.graphics.mouseSensitivity);
    }
    this.pushHudSnapshot();
  }

  public toggleFullscreen(): void {
    try {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen();
      } else {
        void document.exitFullscreen();
      }
    } catch {
      // ignore if restricted by browser sandbox
    }
  }

  public async importCharacterGlb(characterId: string, file: File): Promise<string> {
    const asset = await this.characterManager.importCharacterGlb(characterId, file);
    if (!this.portraitQueue.includes(characterId)) {
      this.portraitQueue.unshift(characterId);
    }
    if (this.phase === 'SELECT_TEAM' || this.phase === 'SELECT_OPPONENTS') {
      if (this.previewCharacterId === characterId) {
        this.spawnPreviewRig(characterId);
      }
    } else if (this.phase === 'PLAYING' || this.phase === 'PAUSED') {
      if (
        this.selectedAllies.includes(characterId) ||
        this.selectedOpponents.includes(characterId)
      ) {
        this.spawnBattle();
      }
    }
    this.pushHudSnapshot();
    return asset.fileName;
  }

  public async importVoiceClip(
    characterId: string,
    eventKey: string,
    file: File
  ): Promise<void> {
    await this.audio.registerVoiceClip(`${characterId}:${eventKey}`, file);
    this.pushHudSnapshot();
  }

  public previewPostMatchVoice(
    characterId: string,
    outcome: 'VICTORY' | 'DEFEAT'
  ): void {
    this.audio.unlock();
    const def = this.characterManager.getCharacter(characterId);
    this.audio.previewPostMatchVoice(def, outcome);
  }

  private setSubtitle(
    speaker: string,
    text: string,
    color: string,
    seconds = 4.5,
    outcome?: 'VICTORY' | 'DEFEAT'
  ): void {
    this.subtitle = {
      speaker,
      text,
      color,
      outcome,
      expiresAt: this.elapsed + seconds,
    };
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.elapsed += dt;

    if (
      this.portraitQueue.length > 0 &&
      (this.phase === 'SELECT_TEAM' ||
        this.phase === 'SELECT_OPPONENTS' ||
        this.phase === 'MAIN_MENU' ||
        this.phase === 'SELECT_MODE')
    ) {
      this.processNextPortrait();
    }

    if (this.arrowKeys.consumePause()) {
      if (this.phase === 'PLAYING') {
        this.setPhase('PAUSED');
      } else if (this.phase === 'PAUSED') {
        this.setPhase('PLAYING');
      }
    }

    if (this.subtitle && this.elapsed >= this.subtitle.expiresAt) {
      this.subtitle = null;
    }

    const flash = this.lightning.update(dt, this.audio);

    if (
      this.phase === 'MAIN_MENU' ||
      this.phase === 'SELECT_MODE' ||
      this.phase === 'EXITED'
    ) {
      this.arena.update(dt, this.elapsed, flash, false);
      this.cameraCtrl.updateTitleOrbit(dt, this.elapsed);
      this.rain.update(dt, new THREE.Vector3(0, 0, 0));
      this.vfx.update(dt);
    } else if (this.phase === 'SELECT_TEAM' || this.phase === 'SELECT_OPPONENTS') {
      this.arena.update(dt, this.elapsed, flash, false);
      if (this.previewRig) {
        this.previewRig.mixer.update(dt);
        if (!this.previewRig.isImportedGlb && this.previewRig.eyelids.length > 0) {
          this.previewBlinkTimer -= dt;
          if (this.previewBlinkTimer <= 0) {
            this.previewBlinkPhase = 1.0;
            this.previewBlinkTimer = 2.4 + Math.random() * 3.0;
          }
          let blinkAmount = 0;
          if (this.previewBlinkPhase > 0) {
            this.previewBlinkPhase = Math.max(0, this.previewBlinkPhase - dt * 5.8);
            blinkAmount = Math.sin(this.previewBlinkPhase * Math.PI);
          }
          const lidRot = -0.28 + blinkAmount * 0.66;
          for (let i = 0; i < this.previewRig.eyelids.length; i++) {
            this.previewRig.eyelids[i].rotation.x = lidRot;
          }
        }
      }
      this.cameraCtrl.updatePreview(dt, _previewTarget, this.previewOrbitYaw);
      this.rain.update(dt, _previewTarget);
      this.vfx.update(dt);
    } else if (this.phase === 'INTRO' && this.allies.length > 0 && this.enemies.length > 0) {
      this.stepIntro(dt, flash);
    } else if (this.phase === 'PLAYING' && this.allies.length > 0 && this.enemies.length > 0) {
      this.battleElapsed += dt;
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.stepGameplay(dt, flash);
      }
    } else if (this.allies.length > 0 && this.enemies.length > 0) {
      this.arena.update(dt, this.elapsed, flash, false);
      const focusPos = this.allies[0].getPosition(_pPos);
      const lookPos = this.enemies[0].getPosition(_targetPos);
      this.allies.forEach((a) => a.update(dt, 0, 0, false, lookPos, false, false));
      this.enemies.forEach((e) => e.update(dt, 0, 0, false, focusPos, false, false));
      this.rain.update(dt, focusPos);
      this.vfx.update(dt);
    }

    if (!this.isSoftwareGl && this.composer && this.graphics.bloomEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.onReady?.();
    }

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.05) {
      this.hudThrottle = 0;
      this.pushHudSnapshot();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private stepIntro(dt: number, lightningFlash: number): void {
    this.introTimer += dt;
    this.arena.update(dt, this.elapsed, lightningFlash, false);

    const enemyAvg = new THREE.Vector3(0, 0, -10);
    const allyAvg = new THREE.Vector3(0, 0, 10);
    this.allies.forEach((a) => a.update(dt, 0, 0, false, enemyAvg, false, false));
    this.enemies.forEach((e) => e.update(dt, 0, 0, false, allyAvg, false, false));
    this.rain.update(dt, allyAvg);
    this.vfx.update(dt);

    // Visual cinematic pan only (strictly NO non-ultimate spoken dialogue)
    if (this.introStep === 0 && this.introTimer >= 1.15) {
      this.introStep = 1;
    } else if (this.introStep === 1 && this.introTimer >= 2.3) {
      this.introStep = 2;
    } else if (this.introTimer >= 3.4) {
      this.phase = 'PLAYING';
      this.aimReticle.visible = true;
      this.subtitle = null;
      this.pushHudSnapshot();
      return;
    }

    this.cameraCtrl.updateTeamIntro(dt, this.introStep, this.allies, this.enemies);
  }

  private findClosestAlive(
    fromPos: THREE.Vector3,
    candidates: CharacterController[]
  ): CharacterController | null {
    let best: CharacterController | null = null;
    let minD = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c.isAlive()) continue;
      const d = c.getPosition().distanceTo(fromPos);
      if (d < minD) {
        minD = d;
        best = c;
      }
    }
    return best;
  }

  private stepGameplay(dt: number, lightningFlash: number): void {
    const player = this.allies[0];
    this.arena.update(dt, this.elapsed, lightningFlash, true);
    player.getPosition(_pPos);

    const anyClash = this.collisionSystem.isClashActive();
    const playerInClash = this.collisionSystem.isFighterInClash(player);

    // 1. Player Control (Arrow keys + Shift + Space + Mouse + Numpad 1/2/3)
    const { forward, right, running } = this.arrowKeys.getMoveInput();
    this.cameraCtrl.getForwardXZ(_camFwd);
    _camRight.set(-_camFwd.z, 0, _camFwd.x);

    let moveX = _camFwd.x * forward + _camRight.x * right;
    let moveZ = _camFwd.z * forward + _camRight.z * right;
    const mLen = Math.hypot(moveX, moveZ);
    if (mLen > 0.01) {
      moveX /= mLen;
      moveZ /= mLen;
    }

    if (player.isAlive() && this.arrowKeys.consumeDodge() && !playerInClash) {
      if (player.tryDodge(moveX, moveZ)) {
        this.audio.playDodge();
        this.vfx.spawnBurst(
          _pPos.clone().setY(1.0),
          '#93c5fd',
          '#1e293b',
          '#090d14',
          18,
          6,
          false
        );
      }
    }

    const closestEnemy = this.findClosestAlive(_pPos, this.enemies);
    const fallbackTarget = closestEnemy
      ? closestEnemy.getPosition(_targetPos)
      : _targetPos.set(0, 0, -10);
    const aimWorld = this.mouse.getAimWorldPoint(this.camera, fallbackTarget);

    // Gentle magnetic snap onto whichever alive enemy is closest to the cursor
    let hoveredEnemy: CharacterController | null = closestEnemy;
    let snapDist = 4.0;
    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];
      if (!en.isAlive()) continue;
      const ePos = en.getPosition();
      const d = Math.hypot(aimWorld.x - ePos.x, aimWorld.z - ePos.z);
      if (d < snapDist) {
        snapDist = d;
        hoveredEnemy = en;
      }
    }
    const finalAim =
      hoveredEnemy && snapDist < 4.0 ? hoveredEnemy.getPosition() : aimWorld;
    this.aimReticle.position.set(finalAim.x, 0.06, finalAim.z);
    this.aimReticle.visible = player.isAlive();

    const numpadTier = this.numpad.consumeSpellCast();
    const leftClicked = this.mouse.consumeLeftClick();

    if (anyClash) {
      const surge = this.numpad.consumeClashSurges() + (leftClicked ? 1 : 0);
      this.collisionSystem.applyPlayerClashSurge(surge);
    } else if (numpadTier && player.isAlive()) {
      this.audio.unlock();
      this.combatSystem.tryCastSpell(
        player,
        'ally',
        numpadTier,
        finalAim,
        hoveredEnemy
      );
    }

    const wantsShield = player.isAlive() && this.mouse.isShieldHeld();
    player.update(dt, moveX, moveZ, running, finalAim, wantsShield, playerInClash);
    this.audio.setShieldHum(player.shieldActive, player.def.audioProfile);

    // 2. Allied AI Teammates (Index 1..N in 2v2 / 3v3 / Faction War)
    for (let i = 1; i < this.allies.length; i++) {
      const ally = this.allies[i];
      const inClash = this.collisionSystem.isFighterInClash(ally);
      const dec = this.enemyAI.update(
        dt,
        ally,
        i,
        this.allies,
        this.enemies,
        this.spellSystem.projectiles,
        this.combatSystem,
        this.audio,
        inClash
      );
      ally.update(dt, dec.moveX, dec.moveZ, dec.running, dec.aimTarget, dec.shield, inClash);
    }

    // 3. Enemy AI Fighters
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const inClash = this.collisionSystem.isFighterInClash(enemy);
      const dec = this.enemyAI.update(
        dt,
        enemy,
        i,
        this.enemies,
        this.allies,
        this.spellSystem.projectiles,
        this.combatSystem,
        this.audio,
        inClash
      );
      enemy.update(dt, dec.moveX, dec.moveZ, dec.running, dec.aimTarget, dec.shield, inClash);
    }

    // 4. Health Orb pickups for any alive fighter
    for (const fighter of [...this.allies, ...this.enemies]) {
      if (!fighter.isAlive()) continue;
      const fPos = fighter.getPosition();
      const heal = this.arena.tryPickupHealthOrb(fPos);
      if (heal > 0) {
        fighter.heal(heal);
        this.vfx.spawnBurst(
          fPos.clone().setY(1.2),
          '#fde047',
          '#38bdf8',
          '#0f172a',
          28,
          7,
          true,
          4.5
        );
      }
    }

    // 5. Projectiles, Creature Ultimates, Collisions & Environmental Destruction
    this.spellSystem.update(dt, this.elapsed);

    const creatureEvents = this.creatureSystem.update(
      dt,
      this.allies,
      this.enemies,
      this.arena.destructibles
    );
    const colEvents = this.collisionSystem.update(
      dt,
      this.elapsed,
      this.spellSystem,
      this.allies,
      this.enemies,
      this.arena
    );

    const maxHitstop = Math.max(creatureEvents.hitstopMs, colEvents.hitstopMs);
    if (maxHitstop > 0) {
      this.hitstopTimer = maxHitstop / 1000;
    }
    const maxShake = Math.max(creatureEvents.shakeAmount, colEvents.shakeAmount);
    if (maxShake > 0) {
      this.cameraCtrl.addShake(maxShake);
    }

    this.rain.update(dt, _pPos);
    this.vfx.update(dt);

    const clashPoint = this.collisionSystem.getClashWorldPosition(_clashPos);
    const activeCreaturePoint = this.creatureSystem.getPrimaryCreaturePosition(_creaturePos);
    this.cameraCtrl.updateTeamDuel(
      dt,
      player,
      this.allies,
      this.enemies,
      clashPoint,
      activeCreaturePoint,
      this.graphics.cameraShake
    );

    // 6. Team Victory / Defeat Check
    const anyAllyAlive = this.allies.some((a) => a.isAlive());
    const anyEnemyAlive = this.enemies.some((e) => e.isAlive());

    if (!this.endBannerTriggered && (!anyAllyAlive || !anyEnemyAlive)) {
      this.endBannerTriggered = true;
      this.audio.setShieldHum(false);
      this.audio.setClashHum(false);

      const allyTeamFaction: Faction =
        this.battleMode === 'FACTION_WAR'
          ? this.playerFaction
          : this.allies[0]?.def.faction ?? 'DUMBLEDORES_ARMY';
      const enemyTeamFaction: Faction =
        this.battleMode === 'FACTION_WAR'
          ? allyTeamFaction === 'DUMBLEDORES_ARMY'
            ? 'DARK_ARTS'
            : 'DUMBLEDORES_ARMY'
          : this.enemies[0]?.def.faction ?? 'DARK_ARTS';

      if (!anyEnemyAlive) {
        this.allies.forEach((a) => {
          if (a.isAlive()) a.setVictory();
        });
        this.winningFaction = allyTeamFaction;
        this.phase = 'VICTORY';
      } else {
        this.enemies.forEach((e) => {
          if (e.isAlive()) e.setVictory();
        });
        this.winningFaction = enemyTeamFaction;
        this.phase = 'DEFEAT';
      }

      if (!this.matchVoicePlayed && this.allies[0]) {
        this.matchVoicePlayed = true;
        const outcome: 'VICTORY' | 'DEFEAT' = !anyEnemyAlive ? 'VICTORY' : 'DEFEAT';
        const teammate =
          this.allies.length > 1
            ? outcome === 'VICTORY'
              ? this.allies.find((a, idx) => idx > 0 && a.isAlive()) ?? this.allies[1]
              : this.allies[1]
            : null;
        this.audio.playPostMatchDialogue(
          this.allies[0].def,
          outcome,
          teammate ? teammate.def : null,
          (speaker, text, color) => {
            this.setSubtitle(speaker, text, color, 6.0, outcome);
          }
        );
      }

      this.aimReticle.visible = false;
      this.pushHudSnapshot();
    }
  }

  private mapFighterHud(
    def: CharacterDefinition,
    ctrl: CharacterController | null,
    isPlayerControlled: boolean
  ): FighterHudState {
    return {
      id: def.id,
      name: def.name,
      title: def.title,
      faction: def.faction,
      powerRating: def.powerRating,
      hp: ctrl ? ctrl.hp : def.maxHp,
      maxHp: ctrl ? ctrl.maxHp : def.maxHp,
      energy: ctrl ? ctrl.energy : 40,
      maxEnergy: ctrl ? ctrl.maxEnergy : 100,
      alive: ctrl ? ctrl.isAlive() : true,
      isPlayerControlled,
      shieldActive: ctrl ? ctrl.shieldActive : false,
      shieldIntegrity: ctrl ? ctrl.shieldIntegrity : 100,
      cooldowns: {
        basic: ctrl ? ctrl.cooldowns.BASIC : 0,
        basicMax: def.spells.basic.cooldown,
        mid: ctrl ? ctrl.cooldowns.MID : 0,
        midMax: def.spells.mid.cooldown,
        ultimate: ctrl ? ctrl.cooldowns.ULTIMATE : 0,
        ultimateMax: def.spells.ultimate.cooldown,
        dodge: ctrl ? ctrl.dodgeCooldown : 0,
        dodgeMax: 1.35,
      },
      spells: {
        basicName: def.spells.basic.name,
        midName: def.spells.mid.name,
        ultimateName: def.spells.ultimate.name,
      },
    };
  }

  private pushHudSnapshot(): void {
    const allyStates = this.selectedAllies.map((id, i) => {
      const def = CHARACTER_MAP.get(id) ?? CHARACTERS[5];
      return this.mapFighterHud(def, this.allies[i] ?? null, i === 0);
    });
    const enemyStates = this.selectedOpponents.map((id, i) => {
      const def = CHARACTER_MAP.get(id) ?? CHARACTERS[1];
      return this.mapFighterHud(def, this.enemies[i] ?? null, false);
    });

    this.onHudUpdate({
      phase: this.phase,
      battleMode: this.battleMode,
      factionWarSize: this.factionWarSize,
      playerFaction: this.playerFaction,
      elapsedSeconds: this.battleElapsed,
      selectedAllies: [...this.selectedAllies],
      selectedOpponents: [...this.selectedOpponents],
      previewCharacterId: this.previewCharacterId,
      introStep: this.introStep,
      player: allyStates[0] ?? this.mapFighterHud(CHARACTERS[5], null, true),
      allies: allyStates,
      enemies: enemyStates,
      clash: this.collisionSystem.getClashHudState(),
      subtitle: this.subtitle,
      audioMixer: this.audio.getMixerSettings(),
      graphics: { ...this.graphics },
      healthOrbActive: this.arena.isHealthOrbActive(),
      destructiblesIntact: this.arena.destructibles.getIntactCount(),
      destructiblesTotal: this.arena.destructibles.getTotalCount(),
      activeCreatures: this.creatureSystem.getActiveNames(),
      winningFaction: this.winningFaction,
      customGlbMap: this.characterManager.getCustomGlbMap(),
      voiceAssetMap: this.audio.getVoiceAssetMap(CHARACTERS.map((c) => c.id)),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.unlockAudioOnce);
    window.removeEventListener('pointerdown', this.unlockAudioOnce);
    this.clearActiveCombatants();
    this.clearPreviewRig();
    this.arena.dispose(this.scene);
    this.rain.dispose(this.scene);
    this.lightning.dispose(this.scene);
    this.vfx.dispose();
    this.composer?.dispose();
    this.portraitRt?.dispose();
    this.arrowKeys.dispose();
    this.numpad.dispose();
    this.mouse.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
