export type GamePhase =
  | 'MAIN_MENU'
  | 'SELECT_MODE'
  | 'SELECT_TEAM'
  | 'SELECT_OPPONENTS'
  | 'INTRO'
  | 'PLAYING'
  | 'PAUSED'
  | 'VICTORY'
  | 'DEFEAT'
  | 'EXITED';

export type BattleMode = 'DUEL_1V1' | 'TEAM_2V2' | 'TEAM_3V3' | 'FACTION_WAR';

export type SpellTier = 'BASIC' | 'MID' | 'ULTIMATE';

export type Faction = 'DUMBLEDORES_ARMY' | 'DARK_ARTS';

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export type CreatureType =
  | 'phoenix_eternal_fire'
  | 'ancient_cat'
  | 'blue_stag'
  | 'arcane_silver_owl'
  | 'spectral_black_hound'
  | 'moonlit_wolf'
  | 'crimson_fire_horse'
  | 'ancient_thorn_guardian'
  | 'flaming_jack_russell'
  | 'house_elf_cosmic_guardian'
  | 'giant_black_serpent'
  | 'shadow_serpent'
  | 'infernal_raven_swarm'
  | 'dark_mark_serpent'
  | 'ice_wraith_dragon';

export type AIPersonality =
  | 'STRATEGIC_DEFENSIVE'
  | 'AGGRESSIVE_BOSS'
  | 'CALCULATED_TACTICAL'
  | 'CHAOTIC_AGGRESSIVE'
  | 'COURAGEOUS_OFFENSIVE'
  | 'SUPPORT_GUARDIAN';

export interface GraphicsSettings {
  quality: GraphicsQuality;
  rainDensity: number;
  particlesEnabled: boolean;
  bloomEnabled: boolean;
  shadowsEnabled: boolean;
  cameraShake: boolean;
  resolutionScale: number; // 0.75 | 1.0 | 1.25
  mouseSensitivity: number; // 0.4..1.8
}

export interface AudioMixerSettings {
  masterMuted: boolean;
  masterVolume: number;        // 0..1
  voicesEnabled: boolean;      // Post-match Victory/Defeat voice toggle
  voicesVolume: number;        // 0..1 (Post-match Character Voices)
  ttsFallbackEnabled: boolean; // Explicit Browser TTS Preview when studio .mp3/.wav missing
  attacksVolume: number;       // 0..1 (Magical Sound Effects)
  creaturesVolume: number;     // 0..1 (Creature Sounds)
  shieldsVolume: number;       // 0..1 (Magical Shield SFX)
  musicVolume: number;         // 0..1 (Background Music)
  weatherVolume: number;       // 0..1 (Rain & Thunder)
}

export interface CharacterAudioProfile {
  sonicIdentity: string;
  creatureSoundStyle:
    | 'phoenix'
    | 'giant_serpent'
    | 'shadow_serpent'
    | 'cat_snarl'
    | 'raven_shriek'
    | 'stag_cry'
    | 'owl_screech'
    | 'hound_growl'
    | 'dark_serpent'
    | 'wolf_howl'
    | 'dragon_roar'
    | 'fire_horse'
    | 'thorn_groan'
    | 'terrier_bark'
    | 'elf_chime';
  baseFreq: number;
  harmonicRatio: number;
  waveform: OscillatorType;
  subBassFreq: number;
  distortion: number;
  crackleIntensity: number;
  celestialShimmer: number;
  whooshCutoff: number;
}

export interface SpellDefinition {
  tier: SpellTier;
  name: string;
  incantation: string;
  damageMin: number;
  damageMax: number;
  cooldown: number;
  energyCost: number;
  speed: number;
  radius: number;
  primaryColor: string;
  secondaryColor: string;
  smokeColor: string;
  vfxStyle:
    | 'bolt'
    | 'dark_curse'
    | 'phoenix_fire'
    | 'patronus'
    | 'transfigure'
    | 'shadow_wave'
    | 'time_surge'
    | 'fiendfyre'
    | 'elf_shockwave';
  description: string;
}

