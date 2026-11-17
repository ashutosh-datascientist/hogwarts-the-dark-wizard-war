import React, { useRef, useState } from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Upload,
  Sparkles,
  Zap,
  Swords,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  LogOut,
  Music,
  CloudRain,
  Mic,
  Wand2,
  Users,
  Flame,
  Maximize2,
  X,
  HelpCircle,
} from 'lucide-react';
import { CHARACTERS, CHARACTER_MAP } from '../game/data/characters';
import heroBattleArt from '../assets/images/wizard_confrontation_hero_1794820323610.jpg';
import {
  AudioMixerSettings,
  BattleHudSnapshot,
  BattleMode,
  CharacterDefinition,
  CreatureType,
  Faction,
  FighterHudState,
  GraphicsQuality,
  GraphicsSettings,
} from '../game/types';

interface GameUIProps {
  hud: BattleHudSnapshot;
  portraits: Record<string, string>;
  engineReady: boolean;
  onOpenModeSelect: () => void;
  onStartMode: (mode: BattleMode, faction?: Faction, warSize?: 1 | 2 | 3) => void;
  onSetFactionSetup: (faction: Faction, warSize: 1 | 2 | 3) => void;
  onInspectCharacter: (id: string) => void;
  onToggleTeamMember: (id: string) => void;
  onRemoveTeamSlot: (slotIndex: number, side: 'ally' | 'enemy') => void;
  onRotatePreview: (deltaYaw: number) => void;
  onConfirmTeam: () => void;
  onBackToTeamSelect: () => void;
  onConfirmOpponent: () => void;
  onRematch: () => void;
  onSkipIntro: () => void;
  onReturnToCharacterSelect: () => void;
  onReturnToMainMenu: () => void;
  onExitGame: () => void;
  onResume: () => void;
  onPause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onUpdateAudioMixer: (next: Partial<AudioMixerSettings>) => void;
  onUpdateGraphics: (next: Partial<GraphicsSettings>) => void;
  onImportGlb: (charId: string, file: File) => Promise<string>;
  onImportVoice: (charId: string, eventKey: string, file: File) => Promise<void>;
  onPreviewVoice: (charId: string, outcome: 'VICTORY' | 'DEFEAT') => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function factionLabel(faction: Faction): string {
  return faction === 'DUMBLEDORES_ARMY' ? "Dumbledore's Army" : 'Dark Arts';
}

function creatureLabel(creature: CreatureType): string {
  const map: Record<CreatureType, string> = {
    phoenix_eternal_fire: 'Phoenix of Eternal Fire',
    giant_black_serpent: 'Giant Black Serpent',
    ancient_cat: 'Ancient Spirit Cat',
    shadow_serpent: 'Shadow Serpent',
    infernal_raven_swarm: 'Infernal Raven Swarm',
    blue_stag: 'Luminous Blue Stag',
    arcane_silver_owl: 'Arcane Silver Owl',
    spectral_black_hound: 'Spectral Black Hound',
    dark_mark_serpent: 'Dark Mark Serpent',
    moonlit_wolf: 'Moonlit Wolf',
    ice_wraith_dragon: 'Ice Wraith Dragon',
    crimson_fire_horse: 'Crimson Fire Horse',
    ancient_thorn_guardian: 'Ancient Thorn Guardian',
    flaming_jack_russell: 'Flaming Jack Russell Terrier',
    house_elf_cosmic_guardian: 'Cosmic Elf Guardian',
  };
  return map[creature];
}

function teamSizeForHud(hud: BattleHudSnapshot): number {
  if (hud.battleMode === 'DUEL_1V1') return 1;
  if (hud.battleMode === 'TEAM_2V2') return 2;
  if (hud.battleMode === 'TEAM_3V3') return 3;
  return hud.factionWarSize;
}

function modeTitle(hud: BattleHudSnapshot): string {
  if (hud.battleMode === 'DUEL_1V1') return '1 vs 1 DUEL';
  if (hud.battleMode === 'TEAM_2V2') return '2 vs 2 TEAM BATTLE';
  if (hud.battleMode === 'TEAM_3V3') return '3 vs 3 TEAM WAR';
  return `FACTION WAR (${hud.factionWarSize}v${hud.factionWarSize})`;
}

const TeamBarCard: React.FC<{ fighter: FighterHudState; align: 'left' | 'right' }> = ({
  fighter,
  align,
}) => {
  const pct = Math.max(0, Math.min(100, (fighter.hp / fighter.maxHp) * 100));
  const isDA = fighter.faction === 'DUMBLEDORES_ARMY';
  const barGrad = isDA
    ? 'from-sky-600 to-cyan-300'
    : 'from-emerald-700 to-emerald-400';

  return (
    <div
      className={`bg-[#070b12]/90 border rounded px-2.5 py-1.5 transition-opacity ${
        fighter.alive ? 'border-slate-700/80' : 'border-rose-900/60 opacity-50'
      }`}
    >
      <div
        className={`flex items-baseline justify-between gap-2 mb-1 ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <div className="truncate flex items-center gap-1.5">
          <span className="font-display text-xs font-bold text-white truncate">
            {fighter.name}
          </span>
          {fighter.isPlayerControlled && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/25 text-amber-300 font-bold">
              YOU
            </span>
          )}
          {!fighter.alive && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-rose-900/60 text-rose-300 font-bold">
              DEFEATED
            </span>
          )}
        </div>
        <span className="text-[11px] font-bold tabular-nums text-slate-200 shrink-0">
          {fighter.hp.toLocaleString()} / {fighter.maxHp.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
        <div
          className={`h-full bg-gradient-to-r ${barGrad} ${
            align === 'right' ? 'ml-auto' : ''
          } transition-[width] duration-100`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const GameUI: React.FC<GameUIProps> = ({
  hud,
  portraits,
  engineReady,
  onOpenModeSelect,
  onStartMode,
  onSetFactionSetup,
  onInspectCharacter,
  onToggleTeamMember,
  onRemoveTeamSlot,
  onRotatePreview,
  onConfirmTeam,
  onBackToTeamSelect,
  onConfirmOpponent,
  onRematch,
  onSkipIntro,
  onReturnToCharacterSelect,
  onReturnToMainMenu,
  onExitGame,
  onResume,
  onPause,
  onToggleMute,
  onToggleFullscreen,
  onUpdateAudioMixer,
  onUpdateGraphics,
  onImportGlb,
  onImportVoice,
  onPreviewVoice,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'AUDIO' | 'GRAPHICS' | 'ASSETS'>('AUDIO');
  const [assetTargetId, setAssetTargetId] = useState<string>('harry');
  const [importStatus, setImportStatus] = useState<string>('');
  const [heroImgError, setHeroImgError] = useState(false);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const handlePreviewPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePreviewPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    onRotatePreview(dx * 0.012 * hud.graphics.mouseSensitivity);
  };

  const handlePreviewPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleGlbUpload = async (
    charId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const name = await onImportGlb(charId, file);
      const charName = CHARACTER_MAP.get(charId)?.name ?? charId;
      setImportStatus(`Loaded "${name}" for ${charName}.`);
    } catch {
      setImportStatus('Could not load GLB/GLTF file. Verify valid rigged glTF binary.');
    }
  };

  const handleVoiceUpload = async (
    charId: string,
    eventKey: 'victory' | 'defeat',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImportVoice(charId, eventKey, file);
      const charName = CHARACTER_MAP.get(charId)?.name ?? charId;
      const label = eventKey === 'victory' ? 'Victory' : 'Defeat';
      setImportStatus(`Loaded ${label} voice "${file.name}" for ${charName}.`);
    } catch {
      setImportStatus('Could not decode audio file. Use .mp3, .wav, or .ogg.');
    }
  };

  const previewChar = CHARACTER_MAP.get(hud.previewCharacterId) ?? CHARACTERS[5];
  const requiredTeamSize = teamSizeForHud(hud);

  const selectableChars: CharacterDefinition[] = (() => {
    if (hud.phase === 'SELECT_TEAM') {
      if (hud.battleMode === 'FACTION_WAR') {
        return CHARACTERS.filter((c) => c.faction === hud.playerFaction);
      }
      return CHARACTERS;
    }
    if (hud.phase === 'SELECT_OPPONENTS') {
      if (hud.battleMode === 'FACTION_WAR') {
        const enemyFaction: Faction =
          hud.playerFaction === 'DUMBLEDORES_ARMY' ? 'DARK_ARTS' : 'DUMBLEDORES_ARMY';
        return CHARACTERS.filter((c) => c.faction === enemyFaction);
      }
      return CHARACTERS.filter((c) => !hud.selectedAllies.includes(c.id));
    }
    return CHARACTERS;
  })();

  const energyPct = Math.max(0, Math.min(100, (hud.player.energy / hud.player.maxEnergy) * 100));

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between text-slate-100 select-none">
      {/* ========================================================= */}
      {/* INITIAL COURTYARD & RIG LOADING OVERLAY                   */}
      {/* ========================================================= */}
      {!engineReady && (
        <div className="absolute inset-0 pointer-events-auto z-50 bg-[#04070d] flex flex-col items-center justify-center px-6">
          <div className="max-w-md w-full bg-[#070c15] border border-amber-500/40 rounded-lg p-8 text-center flex flex-col items-center gap-4 shadow-2xl">
            <Wand2 className="w-8 h-8 text-amber-400" />
            <div className="text-[11px] uppercase tracking-[0.26em] text-amber-400 font-bold">
              Initializing 3D Courtyard
            </div>
            <h2 className="font-display text-2xl font-black tracking-wider text-white">
              HOGWARTS – THE DARK WIZARD WAR
            </h2>
            <div className="w-full h-2 bg-slate-900 rounded overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-sky-300 transition-[width] duration-300"
                style={{
                  width: `${Math.max(20, Math.round((Object.keys(portraits).length / 15) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Preparing stormy Hogwarts shaders, destructible stone structures, and 15 rigged wizards...
            </p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SCREEN 1: MAIN MENU (AAA 4-WIZARD HERO CONFRONTATION)     */}
      {/* ========================================================= */}
      {hud.phase === 'MAIN_MENU' && (
        <div className="absolute inset-0 pointer-events-auto bg-[#04070d] flex flex-col justify-between overflow-hidden">
          {/* Full-bleed Hero Artwork Layer (Main Menu Only) */}
          <div className="absolute inset-0">
            {!heroImgError ? (
              <img
                src={heroBattleArt}
                alt="Albus Dumbledore and Harry Potter confronting Lord Voldemort and Severus Snape in a stormy Hogwarts courtyard"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgError(true)}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-[#0a1933] via-[#060911] to-[#0a1e16]" />
            )}
            {/* Measured top & bottom scrims keep all 4 characters & center magic clash unobstructed */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#04070d]/92 via-transparent to-[#04070d]/95" />
            <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#04070d]/85 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#04070d]/95 via-[#04070d]/70 to-transparent" />
          </div>

          {/* Top Hero Title Lockup */}
          <header className="relative z-10 w-full max-w-6xl mx-auto px-8 pt-6 pb-4 text-center flex flex-col items-center">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black tracking-wider text-white leading-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)] text-balance">
              HOGWARTS – THE DARK WIZARD WAR
            </h1>
            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-200/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              <span>15 Playable Wizards</span>
              <span aria-hidden="true">&middot;</span>
              <span>15 Creature Ultimates</span>
              <span aria-hidden="true">&middot;</span>
              <span>Destructible Hogwarts Courtyard</span>
            </div>
          </header>

          {/* Center Confrontation Band (Unobstructed Artwork + Opposing Faction Names) */}
          <div className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-8 flex items-end justify-between pb-4 pointer-events-none">
            <div className="text-left drop-shadow-[0_3px_14px_rgba(0,0,0,0.98)]">
              <span className="font-display text-base sm:text-lg lg:text-xl font-black uppercase tracking-[0.2em] text-sky-300">
                DUMBLEDORE&apos;S ARMY
              </span>
            </div>
            <div className="text-right drop-shadow-[0_3px_14px_rgba(0,0,0,0.98)]">
              <span className="font-display text-base sm:text-lg lg:text-xl font-black uppercase tracking-[0.2em] text-emerald-300">
                DARK ARTS
              </span>
            </div>
          </div>

          {/* Bottom Docked Menu Command Strip (Does not cover characters) */}
          <div className="relative z-10 w-full max-w-5xl mx-auto px-6 pb-6">
            <div className="bg-[#070c15]/88 backdrop-blur-md border border-amber-500/35 rounded-lg p-4 shadow-2xl flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  onClick={() => onStartMode('DUEL_1V1')}
                  className="py-3 px-4 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold tracking-widest text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Swords className="w-4 h-4 shrink-0" /> PLAY (1v1 DUEL)
                </button>

                <button
                  onClick={() => onStartMode('TEAM_2V2')}
                  className="py-3 px-4 rounded border border-sky-500/50 bg-[#0d182b] hover:bg-[#152542] text-sky-100 font-display font-bold tracking-wider text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Users className="w-4 h-4 text-sky-400 shrink-0" /> 2 vs 2 TEAM BATTLE
                </button>

                <button
                  onClick={() => onStartMode('TEAM_3V3')}
                  className="py-3 px-4 rounded border border-cyan-500/50 bg-[#0d182b] hover:bg-[#152542] text-cyan-100 font-display font-bold tracking-wider text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Users className="w-4 h-4 text-cyan-400 shrink-0" /> 3 vs 3 TEAM WAR
                </button>

                <button
                  onClick={onOpenModeSelect}
                  className="py-3 px-4 rounded border border-emerald-500/55 bg-[#0b1817] hover:bg-[#122624] text-emerald-100 font-display font-bold tracking-wider text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Flame className="w-4 h-4 text-emerald-400 shrink-0" /> GAME MODES
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-300/90 text-center md:text-left">
                  Desktop Controls: Arrow Keys Move &middot; Shift Run &middot; Space Dodge &middot; Mouse Aim &middot; Right Click Shield &middot; Numpad 1/2/3 Cast
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowControls(true)}
                    className="py-2 px-3.5 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#16233a] text-slate-100 font-display font-bold tracking-wider text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" /> HOW TO PLAY
                  </button>
                  <button
                    onClick={() => {
                      setSettingsTab('AUDIO');
                      setShowSettings(true);
                    }}
                    className="py-2 px-3.5 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#16233a] text-slate-100 font-display font-bold tracking-wider text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" /> SETTINGS
                  </button>
                  <button
                    onClick={onExitGame}
                    className="py-2 px-3.5 rounded border border-slate-800 bg-[#090e18] hover:bg-[#1a1218] hover:border-rose-700/70 text-slate-300 hover:text-rose-300 font-display font-bold tracking-wider text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" /> EXIT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FACTION WAR & BATTLE MODE SELECTOR                        */}
      {/* ========================================================= */}
      {hud.phase === 'SELECT_MODE' && (
        <div className="absolute inset-0 pointer-events-auto flex items-center justify-center bg-[#04070d]/72 px-6">
          <div className="max-w-2xl w-full bg-[#070c15]/95 border border-slate-700 rounded-lg p-7 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-amber-400 font-bold">
                  Battle Mode &amp; Faction Setup
                </div>
                <h2 className="font-display text-2xl font-black text-white tracking-wider">
                  DUMBLEDORE&apos;S ARMY vs DARK ARTS
                </h2>
              </div>
              <button
                onClick={onReturnToMainMenu}
                className="px-3 py-1.5 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#17233a] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>

            {/* Choose Side */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                1. Choose Your Faction
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onSetFactionSetup('DUMBLEDORES_ARMY', hud.factionWarSize)}
                  className={`p-4 rounded border text-left cursor-pointer transition-colors ${
                    hud.playerFaction === 'DUMBLEDORES_ARMY'
                      ? 'bg-[#0e1f38] border-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.25)]'
                      : 'bg-[#0b111d] border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="font-display text-base font-black text-sky-300">
                    DUMBLEDORE&apos;S ARMY
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    10 Defenders &middot; Luminous Blue-White, Golden Fire &amp; Guardian Beasts
                  </div>
                </button>

                <button
                  onClick={() => onSetFactionSetup('DARK_ARTS', hud.factionWarSize)}
                  className={`p-4 rounded border text-left cursor-pointer transition-colors ${
                    hud.playerFaction === 'DARK_ARTS'
                      ? 'bg-[#101f19] border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                      : 'bg-[#0b111d] border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="font-display text-base font-black text-emerald-300">
                    DARK ARTS
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    5 Dark Wizards &middot; Black Smoke, Emerald Curses, Crimson Storms &amp; Serpents
                  </div>
                </button>
              </div>
            </div>

            {/* Choose Match Scale */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                2. Choose Faction Battle Size
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([1, 2, 3] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => onSetFactionSetup(hud.playerFaction, sz)}
                    className={`py-3 rounded border font-display font-bold text-sm cursor-pointer ${
                      hud.factionWarSize === sz
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-[#0b111d] border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {sz} vs {sz} FACTION {sz === 1 ? 'DUEL' : 'WAR'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                onStartMode('FACTION_WAR', hud.playerFaction, hud.factionWarSize)
              }
              className="w-full py-3.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold tracking-wider text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              SELECT {factionLabel(hud.playerFaction).toUpperCase()} SQUAD ({hud.factionWarSize}v{hud.factionWarSize})
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXITED SCREEN                                             */}
      {/* ========================================================= */}
      {hud.phase === 'EXITED' && (
        <div className="absolute inset-0 pointer-events-auto flex flex-col items-center justify-center bg-[#03050a]/96 px-6">
          <div className="max-w-md w-full bg-[#080d16] border border-slate-800 rounded-lg p-8 text-center flex flex-col gap-4">
            <h2 className="font-display text-2xl font-bold text-white tracking-wider">
              SESSION CLOSED
            </h2>
            <p className="text-xs text-slate-400">
              You have left the Hogwarts courtyard. Return anytime to select your wizards and begin a battle.
            </p>
            <button
              onClick={onReturnToMainMenu}
              className="py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold tracking-wider text-sm cursor-pointer"
            >
              RETURN TO MAIN MENU
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TEAM & OPPONENT SELECTION (1v1 / 2v2 / 3v3 / FACTION WAR) */}
      {/* ========================================================= */}
      {(hud.phase === 'SELECT_TEAM' || hud.phase === 'SELECT_OPPONENTS') && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
          {/* Top Header */}
          <div className="pointer-events-auto flex items-center justify-between bg-[#070b13]/94 border border-slate-700/80 rounded px-5 py-3 gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={
                  hud.phase === 'SELECT_OPPONENTS'
                    ? onBackToTeamSelect
                    : onReturnToMainMenu
                }
                className="px-3 py-1.5 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#17233a] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {hud.phase === 'SELECT_OPPONENTS' ? 'Change Your Team' : 'Main Menu'}
              </button>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-amber-400 font-bold">
                  {modeTitle(hud)} &middot;{' '}
                  {hud.phase === 'SELECT_TEAM'
                    ? `Step 1 of 2 — Pick ${requiredTeamSize} ${requiredTeamSize === 1 ? 'Wizard' : 'Teammates'}`
                    : `Step 2 of 2 — Pick ${requiredTeamSize} ${requiredTeamSize === 1 ? 'Opponent' : 'Enemies'}`}
                </div>
                <h2 className="font-display text-lg font-black text-white tracking-wider">
                  {hud.phase === 'SELECT_TEAM'
                    ? hud.battleMode === 'FACTION_WAR'
                      ? `SELECT ${factionLabel(hud.playerFaction).toUpperCase()} TEAM`
                      : 'SELECT YOUR CHARACTER' + (requiredTeamSize > 1 ? 'S' : '')
                    : hud.battleMode === 'FACTION_WAR'
                      ? `SELECT ${factionLabel(hud.playerFaction === 'DUMBLEDORES_ARMY' ? 'DARK_ARTS' : 'DUMBLEDORES_ARMY').toUpperCase()} OPPONENTS`
                      : 'SELECT OPPONENT' + (requiredTeamSize > 1 ? 'S' : '')}
                </h2>
              </div>
            </div>

            {/* Active Multi-Slot Squad Tray */}
            <div className="flex items-center gap-2">
              {(hud.phase === 'SELECT_TEAM'
                ? hud.selectedAllies
                : hud.selectedOpponents
              ).map((id, idx) => {
                const char = CHARACTER_MAP.get(id);
                if (!char) return null;
                const side = hud.phase === 'SELECT_TEAM' ? 'ally' : 'enemy';
                return (
                  <div
                    key={`${side}-${id}-${idx}`}
                    className="px-2.5 py-1 rounded border border-amber-500/50 bg-[#10192b] flex items-center gap-2 text-xs"
                  >
                    <span className="text-[10px] text-amber-400 font-bold">
                      {hud.phase === 'SELECT_TEAM' && idx === 0 ? 'YOU' : `#${idx + 1}`}
                    </span>
                    <span className="font-semibold text-white">{char.name}</span>
                    {requiredTeamSize > 1 &&
                      (hud.phase === 'SELECT_TEAM'
                        ? hud.selectedAllies.length > 1
                        : hud.selectedOpponents.length > 1) && (
                        <button
                          onClick={() => onRemoveTeamSlot(idx, side)}
                          className="text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Remove from slot"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onToggleMute}
                className="p-2 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#16233a] text-slate-300 hover:text-white cursor-pointer"
                title="Mute / Unmute"
              >
                {hud.audioMixer.masterMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="px-3 py-2 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#16233a] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                Settings
              </button>
            </div>
          </div>

          {/* Main Split: Roster Grid + Live 3D Stage + Inspector */}
          <div className="flex-1 flex gap-4 mt-3 min-h-0">
            <div className="pointer-events-auto w-[630px] bg-[#060a11]/92 border border-slate-700/80 rounded p-3 overflow-y-auto grid grid-cols-3 gap-2.5 content-start">
              {selectableChars.map((c) => {
                const activeList =
                  hud.phase === 'SELECT_TEAM'
                    ? hud.selectedAllies
                    : hud.selectedOpponents;
                const slotIdx = activeList.indexOf(c.id);
                const inSquad = slotIdx >= 0;
                const isPreviewed = c.id === hud.previewCharacterId;
                const portraitUrl = portraits[c.id];
                const isDA = c.faction === 'DUMBLEDORES_ARMY';

                return (
                  <button
                    key={c.id}
                    onClick={() => onToggleTeamMember(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onInspectCharacter(c.id);
                    }}
                    className={`text-left rounded border p-2.5 flex flex-col gap-1.5 cursor-pointer transition-colors ${
                      inSquad
                        ? 'bg-[#132036] border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.28)]'
                        : isPreviewed
                          ? 'bg-[#0e1726] border-sky-400/70'
                          : 'bg-[#0a101b] border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <div className="w-14 h-16 rounded overflow-hidden border border-slate-700 bg-[#080d16] shrink-0 flex items-center justify-center relative">
                        {portraitUrl ? (
                          <img
                            src={portraitUrl}
                            alt={c.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Wand2 className="w-5 h-5 text-slate-600" />
                        )}
                        {inSquad && (
                          <span className="absolute top-0.5 right-0.5 px-1 rounded bg-amber-500 text-slate-950 text-[9px] font-black">
                            {hud.phase === 'SELECT_TEAM' && slotIdx === 0
                              ? 'YOU'
                              : `#${slotIdx + 1}`}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-xs font-bold text-white truncate">
                          {c.name}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-amber-400 font-bold tabular-nums">
                            PWR {c.powerRating}
                          </span>
                          <span
                            className={`text-[9px] font-bold ${
                              isDA ? 'text-sky-400' : 'text-emerald-400'
                            }`}
                          >
                            {isDA ? 'DA' : 'DARK'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] text-slate-300 tabular-nums">
                          <span>ATK {c.attackRating}</span>
                          <span>DEF {c.defenseRating}</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-800/90 pt-1 text-[10px] truncate">
                      <span className="text-slate-400">BEAST: </span>
                      <span
                        className="font-semibold"
                        style={{ color: c.spells.ultimate.primaryColor }}
                      >
                        {creatureLabel(c.ultimateCreature)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* CENTER/RIGHT: Live 3D Stage + Inspector */}
            <div className="flex-1 flex justify-between items-stretch gap-4">
              <div
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerCancel={handlePreviewPointerUp}
                className="pointer-events-auto flex-1 relative rounded border border-slate-800/70 cursor-grab active:cursor-grabbing flex flex-col justify-between p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded bg-[#070b13]/85 border border-slate-700 text-[11px] text-slate-300">
                    Drag to rotate 3D wizard 360° &middot; Click card to add/remove squad slot
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotatePreview(-0.55);
                      }}
                      className="p-1.5 rounded bg-[#070b13]/85 border border-slate-700 hover:border-amber-400 text-slate-200 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotatePreview(0.55);
                      }}
                      className="p-1.5 rounded bg-[#070b13]/85 border border-slate-700 hover:border-amber-400 text-slate-200 cursor-pointer"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="self-center bg-[#060a12]/90 border border-slate-700/80 rounded px-5 py-2 text-center">
                  <div className="font-display text-lg font-black text-white tracking-wider">
                    {previewChar.name}
                  </div>
                  <div className="text-[11px] text-amber-400">
                    {previewChar.title} &middot; {factionLabel(previewChar.faction)}
                  </div>
                </div>
              </div>

              {/* Right Character Inspector & Confirm Button */}
              <div className="pointer-events-auto w-84 bg-[#070b13]/94 border border-slate-700/85 rounded p-4 flex flex-col justify-between">
                <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">
                        {previewChar.wandName}
                      </span>
                      <span className="font-display text-lg font-black text-amber-400 tabular-nums">
                        {previewChar.powerRating}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center bg-[#0b121f] border border-slate-800 rounded p-2">
                      <div>
                        <div className="text-[10px] text-slate-400">ATTACK</div>
                        <div className="text-sm font-bold text-rose-300 tabular-nums">
                          {previewChar.attackRating}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">DEFENCE</div>
                        <div className="text-sm font-bold text-sky-300 tabular-nums">
                          {previewChar.defenseRating}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">HEALTH</div>
                        <div className="text-sm font-bold text-emerald-300 tabular-nums">
                          {previewChar.maxHp}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      3-Spell Combat Arsenal
                    </div>
                    {[
                      { label: 'NUMPAD 1 · Basic', sp: previewChar.spells.basic },
                      { label: 'NUMPAD 2 · Mid', sp: previewChar.spells.mid },
                      { label: 'NUMPAD 3 · Ultimate Creature', sp: previewChar.spells.ultimate },
                    ].map(({ label, sp }) => (
                      <div
                        key={label}
                        className="bg-[#0b121e] border border-slate-800 rounded px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{label}</span>
                          <span className="text-slate-400 tabular-nums">
                            {sp.damageMin}–{sp.damageMax} DMG
                          </span>
                        </div>
                        <div
                          className="font-display text-xs font-bold mt-0.5"
                          style={{ color: sp.primaryColor }}
                        >
                          {sp.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          {sp.description}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#0b121e] border border-slate-800 rounded px-2.5 py-2 text-[10px]">
                    <div className="text-amber-400 font-bold uppercase tracking-wider">
                      Creature Ultimate &amp; Horror Sound Profile
                    </div>
                    <div className="text-slate-200 mt-1">
                      {creatureLabel(previewChar.ultimateCreature)} &middot;{' '}
                      {previewChar.audioProfile.sonicIdentity}
                    </div>
                  </div>
                </div>

                <button
                  onClick={
                    hud.phase === 'SELECT_TEAM' ? onConfirmTeam : onConfirmOpponent
                  }
                  className="mt-3 w-full py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold tracking-wider text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {hud.phase === 'SELECT_TEAM'
                    ? `CONFIRM TEAM (${hud.selectedAllies.length}/${requiredTeamSize})`
                    : `START ${modeTitle(hud)}`}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* BATTLE INTRODUCTION FACE-OFF                              */}
      {/* ========================================================= */}
      {hud.phase === 'INTRO' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
          <div className="bg-[#04070d]/92 border-b border-slate-800 px-8 py-4 flex items-center justify-between gap-8">
            <div className="w-80 flex flex-col gap-1.5">
              {hud.allies.map((a) => (
                <TeamBarCard key={`intro-a-${a.id}`} fighter={a} align="left" />
              ))}
            </div>

            <div className="text-center">
              <div className="text-[10px] tracking-[0.25em] uppercase text-amber-400 font-bold">
                {modeTitle(hud)} &middot; HOGWARTS COURTYARD
              </div>
              <div className="font-display text-xl font-black text-white tracking-widest mt-1">
                {hud.battleMode === 'FACTION_WAR'
                  ? `${factionLabel(hud.playerFaction).toUpperCase()} vs ${factionLabel(hud.playerFaction === 'DUMBLEDORES_ARMY' ? 'DARK_ARTS' : 'DUMBLEDORES_ARMY').toUpperCase()}`
                  : 'VS'}
              </div>
            </div>

            <div className="w-80 flex flex-col gap-1.5">
              {hud.enemies.map((e) => (
                <TeamBarCard key={`intro-e-${e.id}`} fighter={e} align="right" />
              ))}
            </div>
          </div>

          <div className="bg-[#04070d]/92 border-t border-slate-800 px-8 py-5 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {hud.destructiblesTotal} Destructible Courtyard Structures Ready
            </div>
            <div className="font-display text-sm text-amber-400 tracking-widest uppercase">
              Wands Ready — Engage!
            </div>
            <button
              onClick={onSkipIntro}
              className="pointer-events-auto px-4 py-2 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#17233a] text-xs font-semibold text-slate-200 cursor-pointer"
            >
              Skip Intro
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-GAME BATTLE HUD (1v1 / 2v2 / 3v3 / FACTION WAR)        */}
      {/* ========================================================= */}
      {(hud.phase === 'PLAYING' ||
        hud.phase === 'PAUSED' ||
        hud.phase === 'VICTORY' ||
        hud.phase === 'DEFEAT') && (
        <>
          {/* TOP MULTI-FIGHTER HEALTH BARS + MATCH STATUS */}
          <div className="flex items-start justify-between px-5 pt-3.5 gap-4">
            <div className="w-80 flex flex-col gap-1.5">
              {hud.battleMode === 'FACTION_WAR' && (
                <div className="text-[10px] font-bold tracking-widest uppercase text-sky-400 px-1">
                  {factionLabel(hud.playerFaction)}
                </div>
              )}
              {hud.allies.map((a) => (
                <TeamBarCard key={`ally-${a.id}`} fighter={a} align="left" />
              ))}
            </div>

            <div className="flex items-center gap-3 bg-[#070b12]/90 border border-slate-800 rounded px-4 py-2 pointer-events-auto">
              <span className="font-display text-xs tracking-widest uppercase text-amber-400 font-bold">
                {modeTitle(hud)}
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-display text-base font-bold tabular-nums text-white">
                {formatTime(hud.elapsedSeconds)}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-slate-300 tabular-nums">
                Structures: {hud.destructiblesIntact}/{hud.destructiblesTotal}
              </span>
              <span className="text-slate-600">|</span>
              <button
                onClick={onToggleMute}
                title="Toggle Audio"
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                {hud.audioMixer.masterMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                title="Audio Mixer, Graphics & Controls"
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={hud.phase === 'PAUSED' ? onResume : onPause}
                title="Pause (Esc)"
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                {hud.phase === 'PAUSED' ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="w-80 flex flex-col gap-1.5">
              {hud.battleMode === 'FACTION_WAR' && (
                <div className="text-[10px] font-bold tracking-widest uppercase text-emerald-400 px-1 text-right">
                  {factionLabel(
                    hud.playerFaction === 'DUMBLEDORES_ARMY'
                      ? 'DARK_ARTS'
                      : 'DUMBLEDORES_ARMY'
                  )}
                </div>
              )}
              {hud.enemies.map((e) => (
                <TeamBarCard key={`enemy-${e.id}`} fighter={e} align="right" />
              ))}
            </div>
          </div>

          {/* CENTER CLASH, CREATURE BANNER & RELIC */}
          <div className="flex flex-col items-center gap-2.5 my-auto">
            {hud.activeCreatures.length > 0 && (
              <div className="px-4 py-1.5 rounded bg-[#0a0f1a]/92 border border-amber-400/70 text-xs font-display font-bold text-amber-300 tracking-wider uppercase shadow-lg">
                ULTIMATE CREATURE SUMMONED: {hud.activeCreatures.join(' · ')}
              </div>
            )}

            {hud.clash.active && (
              <div className="w-[480px] bg-[#070b13]/95 border border-amber-400/70 rounded p-3 shadow-2xl">
                <div className="flex items-center justify-between text-xs font-display font-bold mb-1.5">
                  <span className="text-sky-300 truncate max-w-[145px]">
                    {hud.clash.playerSpellName}
                  </span>
                  <span className="text-amber-300 tracking-wider uppercase text-[11px]">
                    CLASH — MASH NUMPAD 1/2 OR CLICK!
                  </span>
                  <span className="text-emerald-300 truncate max-w-[145px]">
                    {hud.clash.opponentSpellName}
                  </span>
                </div>
                <div className="h-3.5 w-full bg-slate-900 rounded overflow-hidden border border-slate-700 flex">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-white transition-[width] duration-75"
                    style={{ width: `${hud.clash.balance * 100}%` }}
                  />
                  <div className="h-full flex-1 bg-gradient-to-r from-emerald-500 to-emerald-800" />
                </div>
              </div>
            )}

            {hud.healthOrbActive && (
              <div className="px-3 py-1 rounded bg-[#08101c]/90 border border-amber-400/40 text-[11px] text-amber-300 tracking-wider uppercase">
                Restoration Relic Appeared in Courtyard Center (+140 HP)
              </div>
            )}

            {!hud.player.alive && hud.phase === 'PLAYING' && (
              <div className="px-4 py-1.5 rounded bg-[#15080b]/90 border border-rose-500/60 text-xs font-display font-bold text-rose-300 tracking-wider uppercase">
                YOU WERE KNOCKED OUT — SPECTATING SURVIVING ALLIES
              </div>
            )}
          </div>

          {/* BOTTOM SPELL BAR (Zero combat character dialogue) */}
          <div className="px-6 pb-4 flex flex-col items-center gap-2">

            <div className="bg-[#070c14]/92 border border-slate-700/80 rounded px-5 py-3 flex items-center gap-5">
              <div className="w-40 bg-[#0c1422] border border-slate-700 rounded px-3 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-sky-400">NUMPAD 1</span>
                  <span className="text-slate-400 tabular-nums">
                    {hud.player.cooldowns.basic > 0
                      ? `${hud.player.cooldowns.basic.toFixed(1)}s`
                      : 'READY'}
                  </span>
                </div>
                <div className="text-xs font-display font-bold text-white truncate mt-0.5">
                  {hud.player.spells.basicName}
                </div>
                <div className="text-[10px] text-slate-400">Basic Attack &middot; 0 Energy</div>
              </div>

              <div
                className={`w-40 bg-[#0c1422] border rounded px-3 py-2 ${
                  hud.player.energy >= 24 && hud.player.cooldowns.mid <= 0
                    ? 'border-amber-500/70'
                    : 'border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-amber-400">NUMPAD 2</span>
                  <span className="text-slate-400 tabular-nums">
                    {hud.player.cooldowns.mid > 0
                      ? `${hud.player.cooldowns.mid.toFixed(1)}s`
                      : 'READY'}
                  </span>
                </div>
                <div className="text-xs font-display font-bold text-white truncate mt-0.5">
                  {hud.player.spells.midName}
                </div>
                <div className="text-[10px] text-slate-400">Mid Attack &middot; 25 Energy</div>
              </div>

              <div
                className={`w-48 bg-[#0c1422] border rounded px-3 py-2 ${
                  hud.player.energy >= 100 && hud.player.cooldowns.ultimate <= 0
                    ? 'border-cyan-400 shadow-[0_0_16px_rgba(56,189,248,0.3)]'
                    : 'border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-cyan-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    NUMPAD 3
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    {hud.player.cooldowns.ultimate > 0
                      ? `${hud.player.cooldowns.ultimate.toFixed(1)}s`
                      : hud.player.energy >= 100
                        ? 'CHARGED'
                        : `${Math.floor(hud.player.energy)}%`}
                  </span>
                </div>
                <div className="text-xs font-display font-bold text-white truncate mt-0.5">
                  {hud.player.spells.ultimateName}
                </div>
                <div className="text-[10px] text-slate-400">Creature Ultimate &middot; 100</div>
              </div>

              <div className="w-52 flex flex-col gap-1.5 border-l border-slate-700 pl-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-cyan-300 font-semibold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> MAGICAL ENERGY
                  </span>
                  <span className="tabular-nums font-bold text-white">
                    {Math.floor(hud.player.energy)} / 100
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-cyan-200 transition-[width] duration-75"
                    style={{ width: `${energyPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] mt-0.5">
                  <span
                    className={`flex items-center gap-1 font-semibold ${
                      hud.player.shieldActive ? 'text-sky-300' : 'text-slate-400'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    RMB SHIELD {Math.round(hud.player.shieldIntegrity)}%
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    SPACE{' '}
                    {hud.player.cooldowns.dodge > 0
                      ? `${hud.player.cooldowns.dodge.toFixed(1)}s`
                      : 'READY'}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 tracking-wide">
              ARROWS Move &middot; SHIFT Run &middot; SPACE Dodge &middot; MOUSE Aim &middot; RIGHT CLICK Shield &middot; NUMPAD 1 / 2 / 3 Cast &middot; ESC Pause
            </div>
          </div>

          {/* PAUSE MODAL */}
          {hud.phase === 'PAUSED' && (
            <div className="absolute inset-0 pointer-events-auto bg-[#04070d]/85 flex items-center justify-center">
              <div className="w-92 bg-[#090f19] border border-slate-700 rounded p-6 flex flex-col gap-3">
                <h3 className="font-display text-2xl font-bold text-center tracking-wider text-white">
                  BATTLE PAUSED
                </h3>
                <button
                  onClick={onResume}
                  className="py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold tracking-wider text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" /> RESUME BATTLE
                </button>
                <button
                  onClick={() => setShowControls(true)}
                  className="py-2.5 rounded border border-slate-700 bg-[#0e1624] hover:bg-[#172338] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-sky-400" /> HOW TO PLAY &amp; CONTROLS
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="py-2.5 rounded border border-slate-700 bg-[#0e1624] hover:bg-[#172338] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-amber-400" /> SETTINGS &amp; AUDIO MIXER
                </button>
                <button
                  onClick={onReturnToCharacterSelect}
                  className="py-2.5 rounded border border-slate-700 bg-[#0e1624] hover:bg-[#172338] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> SELECT NEW TEAMS
                </button>
                <button
                  onClick={onReturnToMainMenu}
                  className="py-2 rounded border border-slate-800 bg-[#080d16] hover:bg-[#131d2f] text-xs text-slate-300 font-semibold cursor-pointer"
                >
                  MAIN MENU
                </button>
              </div>
            </div>
          )}

          {/* VICTORY / DEFEAT END SCREEN */}
          {(hud.phase === 'VICTORY' || hud.phase === 'DEFEAT') && (
            <div className="absolute inset-0 pointer-events-auto bg-[#04070d]/84 flex items-center justify-center p-6">
              <div className="w-[560px] bg-[#090f19] border border-slate-700 rounded-lg p-7 flex flex-col gap-4 shadow-2xl">
                <div className="text-center">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-amber-400 font-bold mb-1">
                    {modeTitle(hud)} &middot; {formatTime(hud.elapsedSeconds)}
                  </div>
                  <div
                    className={`font-display text-3xl font-black tracking-widest ${
                      hud.phase === 'VICTORY' ? 'text-amber-400' : 'text-rose-500'
                    }`}
                  >
                    {hud.battleMode === 'FACTION_WAR' && hud.winningFaction
                      ? `${factionLabel(hud.winningFaction).toUpperCase()} VICTORY`
                      : hud.phase === 'VICTORY'
                        ? 'VICTORY'
                        : 'DEFEATED'}
                  </div>
                </div>

                {/* Post-Match Character Voice Dialogue Banner */}
                {(() => {
                  const playerDef = CHARACTER_MAP.get(hud.player.id);
                  const fallbackText =
                    hud.phase === 'VICTORY'
                      ? playerDef?.voice.victoryLine
                      : playerDef?.voice.defeatLine;
                  const speaker = hud.subtitle?.speaker ?? hud.player.name;
                  const text = hud.subtitle?.text ?? fallbackText;
                  const speakerColor =
                    hud.subtitle?.color ??
                    (hud.phase === 'VICTORY' ? '#fbbf24' : '#fda4af');
                  if (!text) return null;
                  return (
                    <div className="bg-[#0c1422] border border-slate-800 rounded px-4 py-2.5 text-center">
                      <span
                        className="font-display text-xs font-bold mr-2"
                        style={{ color: speakerColor }}
                      >
                        {speaker}:
                      </span>
                      <span className="text-xs text-slate-100 italic">
                        &ldquo;{text}&rdquo;
                      </span>
                    </div>
                  );
                })()}

                {/* Surviving / Defeated Team Breakdown */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#0c1422] border border-slate-800 rounded p-3 flex flex-col gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      Your Side ({hud.allies.filter((a) => a.alive).length}/{hud.allies.length} Alive)
                    </div>
                    {hud.allies.map((a) => (
                      <div key={`end-a-${a.id}`} className="flex justify-between">
                        <span className={a.alive ? 'text-white font-semibold' : 'text-slate-500 line-through'}>
                          {a.name}
                        </span>
                        <span className="tabular-nums text-slate-300">
                          {a.alive ? `${a.hp} HP` : 'KO'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#0c1422] border border-slate-800 rounded p-3 flex flex-col gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Opposing Side ({hud.enemies.filter((e) => e.alive).length}/{hud.enemies.length} Alive)
                    </div>
                    {hud.enemies.map((e) => (
                      <div key={`end-e-${e.id}`} className="flex justify-between">
                        <span className={e.alive ? 'text-white font-semibold' : 'text-slate-500 line-through'}>
                          {e.name}
                        </span>
                        <span className="tabular-nums text-slate-300">
                          {e.alive ? `${e.hp} HP` : 'KO'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 mt-1">
                  <button
                    onClick={onRematch}
                    className="py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold tracking-wider text-sm cursor-pointer"
                  >
                    REMATCH (SAME TEAMS &amp; REBUILT COURTYARD)
                  </button>
                  <button
                    onClick={onReturnToCharacterSelect}
                    className="py-2.5 rounded border border-slate-700 bg-[#0e1624] hover:bg-[#172338] text-xs font-bold text-slate-100 cursor-pointer"
                  >
                    SELECT NEW TEAMS / CHARACTERS
                  </button>
                  <button
                    onClick={onReturnToMainMenu}
                    className="py-2 rounded border border-slate-800 bg-[#080d16] hover:bg-[#131d2f] text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    MAIN MENU
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================= */}
      {/* SETTINGS MODAL: AUDIO MIXER, GRAPHICS, CONTROLS & ASSETS  */}
      {/* ========================================================= */}
      {showSettings && (
        <div className="absolute inset-0 pointer-events-auto bg-[#03060c]/90 flex items-center justify-center p-6 z-40">
          <div className="w-[620px] bg-[#0a101b] border border-slate-700 rounded-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-display text-lg font-bold text-white tracking-wider">
                GAME SETTINGS &amp; AUDIO MIXER
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'AUDIO', label: 'Audio & Voices' },
                  { id: 'GRAPHICS', label: 'Graphics & Controls' },
                  { id: 'ASSETS', label: '3D Models & Voices' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`py-2 rounded border text-xs font-bold uppercase tracking-wider cursor-pointer ${
                    settingsTab === tab.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-[#0e1624] border-slate-700 text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: AUDIO MIXER (MUSIC, MAGICAL SFX, CHARACTER VOICES, CREATURE SOUNDS) */}
            {settingsTab === 'AUDIO' && (
              <div className="flex flex-col gap-3 pt-1">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between bg-[#0e1624] border border-slate-800 rounded px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-white">Master Audio</span>
                    <button
                      onClick={onToggleMute}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                        hud.audioMixer.masterMuted
                          ? 'bg-rose-900/60 text-rose-300 border border-rose-700'
                          : 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                      }`}
                    >
                      {hud.audioMixer.masterMuted ? 'MUTED' : 'ACTIVE'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-[#0e1624] border border-slate-800 rounded px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-white">
                      Character Voices
                    </span>
                    <button
                      onClick={() =>
                        onUpdateAudioMixer({
                          voicesEnabled: !hud.audioMixer.voicesEnabled,
                        })
                      }
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                        !hud.audioMixer.voicesEnabled
                          ? 'bg-rose-900/60 text-rose-300 border border-rose-700'
                          : 'bg-amber-900/50 text-amber-300 border border-amber-600'
                      }`}
                    >
                      {hud.audioMixer.voicesEnabled ? 'POST-MATCH ONLY' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 bg-[#0e1624] border border-slate-800 rounded px-3.5 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white">
                      Missing Studio Asset Fallback
                    </span>
                    <span className="text-[11px] text-slate-400">
                      When a character&apos;s external studio Victory/Defeat .mp3/.wav recording is missing, use gender-matched SpeechSynthesis preview instead of silence.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      onUpdateAudioMixer({
                        ttsFallbackEnabled: !hud.audioMixer.ttsFallbackEnabled,
                      })
                    }
                    className={`px-3 py-1.5 rounded text-xs font-bold shrink-0 cursor-pointer ${
                      hud.audioMixer.ttsFallbackEnabled
                        ? 'bg-sky-900/50 text-sky-300 border border-sky-600'
                        : 'bg-slate-800 text-slate-300 border border-slate-600'
                    }`}
                  >
                    {hud.audioMixer.ttsFallbackEnabled
                      ? 'TTS PREVIEW ON'
                      : 'STRICT SILENT WHEN MISSING'}
                  </button>
                </div>

                {[
                  {
                    key: 'masterVolume' as const,
                    label: 'Master Volume',
                    icon: <Volume2 className="w-3.5 h-3.5 text-white" />,
                    val: hud.audioMixer.masterVolume,
                  },
                  {
                    key: 'musicVolume' as const,
                    label: 'Background Music',
                    icon: <Music className="w-3.5 h-3.5 text-violet-400" />,
                    val: hud.audioMixer.musicVolume,
                  },
                  {
                    key: 'attacksVolume' as const,
                    label: 'Magical Sound Effects',
                    icon: <Wand2 className="w-3.5 h-3.5 text-rose-400" />,
                    val: hud.audioMixer.attacksVolume,
                  },
                  {
                    key: 'voicesVolume' as const,
                    label: 'Character Voices (Post-Match Victory & Defeat)',
                    icon: <Mic className="w-3.5 h-3.5 text-amber-400" />,
                    val: hud.audioMixer.voicesVolume,
                  },
                  {
                    key: 'creaturesVolume' as const,
                    label: 'Creature Sounds',
                    icon: <Flame className="w-3.5 h-3.5 text-orange-400" />,
                    val: hud.audioMixer.creaturesVolume,
                  },
                  {
                    key: 'shieldsVolume' as const,
                    label: 'Magical Shield SFX',
                    icon: <Shield className="w-3.5 h-3.5 text-sky-400" />,
                    val: hud.audioMixer.shieldsVolume,
                  },
                  {
                    key: 'weatherVolume' as const,
                    label: 'Courtyard Rain & Thunder',
                    icon: <CloudRain className="w-3.5 h-3.5 text-cyan-400" />,
                    val: hud.audioMixer.weatherVolume,
                  },
                ].map((ch) => (
                  <div
                    key={ch.key}
                    className="flex flex-col gap-1 bg-[#0d1522] border border-slate-800/80 rounded px-3.5 py-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-200 font-semibold">
                        {ch.icon} {ch.label}
                      </span>
                      <span className="tabular-nums text-amber-300 font-bold">
                        {Math.round(ch.val * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={ch.val}
                      onChange={(e) =>
                        onUpdateAudioMixer({ [ch.key]: parseFloat(e.target.value) })
                      }
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* TAB 2: GRAPHICS, RESOLUTION, FULLSCREEN & MOUSE SENSITIVITY */}
            {settingsTab === 'GRAPHICS' && (
              <div className="flex flex-col gap-3.5 pt-1">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Graphics Quality Preset
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as GraphicsQuality[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => onUpdateGraphics({ quality: q })}
                        className={`py-2 rounded border text-xs font-bold cursor-pointer ${
                          hud.graphics.quality === q
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                            : 'bg-[#0e1624] border-slate-700 text-slate-300'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Render Resolution Scale
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[0.75, 1.0, 1.25].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => onUpdateGraphics({ resolutionScale: scale })}
                        className={`py-2 rounded border text-xs font-bold cursor-pointer ${
                          hud.graphics.resolutionScale === scale
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                            : 'bg-[#0e1624] border-slate-700 text-slate-300'
                        }`}
                      >
                        {scale.toFixed(2)}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    Mouse Aim Sensitivity ({hud.graphics.mouseSensitivity.toFixed(1)}x)
                  </span>
                  <input
                    type="range"
                    min={0.4}
                    max={1.8}
                    step={0.1}
                    value={hud.graphics.mouseSensitivity}
                    onChange={(e) =>
                      onUpdateGraphics({ mouseSensitivity: parseFloat(e.target.value) })
                    }
                    className="w-48 accent-amber-400"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Storm Rain Density</span>
                  <input
                    type="range"
                    min={0.25}
                    max={1.0}
                    step={0.05}
                    value={hud.graphics.rainDensity}
                    onChange={(e) =>
                      onUpdateGraphics({ rainDensity: parseFloat(e.target.value) })
                    }
                    className="w-48 accent-amber-400"
                  />
                </div>

                {[
                  {
                    label: 'Courtyard Shadows',
                    key: 'shadowsEnabled' as const,
                    checked: hud.graphics.shadowsEnabled,
                  },
                  {
                    label: 'Magical Particle Effects',
                    key: 'particlesEnabled' as const,
                    checked: hud.graphics.particlesEnabled,
                  },
                  {
                    label: 'Spell Bloom Post-Processing',
                    key: 'bloomEnabled' as const,
                    checked: hud.graphics.bloomEnabled,
                  },
                  {
                    label: 'Impact Camera Shake',
                    key: 'cameraShake' as const,
                    checked: hud.graphics.cameraShake,
                  },
                ].map((opt) => (
                  <div key={opt.key} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => onUpdateGraphics({ [opt.key]: e.target.checked })}
                      className="accent-amber-400 w-4 h-4 cursor-pointer"
                    />
                  </div>
                ))}

                <button
                  onClick={onToggleFullscreen}
                  className="mt-1 py-2.5 rounded border border-slate-700 bg-[#0e1624] hover:bg-[#172338] text-xs font-bold text-slate-100 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" /> TOGGLE FULLSCREEN MODE
                </button>
              </div>
            )}

            {/* TAB 3: EXTERNAL GLB & POST-MATCH VOICE IMPORT */}
            {settingsTab === 'ASSETS' && (
              <div className="flex flex-col gap-3 pt-1">
                <div className="bg-[#121622] border border-amber-700/50 rounded p-3 text-[11px] text-slate-300 leading-relaxed">
                  <div className="font-bold text-amber-300 uppercase tracking-wider mb-1">
                    Studio Voice Asset Notice
                  </div>
                  External studio voice recordings (`.mp3`/`.wav`/`.ogg`) for the 15 characters&apos; Victory &amp; Defeat lines are not bundled locally (`/public/voices/manifest.json` `victoryVoices` and `defeatVoices`). Browser SpeechSynthesis previews are only a fallback and are not studio voice acting. Place studio files in `/public/voices/` and reference them in `/public/voices/manifest.json`, or upload per-character Victory &amp; Defeat recordings below.
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-300">
                    Target Character (.GLB):
                  </label>
                  <select
                    value={assetTargetId}
                    onChange={(e) => setAssetTargetId(e.target.value)}
                    className="flex-1 bg-[#0e1624] border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    {CHARACTERS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (PWR {c.powerRating})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="px-3 py-2.5 rounded border border-slate-700 bg-[#0d1524] hover:bg-[#17233a] text-xs text-slate-200 flex items-center justify-center gap-2 cursor-pointer font-semibold">
                  <Upload className="w-4 h-4 text-sky-400" />
                  {hud.customGlbMap[assetTargetId]
                    ? `Custom GLB: ${hud.customGlbMap[assetTargetId]}`
                    : `Load Rigged .GLB / .GLTF for ${CHARACTER_MAP.get(assetTargetId)?.name}`}
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    className="hidden"
                    onChange={(e) => handleGlbUpload(assetTargetId, e)}
                  />
                </label>

                {importStatus && (
                  <div className="text-[11px] text-emerald-400 font-semibold">
                    {importStatus}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-800 pt-2.5 mt-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    15-Character Post-Match Voice Cast (Victory &amp; Defeat)
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {
                      Object.values(hud.voiceAssetMap).filter(
                        (s) => s?.victory && s?.defeat
                      ).length
                    }{' '}
                    / {CHARACTERS.length} Studio Pairs
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto pr-1 flex flex-col gap-2">
                  {CHARACTERS.map((c) => {
                    const status = hud.voiceAssetMap[c.id] ?? {
                      victory: false,
                      defeat: false,
                    };
                    return (
                      <div
                        key={c.id}
                        className="bg-[#0d1524] border border-slate-800 rounded p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-display font-bold text-white">
                                {c.name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                &middot; {c.voice.gender === 'female' ? 'Female' : 'Male'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {c.voice.personality}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                            Studio: {status.victory ? 'Win✓' : 'Win—'} / {status.defeat ? 'Loss✓' : 'Loss—'}
                          </span>
                        </div>

                        <div className="text-[11px] flex flex-col gap-1 border-t border-slate-800/70 pt-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-amber-200 truncate">
                              <strong className="text-amber-400">Victory:</strong> &ldquo;{c.voice.victoryLine}&rdquo;
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => onPreviewVoice(c.id, 'VICTORY')}
                                className="px-2 py-1 rounded border border-amber-600/70 bg-amber-950/40 hover:bg-amber-900/50 text-[10px] font-bold text-amber-200 cursor-pointer whitespace-nowrap"
                              >
                                Test Win
                              </button>
                              <label className="px-2 py-1 rounded border border-slate-700 bg-[#111b2e] hover:bg-[#192844] text-[10px] font-semibold text-slate-200 cursor-pointer whitespace-nowrap">
                                Upload
                                <input
                                  type="file"
                                  accept=".mp3,.wav,.ogg,audio/*"
                                  className="hidden"
                                  onChange={(e) => handleVoiceUpload(c.id, 'victory', e)}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-rose-200 truncate">
                              <strong className="text-rose-400">Defeat:</strong> &ldquo;{c.voice.defeatLine}&rdquo;
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => onPreviewVoice(c.id, 'DEFEAT')}
                                className="px-2 py-1 rounded border border-rose-700/70 bg-rose-950/40 hover:bg-rose-900/50 text-[10px] font-bold text-rose-200 cursor-pointer whitespace-nowrap"
                              >
                                Test Loss
                              </button>
                              <label className="px-2 py-1 rounded border border-slate-700 bg-[#111b2e] hover:bg-[#192844] text-[10px] font-semibold text-slate-200 cursor-pointer whitespace-nowrap">
                                Upload
                                <input
                                  type="file"
                                  accept=".mp3,.wav,.ogg,audio/*"
                                  className="hidden"
                                  onChange={(e) => handleVoiceUpload(c.id, 'defeat', e)}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* HOW TO PLAY & CONTROLS MODAL                              */}
      {/* ========================================================= */}
      {showControls && (
        <div className="absolute inset-0 pointer-events-auto bg-[#03060c]/92 flex items-center justify-center p-6 z-40">
          <div className="w-[620px] bg-[#0a101b] border border-slate-700 rounded-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-display text-lg font-bold text-white tracking-wider flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-sky-400" />
                HOW TO PLAY &amp; DESKTOP CONTROLS
              </h3>
              <button
                onClick={() => setShowControls(false)}
                className="text-xs uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0d1524] border border-slate-800 rounded p-3.5 flex flex-col gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Movement &amp; Defense
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Move Wizard</span>
                  <span className="font-bold text-white">Arrow Keys</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Sprint</span>
                  <span className="font-bold text-white">Hold Shift</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Tactical Dodge</span>
                  <span className="font-bold text-white">Spacebar</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Protego Shield</span>
                  <span className="font-bold text-sky-300">Hold Right Click</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Pause / Menu</span>
                  <span className="font-bold text-white">Esc</span>
                </div>
              </div>

              <div className="bg-[#0d1524] border border-slate-800 rounded p-3.5 flex flex-col gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  Wand Aim &amp; Spells
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Aim Wand</span>
                  <span className="font-bold text-white">Mouse Cursor</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Basic Attack (0 Energy)</span>
                  <span className="font-bold text-sky-300">Numpad 1</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Mid Attack (25 Energy)</span>
                  <span className="font-bold text-amber-300">Numpad 2</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Creature Ultimate (100)</span>
                  <span className="font-bold text-cyan-300">Numpad 3</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">Priori Incantatem Clash</span>
                  <span className="font-bold text-emerald-300">Mash Numpad / Click</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0d1524] border border-amber-500/30 rounded p-3.5 text-xs text-slate-300 leading-relaxed flex flex-col gap-1.5">
              <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                Combat Rules &amp; Courtyard Tips
              </div>
              <p>
                &bull; <strong className="text-white">Guaranteed Creature Ultimates:</strong> At 100 Magical Energy, pressing <strong className="text-cyan-300">Numpad 3</strong> summons your wizard&apos;s signature magical beast. It homes directly onto your target, bypasses dodges, and shatters Protego shields on impact.
              </p>
              <p>
                &bull; <strong className="text-white">Destructible Battlefield:</strong> Mid and Ultimate spells crack pillars, shatter stone statues, and topple courtyard walls into tumbling 3D debris.
              </p>
              <p>
                &bull; <strong className="text-white">Restoration Relics &amp; Numpad:</strong> Golden courtyard orbs restore +140 HP. Physical Numpad 1/2/3 keys work regardless of whether NumLock is ON or OFF.
              </p>
            </div>

            <button
              onClick={() => setShowControls(false)}
              className="py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold tracking-wider text-xs cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
