export const BLOCKBENCH_FORMATS = [
  'java_block',
  'modded_entity',
  'bedrock_block',
  'bedrock',
  'skin',
  'free'
] as const

export type BlockbenchFormat = (typeof BLOCKBENCH_FORMATS)[number]

export interface BlockbenchBounds {
  x: number
  y: number
  width: number
  height: number
}

export type BlockbenchBridgePhase = 'idle' | 'loading' | 'ready' | 'error' | 'destroyed'

export interface BlockbenchBridgeStatus {
  phase: BlockbenchBridgePhase
  visible: boolean
  version?: string
  message?: string
  updatedAt: string
}

export type BlockbenchVector3 = [number, number, number]
export type BlockbenchFace = 'north' | 'east' | 'south' | 'west' | 'up' | 'down'
export type BlockbenchCommand =
  | 'undo'
  | 'redo'
  | 'frame-all'
  | 'toggle-grid'
  | 'toggle-animate'
  | 'mode-edit'
  | 'mode-paint'
  | 'mode-animate'
  | 'open-project'
  | 'save-project-dialog'

export type BlockbenchAction =
  | {
      type: 'new-model'
      format: BlockbenchFormat
      name: string
      textureWidth?: number
      textureHeight?: number
    }
  | {
      type: 'add-cube'
      name: string
      from: BlockbenchVector3
      to: BlockbenchVector3
      origin?: BlockbenchVector3
      rotation?: BlockbenchVector3
      inflate?: number
      textureUuid?: string
      textureName?: string
      parentGroupUuid?: string
      parentGroupName?: string
    }
  | {
      type: 'add-group'
      name: string
      origin?: BlockbenchVector3
      rotation?: BlockbenchVector3
      parentGroupUuid?: string
      parentGroupName?: string
    }
  | {
      type: 'add-animation'
      name: string
      length: number
      loop?: 'once' | 'loop' | 'hold'
      snapping?: number
    }
  | {
      type: 'add-keyframe'
      animationUuid?: string
      animationName?: string
      groupUuid?: string
      groupName?: string
      channel: 'rotation' | 'position' | 'scale'
      time: number
      value: BlockbenchVector3
      interpolation?: 'linear' | 'catmullrom' | 'step' | 'bezier'
    }
  | {
      type: 'create-texture'
      name: string
      width: number
      height: number
      dataUrl?: string
      fill?: string
      rectangles?: Array<{ x: number; y: number; width: number; height: number; color: string }>
    }
  | {
      type: 'set-cube-texture'
      cubeUuid?: string
      textureUuid?: string
      cubeName?: string
      textureName?: string
      faces?: BlockbenchFace[]
    }
  | {
      type: 'save-project'
      relativePath: string
    }
  | {
      type: 'export-model'
      relativePath: string
    }
  | {
      type: 'save-texture'
      relativePath: string
      textureUuid?: string
      textureName?: string
    }
  | {
      type: 'run-command'
      command: BlockbenchCommand
    }

export interface BlockbenchActionResult {
  action: BlockbenchAction['type']
  success: true
  message: string
  data?: Record<string, string | number | boolean>
}

