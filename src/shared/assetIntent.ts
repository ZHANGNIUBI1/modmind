import type {
  BlockbenchAction,
  BlockbenchActionBatchResult,
  BlockbenchCaptureFrame,
  BlockbenchFormat,
  BlockbenchProjectState,
  BlockbenchValidationResult,
  BlockbenchVector3
} from './blockbench'

export const ASSET_INTENT_VERSION = 1 as const

export const ASSET_INTENT_FORMATS = ['java_block', 'modded_entity', 'bedrock_block', 'bedrock', 'free'] as const
export type AssetIntentFormat = (typeof ASSET_INTENT_FORMATS)[number]

export const ASSET_INTENT_PALETTES = ['natural', 'ember', 'ocean', 'noir', 'metal', 'gold'] as const
export type AssetIntentPalette = (typeof ASSET_INTENT_PALETTES)[number]

export const ASSET_INTENT_TEXTURES = ['quiet', 'mottle', 'grain', 'brushed', 'weathered'] as const
export type AssetIntentTexture = (typeof ASSET_INTENT_TEXTURES)[number]

export const ASSET_INTENT_DOMAINS = ['organism', 'item', 'block', 'mechanism'] as const
export type AssetIntentDomain = (typeof ASSET_INTENT_DOMAINS)[number]

export const ASSET_INTENT_PART_KINDS = ['body', 'head', 'limb', 'tail', 'wing', 'fin', 'detail'] as const
export type AssetIntentPartKind = (typeof ASSET_INTENT_PART_KINDS)[number]

export type AssetIntentSide = 'center' | 'left' | 'right'
export type AssetIntentQuality = 'essential' | 'hero'
export type AssetIntentAnimationChannel = 'rotation' | 'position' | 'scale'

export interface AssetIntentPart {
  id: string
  kind: AssetIntentPartKind
  parent?: string
  side?: AssetIntentSide
  size: BlockbenchVector3
  offset?: BlockbenchVector3
  rotation?: BlockbenchVector3
  inflate?: number
}

export interface AssetIntentAnimationKeyframe {
  time: number
  value: BlockbenchVector3
  interpolation?: 'linear' | 'catmullrom' | 'step' | 'bezier'
}

export interface AssetIntentAnimationTrack {
  part: string
  channel: AssetIntentAnimationChannel
  keyframes: AssetIntentAnimationKeyframe[]
}

export interface AssetIntentProgram {
  version: typeof ASSET_INTENT_VERSION
  metadata: {
    name: string
    quality?: AssetIntentQuality
    domain?: AssetIntentDomain
  }
  model: {
    format: AssetIntentFormat
    textureWidth?: number
    textureHeight?: number
    symmetry?: 'bilateral' | 'asymmetric'
    parts: AssetIntentPart[]
  }
  appearance?: {
    palette?: AssetIntentPalette
    texture?: AssetIntentTexture
    seed?: string
  }
  animation?: {
    name: string
    length: number
    loop?: 'once' | 'loop' | 'hold'
    tracks: AssetIntentAnimationTrack[]
  }
}

export interface AssetIntentDiagnostic {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export interface AssetIntentCandidate {
  candidateVersion: 1
  intentVersion: typeof ASSET_INTENT_VERSION
  intentHash: string
  summary: {
    name: string
    format: BlockbenchFormat
    quality: AssetIntentQuality
    domain: AssetIntentDomain
    parts: number
    mirroredParts: number
    textures: number
    animations: number
  }
  actions: BlockbenchAction[]
  diagnostics: AssetIntentDiagnostic[]
}

export interface AssetIntentPreview extends AssetIntentCandidate {
  execution: BlockbenchActionBatchResult
  validation: BlockbenchValidationResult
  revision: string
  captures: BlockbenchCaptureFrame[]
}

export interface AssetRefinementPart {
  id: string
  size?: BlockbenchVector3
  offset?: BlockbenchVector3
  rotation?: BlockbenchVector3
  inflate?: number
}

export interface AssetRefinementProgram {
  version: typeof ASSET_INTENT_VERSION
  metadata: {
    name: string
    sourceIntentHash?: string
  }
  parts: AssetRefinementPart[]
  animation?: AssetIntentProgram['animation']
}

export interface AssetRefinementCandidate {
  candidateVersion: 1
  intentVersion: typeof ASSET_INTENT_VERSION
  intentHash: string
  baseRevision: string
  summary: {
    name: string
    format: string
    parts: number
    animations: number
  }
  actions: BlockbenchAction[]
  diagnostics: AssetIntentDiagnostic[]
  sourceMetadata?: BlockbenchProjectState['metadata']
}

export interface AssetRefinementPreview extends AssetRefinementCandidate {
  execution: BlockbenchActionBatchResult
  validation: BlockbenchValidationResult
  revision: string
  captures: BlockbenchCaptureFrame[]
  baselineCaptures?: BlockbenchCaptureFrame[]
  diff?: import('./blockbench').BlockbenchProjectDiff
}
