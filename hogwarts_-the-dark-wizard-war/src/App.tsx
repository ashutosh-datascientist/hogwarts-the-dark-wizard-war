import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/GameEngine';
import { AudioMixerSettings, BattleHudSnapshot, GraphicsSettings } from './game/types';
import { GameUI } from './components/GameUI';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RotateCcw, ShieldAlert } from 'lucide-react';

function checkWebGLSupport(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const DEFAULT_PLAYER_HUD = {
  id: 'harry',
  name: 'Harry Potter',
  title: 'The Chosen One',
  faction: 'DUMBLEDORES_ARMY' as const,
  powerRating: 86,
  hp: 2000,
  maxHp: 2000,
  energy: 40,
  maxEnergy: 100,
  alive: true,
  isPlayerControlled: true,
  shieldActive: false,
  shieldIntegrity: 100,
  cooldowns: {
    basic: 0,
    basicMax: 0.72,
    mid: 0,
    midMax: 4.2,
    ultimate: 0,
    ultimateMax: 14.0,
    dodge: 0,
    dodgeMax: 1.35,
  },
  spells: {
    basicName: 'Expelliarmus',
    midName: 'Reducto',
    ultimateName: 'Expecto Patronum',
  },
};

const DEFAULT_ENEMY_HUD = {
  id: 'voldemort',
  name: 'Lord Voldemort',
  title: 'The Dark Lord',
  faction: 'DARK_ARTS' as const,
  powerRating: 93,
  hp: 2500,
  maxHp: 2500,
  energy: 40,
  maxEnergy: 100,
  alive: true,
  isPlayerControlled: false,
  shieldActive: false,
  shieldIntegrity: 100,
  cooldowns: {
    basic: 0,
    basicMax: 0.7,
    mid: 0,
    midMax: 4.1,
    ultimate: 0,
    ultimateMax: 14.5,
    dodge: 0,
    dodgeMax: 1.35,
  },
  spells: {
    basicName: 'Killing Spark',
    midName: 'Crucio Surge',
    ultimateName: 'Giant Black Serpent',
  },
};

const INITIAL_HUD: BattleHudSnapshot = {
  phase: 'MAIN_MENU',
  battleMode: 'DUEL_1V1',
  factionWarSize: 3,
  playerFaction: 'DUMBLEDORES_ARMY',
  elapsedSeconds: 0,
  selectedAllies: ['harry'],
  selectedOpponents: ['voldemort'],
  previewCharacterId: 'harry',
  introStep: 0,
  player: DEFAULT_PLAYER_HUD,
  allies: [DEFAULT_PLAYER_HUD],
  enemies: [DEFAULT_ENEMY_HUD],
  clash: {
    active: false,
    balance: 0.5,
    playerSpellName: '',
    opponentSpellName: '',
    timeRemaining: 0,
  },
  subtitle: null,
  audioMixer: {
    masterMuted: false,
    masterVolume: 0.9,
    voicesEnabled: true,
    voicesVolume: 0.92,
    ttsFallbackEnabled: true,
    attacksVolume: 0.88,
    creaturesVolume: 0.9,
    shieldsVolume: 0.82,
    musicVolume: 0.55,
    weatherVolume: 0.68,
  },
  graphics: {
    quality: 'HIGH',
    rainDensity: 0.9,
    particlesEnabled: true,
    bloomEnabled: true,
    shadowsEnabled: true,
    cameraShake: true,
    resolutionScale: 1.0,
    mouseSensitivity: 1.0,
  },
  healthOrbActive: false,
  destructiblesIntact: 26,
  destructiblesTotal: 26,
  activeCreatures: [],
  winningFaction: null,
  customGlbMap: {},
  voiceAssetMap: {},
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<BattleHudSnapshot>(INITIAL_HUD);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [engineReady, setEngineReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    if (!checkWebGLSupport()) {
      setWebglError(
        'Hardware-accelerated WebGL is unavailable in this browser. Enable hardware acceleration or use Chrome / Edge on Windows 10 or 11.'
      );
      return;
    }

    try {
      const engine = new GameEngine(
        mount,
        (snapshot) => {
          setHud(snapshot);
        },
        (id, dataUrl) => {
          setPortraits((prev) => ({ ...prev, [id]: dataUrl }));
        },
        () => {
          setEngineReady(true);
        },
        () => {
          setWebglError(
            'WebGL graphics context was lost (GPU driver reset or tab memory limit). Reload to restore the Hogwarts courtyard.'
          );
        }
      );
      engineRef.current = engine;
      return () => {
        engine.dispose();
        engineRef.current = null;
      };
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? err.message
          : 'Failed to initialize 3D WebGL courtyard renderer.'
      );
    }
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative w-screen h-screen overflow-hidden bg-[#05080d]">
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

        {webglError ? (
          <div className="fixed inset-0 z-50 bg-[#05080d] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#090f19] border border-amber-500/40 rounded-lg p-7 text-center flex flex-col items-center gap-4 shadow-2xl">
              <ShieldAlert className="w-10 h-10 text-amber-400" />
              <h1 className="font-display text-xl font-bold tracking-wider text-white">
                3D GRAPHICS INITIALIZATION NOTICE
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">{webglError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wider flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" /> RETRY LAUNCH
              </button>
            </div>
          </div>
        ) : (
          <GameUI
            hud={hud}
            portraits={portraits}
            engineReady={engineReady}
            onOpenModeSelect={() => engineRef.current?.openModeSelect()}
            onStartMode={(mode, faction, warSize) =>
              engineRef.current?.startBattleSetup(mode, faction, warSize)
            }
            onSetFactionSetup={(faction, warSize) =>
              engineRef.current?.setFactionSetup(faction, warSize)
            }
            onInspectCharacter={(id) => engineRef.current?.inspectCharacter(id)}
            onToggleTeamMember={(id) => engineRef.current?.toggleTeamMember(id)}
            onRemoveTeamSlot={(idx, side) =>
              engineRef.current?.removeTeamSlot(idx, side)
            }
            onRotatePreview={(deltaYaw) => engineRef.current?.rotatePreview(deltaYaw)}
            onConfirmTeam={() => engineRef.current?.confirmTeamSelection()}
            onBackToTeamSelect={() => engineRef.current?.backToTeamSelection()}
            onConfirmOpponent={() => engineRef.current?.confirmOpponentSelection()}
            onRematch={() => engineRef.current?.rematchBattle()}
            onSkipIntro={() => engineRef.current?.skipIntro()}
            onReturnToCharacterSelect={() =>
              engineRef.current?.returnToCharacterSelect()
            }
            onReturnToMainMenu={() => engineRef.current?.returnToMainMenu()}
            onExitGame={() => engineRef.current?.exitGame()}
            onResume={() => engineRef.current?.setPhase('PLAYING')}
            onPause={() => engineRef.current?.setPhase('PAUSED')}
            onToggleMute={() => engineRef.current?.toggleMute()}
            onToggleFullscreen={() => engineRef.current?.toggleFullscreen()}
            onUpdateAudioMixer={(next: Partial<AudioMixerSettings>) =>
              engineRef.current?.updateAudioMixer(next)
            }
            onUpdateGraphics={(next: Partial<GraphicsSettings>) =>
              engineRef.current?.updateGraphics(next)
            }
            onImportGlb={(charId, file) => {
              if (!engineRef.current) return Promise.reject(new Error('No engine'));
              return engineRef.current.importCharacterGlb(charId, file);
            }}
            onImportVoice={(charId, eventKey, file) => {
              if (!engineRef.current) return Promise.reject(new Error('No engine'));
              return engineRef.current.importVoiceClip(charId, eventKey, file);
            }}
            onPreviewVoice={(charId, outcome) =>
              engineRef.current?.previewPostMatchVoice(charId, outcome)
            }
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