/** OpenAI-compatible tool declaration for the coding agent's tool registry. */
export const BLOCKBENCH_AI_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'blockbench_operate',
    description:
      'Operate the embedded Blockbench editor with a validated high-level action. Use this for Minecraft models and textures; never generate JavaScript.',
    parameters: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'format', 'name'],
          properties: {
            type: { const: 'new-model' },
            format: { enum: BLOCKBENCH_FORMATS },
            name: { type: 'string', minLength: 1, maxLength: 64 },
            textureWidth: { type: 'integer', minimum: 1, maximum: 1024 },
            textureHeight: { type: 'integer', minimum: 1, maximum: 1024 }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'name', 'from', 'to'],
          properties: {
            type: { const: 'add-cube' },
            name: { type: 'string', minLength: 1, maxLength: 64 },
            from: { $ref: '#/$defs/vector3' },
            to: { $ref: '#/$defs/vector3' },
            origin: { $ref: '#/$defs/vector3' },
            rotation: { $ref: '#/$defs/rotation' },
            inflate: { type: 'number', minimum: -64, maximum: 64 },
            textureUuid: { type: 'string', minLength: 1, maxLength: 64 },
            textureName: { type: 'string', minLength: 1, maxLength: 64 },
            parentGroupUuid: { type: 'string', minLength: 1, maxLength: 64 },
            parentGroupName: { type: 'string', minLength: 1, maxLength: 64 }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'name'],
          properties: {
            type: { const: 'add-group' },
            name: { type: 'string', minLength: 1, maxLength: 64 },
            origin: { $ref: '#/$defs/vector3' },
            rotation: { $ref: '#/$defs/rotation' },
            parentGroupUuid: { type: 'string', minLength: 1, maxLength: 64 },
            parentGroupName: { type: 'string', minLength: 1, maxLength: 64 }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'name', 'length'],
          properties: {
            type: { const: 'add-animation' },
            name: { type: 'string', minLength: 1, maxLength: 64 },
            length: { type: 'number', exclusiveMinimum: 0, maximum: 3600 },
            loop: { enum: ['once', 'loop', 'hold'] },
            snapping: { type: 'integer', minimum: 1, maximum: 120 }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'channel', 'time', 'value'],
          anyOf: [
            { required: ['animationUuid', 'groupUuid'] },
            { required: ['animationName', 'groupName'] }
          ],
          properties: {
            type: { const: 'add-keyframe' },
            animationUuid: { type: 'string', minLength: 1, maxLength: 64 },
            animationName: { type: 'string', minLength: 1, maxLength: 64 },
            groupUuid: { type: 'string', minLength: 1, maxLength: 64 },
            groupName: { type: 'string', minLength: 1, maxLength: 64 },
            channel: { enum: ['rotation', 'position', 'scale'] },
            time: { type: 'number', minimum: 0, maximum: 3600 },
            value: { $ref: '#/$defs/vector3' },
            interpolation: { enum: ['linear', 'catmullrom', 'step', 'bezier'] }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'name', 'width', 'height'],
          properties: {
            type: { const: 'create-texture' },
            name: { type: 'string', minLength: 1, maxLength: 64 },
            width: { type: 'integer', minimum: 1, maximum: 1024 },
            height: { type: 'integer', minimum: 1, maximum: 1024 },
            dataUrl: { type: 'string', description: 'A PNG data URL, at most 8 MiB.' },
            fill: { type: 'string', pattern: '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$' },
            rectangles: {
              type: 'array',
              maxItems: 256,
              description:
                'Ordered hard-edge pixel-art strokes drawn after fill. Use layered clusters, narrow runs, and 1x1 accents to create silhouettes, facets, shadows, and highlights; a flat fill alone is not a finished texture.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y', 'width', 'height', 'color'],
                properties: {
                  x: { type: 'integer', minimum: 0, maximum: 1023 },
                  y: { type: 'integer', minimum: 0, maximum: 1023 },
                  width: { type: 'integer', minimum: 1, maximum: 1024 },
                  height: { type: 'integer', minimum: 1, maximum: 1024 },
                  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$' }
                }
              }
            }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type'],
          anyOf: [
            { required: ['cubeUuid', 'textureUuid'] },
            { required: ['cubeName', 'textureName'] }
          ],
          properties: {
            type: { const: 'set-cube-texture' },
            cubeUuid: { type: 'string', minLength: 1, maxLength: 64 },
            textureUuid: { type: 'string', minLength: 1, maxLength: 64 },
            cubeName: { type: 'string', minLength: 1, maxLength: 64 },
            textureName: { type: 'string', minLength: 1, maxLength: 64 },
            faces: {
              type: 'array',
              uniqueItems: true,
              items: { enum: ['north', 'east', 'south', 'west', 'up', 'down'] }
            }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'relativePath'],
          properties: {
            type: { const: 'save-project' },
            relativePath: {
              type: 'string',
              minLength: 1,
              maxLength: 240,
              description: 'Project-relative path ending in .bbmodel.'
            }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'relativePath'],
          properties: {
            type: { const: 'export-model' },
            relativePath: {
              type: 'string',
              minLength: 1,
              maxLength: 240,
              description: 'Project-relative export path ending in .json, .geo.json, or .java.'
            }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'relativePath'],
          anyOf: [{ required: ['textureUuid'] }, { required: ['textureName'] }],
          properties: {
            type: { const: 'save-texture' },
            relativePath: {
              type: 'string',
              minLength: 1,
              maxLength: 240,
              description: 'Project-relative path ending in .png.'
            },
            textureUuid: { type: 'string', minLength: 1, maxLength: 64 },
            textureName: { type: 'string', minLength: 1, maxLength: 64 }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'command'],
          properties: {
            type: { const: 'run-command' },
            command: {
              enum: [
                'undo',
                'redo',
                'frame-all',
                'toggle-grid',
                'toggle-animate',
                'mode-edit',
                'mode-paint',
                'mode-animate',
                'open-project',
                'save-project-dialog'
              ]
            }
          }
        }
      ],
      $defs: {
        vector3: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number', minimum: -1024, maximum: 1024 }
        },
        rotation: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number', minimum: -360, maximum: 360 }
        }
      }
    }
  }
} as const
