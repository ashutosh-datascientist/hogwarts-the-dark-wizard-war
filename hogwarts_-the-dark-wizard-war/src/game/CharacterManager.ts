import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTERS, CHARACTER_MAP } from './data/characters';
import { CharacterDefinition } from './types';

export interface ImportedCharacterAsset {
  gltf: GLTF;
  fileName: string;
}

export class CharacterManager {
  private gltfLoader = new GLTFLoader();
  private importedModels = new Map<string, ImportedCharacterAsset>();

  public getAllCharacters(): CharacterDefinition[] {
    return CHARACTERS;
  }

  public getCharacter(id: string): CharacterDefinition {
    return CHARACTER_MAP.get(id) ?? CHARACTERS[5];
  }

  public async importCharacterGlb(
    characterId: string,
    file: File
  ): Promise<ImportedCharacterAsset> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        this.gltfLoader.load(objectUrl, resolve, undefined, reject);
      });
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      const asset: ImportedCharacterAsset = { gltf, fileName: file.name };
      this.importedModels.set(characterId, asset);
      return asset;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  public getImportedModel(characterId: string): ImportedCharacterAsset | undefined {
    return this.importedModels.get(characterId);
  }

  public clearImportedModel(characterId: string): void {
    this.importedModels.delete(characterId);
  }

  public getCustomGlbMap(): Record<string, string> {
    const out: Record<string, string> = {};
    this.importedModels.forEach((v, k) => {
      out[k] = v.fileName;
    });
    return out;
  }

  public static getDamageMultiplier(powerRating: number): number {
    return 0.78 + (powerRating / 100) * 0.34;
  }

  public static getDefenseReduction(powerRating: number): number {
    return (powerRating / 100) * 0.16;
  }

  public static getEnergyRegenRate(powerRating: number): number {
    return 5.8 + (powerRating / 100) * 3.2;
  }
}
