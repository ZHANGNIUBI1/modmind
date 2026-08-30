import type {
  BlockbenchAction,
  BlockbenchActionBatchResult,
  BlockbenchCaptureFrame,
  BlockbenchFormat,
  BlockbenchValidationResult,
  BlockbenchVector2,
  BlockbenchVector3
} from './blockbench'

export const ADVANCED_ASSET_VERSION = 1 as const

interface AdvancedPrimitiveBase {
  id: string
  center?: BlockbenchVector3
  rotation?: BlockbenchVector3
  parent?: string
  shading?: 'flat' | 'smooth'
}

export type AdvancedAssetPrimitive =
  | (AdvancedPrimitiveBase & {type: 'cube'; size: BlockbenchVector3; inflate?: number})
  | (AdvancedPrimitiveBase & {type: 'wedge'; size: BlockbenchVector3})
  | (AdvancedPrimitiveBase & {type: 'cylinder'; radius: number; height: number; segments?: number})
  | (AdvancedPrimitiveBase & {type: 'sphere'; radius: number; segments?: number; rings?: number})
  | (AdvancedPrimitiveBase & {type: 'extrude'; profile: BlockbenchVector2[]; depth: number})
  | (AdvancedPrimitiveBase & {
      type: 'tube'
      path: BlockbenchVector3[]
      radius: number
      radialSegments?: number
      curveSegments?: number
      closed?: boolean
    })

export interface AdvancedAssetTexture {
  name?: string
  width?: number
  height?: number
  fill?: string
  rectangles?: Array<{x: number; y: number; width: number; height: number; color: string}>
  strokes?: Array<{points: BlockbenchVector2[]; color: string; size?: number}>
}

export interface AdvancedAssetBone {
  id: string
  parent?: string
  origin?: BlockbenchVector3
  rotation?: BlockbenchVector3
}

export interface AdvancedAssetWeightRule {
  mesh: string
  lowerBone: string
  upperBone: string
  axis?: 0 | 1 | 2
  split?: number
  blend?: number
}

export interface AdvancedAssetRig {
  name: string
  bones: AdvancedAssetBone[]
  weights?: Record<string, Record<string, Array<{bone: string; weight: number}>>>
  weightRules?: AdvancedAssetWeightRule[]
  locators?: Array<{id: string; position: BlockbenchVector3; parent?: string}>
  ik?: Array<{
    id: string
    position: BlockbenchVector3
    target: string
    source: string
    lockRotation?: boolean
  }>
}

export interface AdvancedAssetAnimation {
  name: string
  length: number
  loop?: 'once' | 'loop' | 'hold'
  snapping?: number
  tracks: Array<{
    target: string
    channel: 'rotation' | 'position' | 'scale'
    keyframes: Array<{
      time: number
      value: BlockbenchVector3
      interpolation?: 'linear' | 'catmullrom' | 'step' | 'bezier'
    }>
  }>
}

export interface AdvancedAssetVariant {
  id: string
  label?: string
  scale?: number
  accent?: string
  primitiveOverrides?: Record<string, {
    center?: BlockbenchVector3
    rotation?: BlockbenchVector3
    size?: BlockbenchVector3
    radius?: number
    height?: number
    depth?: number
  }>
}

export interface AdvancedAssetProgram {
  version: typeof ADVANCED_ASSET_VERSION
  metadata: {
    name: string
    quality?: 'draft' | 'production' | 'hero'
    symmetry?: 'bilateral' | 'asymmetric'
  }
  model: {
    format?: BlockbenchFormat
    textureWidth?: number
    textureHeight?: number
    primitives: AdvancedAssetPrimitive[]
  }
  texture?: AdvancedAssetTexture
  rig?: AdvancedAssetRig
  animations?: AdvancedAssetAnimation[]
  variants?: AdvancedAssetVariant[]
}

export interface ReferenceImageAssetProgram {
  version: typeof ADVANCED_ASSET_VERSION
  metadata: {name: string; quality?: 'draft' | 'production' | 'hero'}
  image: {
    dataUrl: string
    depth?: number
    alphaThreshold?: number
    simplify?: number
    maxProfilePoints?: number
  }
  model?: {
    format?: BlockbenchFormat
    textureWidth?: number
    textureHeight?: number
  }
  rig?: AdvancedAssetRig
  animations?: AdvancedAssetAnimation[]
}

export interface AssetVisualFinding {
  severity: 'error' | 'warning' | 'info'
  checkId: string
  message: string
  view?: string
  metric?: number
}

export interface AssetVisualReview {
  score: number
  metrics: {
    occupancy: number
    contrast: number
    edgeDensity: number
    symmetry: number
    clippingRisk: number
    viewConsistency: number
  }
  findings: AssetVisualFinding[]
}

export interface AdvancedAssetCandidate {
  candidateVersion: 1
  programHash: string
  variantId: string
  label: string
  program: AdvancedAssetProgram
  actions: BlockbenchAction[]
  diagnostics: Array<{severity: 'error' | 'warning'; path: string; message: string}>
  summary: {
    name: string
    format: BlockbenchFormat
    primitives: number
    meshes: number
    cubes: number
    vertices: number
    faces: number
    bones: number
    animations: number
  }
}

export interface AdvancedAssetCandidatePreview extends AdvancedAssetCandidate {
  execution: BlockbenchActionBatchResult
  validation: BlockbenchValidationResult
  revision: string
  captures: BlockbenchCaptureFrame[]
  review: AssetVisualReview
  iteration: number
  actionDiff: Array<{type: string; target: string; detail: string}>
}

export interface AdvancedAssetComparison {
  comparisonVersion: 1
  selectedCandidateId: string
  candidates: AdvancedAssetCandidatePreview[]
}

export interface AdvancedAssetPreviewOptions {
  maxIterations?: 1 | 2 | 3
  targetScore?: number
}

export interface ReferenceImageAnalysis {
  width: number
  height: number
  alphaBounds: {left: number; top: number; right: number; bottom: number}
  dominantColors: string[]
  profilePoints: BlockbenchVector2[]
  symmetry: number
}

export interface ReferenceImageAssetCandidate extends AdvancedAssetCandidate {
  reference: ReferenceImageAnalysis
}