export interface CharacterAppearance {
  skinTone: string;
  robePrimary: string;
  robeSecondary: string;
  trimColor: string;
  hairColor: string;
  hairStyle:
    | 'long_beard'
    | 'bald_serpent'
    | 'witch_hat_bun'
    | 'greasy_curtain'
    | 'wild_curls'
    | 'messy_short'
    | 'bushy_waves'
    | 'shaggy_shoulder'
    | 'sleek_platinum'
    | 'swept_brown'
    | 'slicked_blonde'
    | 'long_ginger'
    | 'short_brown'
    | 'messy_ginger'
    | 'house_elf';
  eyeColor: string;
  hasGlasses?: 'round' | 'half_moon';
  hasBeard?: 'long_silver' | 'trimmed_dark' | 'stubble';
  heightScale: number;
  buildScale: number;
  wandWoodColor: string;
  wandTipColor: string;
}

export type VoiceDeliveryStyle =
  | 'commanding'
  | 'sinister_whisper'
  | 'unhinged'
  | 'courageous_tense'
  | 'nervous_brave'
  | 'cold_restrained'
  | 'poised_authority'
  | 'articulate_intense'
  | 'defiant'
  | 'gentle_powerful'
  | 'aristocratic'
  | 'anxious_proud'
  | 'fierce'
  | 'timid_heroic'
  | 'earnest_elf';

export interface CharacterVoiceProfile {
  gender: 'male' | 'female';
  pitch: number;
  rate: number;
  personality: string;
  emotion: string;
  victoryEmotion: string;
  defeatEmotion: string;
  deliveryStyle: VoiceDeliveryStyle;
  breathingCue: boolean;
  breathIntensity: number;
  presenceEqHz: number;
  presenceGainDb: number;
  reverbWet: number;
  victoryLine: string;
  defeatLine: string;
  teamVictoryLine: string;
  teamDefeatLine: string;
  voiceDirectionNote: string;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  title: string;
  powerRating: number;
  attackRating: number;
  defenseRating: number;
  maxHp: number;
  faction: Faction;
  aiPersonality: AIPersonality;
  ultimateCreature: CreatureType;
  wandName: string;
  appearance: CharacterAppearance;
  audioProfile: CharacterAudioProfile;
  voice: CharacterVoiceProfile;
  spells: {
    basic: SpellDefinition;
    mid: SpellDefinition;
    ultimate: SpellDefinition;
  };
}

export interface FighterHudState {
  id: string;
  name: string;
  title: string;
  faction: Faction;
  powerRating: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  alive: boolean;
  isPlayerControlled: boolean;
  shieldActive: boolean;
  shieldIntegrity: number;
  cooldowns: {
    basic: number;
    basicMax: number;
    mid: number;
    midMax: number;
    ultimate: number;
    ultimateMax: number;
    dodge: number;
    dodgeMax: number;
  };
  spells: {
    basicName: string;
    midName: string;
    ultimateName: string;
  };
}

export interface ClashHudState {
  active: boolean;
  balance: number;
  playerSpellName: string;
  opponentSpellName: string;
  timeRemaining: number;
}

export interface SubtitleState {
  speaker: string;
  text: string;
  color: string;
  outcome?: 'VICTORY' | 'DEFEAT';
  expiresAt: number;
}

export interface BattleHudSnapshot {
  phase: GamePhase;
  battleMode: BattleMode;
  factionWarSize: 1 | 2 | 3;
  playerFaction: Faction;
  elapsedSeconds: number;
  selectedAllies: string[];
  selectedOpponents: string[];
  previewCharacterId: string;
  introStep: number;
  player: FighterHudState;
  allies: FighterHudState[];
  enemies: FighterHudState[];
  clash: ClashHudState;
  subtitle: SubtitleState | null;
  audioMixer: AudioMixerSettings;
  graphics: GraphicsSettings;
  healthOrbActive: boolean;
  destructiblesIntact: number;
  destructiblesTotal: number;
  activeCreatures: string[];
  winningFaction: Faction | null;
  customGlbMap: Record<string, string>;
  voiceAssetMap: Record<string, { victory: boolean; defeat: boolean }>;
}

export type CharacterAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'cast_basic'
  | 'cast_mid'
  | 'cast_ultimate'
  | 'clash'
  | 'shield'
  | 'dodge'
  | 'hit'
  | 'victory'
  | 'defeat';
