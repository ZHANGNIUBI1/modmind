import { AnnotationVisitor, ClassReader, ClassVisitor, Opcodes } from '@xmcl/asm'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface LegacyForgeAnnotation {
  modId: string
  name: string
  version: string
  dependencies: string
}

const annotationDescriptors = new Set([
  'Lcpw/mods/fml/common/Mod;',
  'Lnet/minecraftforge/fml/common/Mod;'
])
const annotationMarkers = [...annotationDescriptors].map((value) => Buffer.from(value))

class ModAnnotationVisitor extends AnnotationVisitor {
  private readonly values = new Map<string, string>()

  constructor(private readonly complete: (value: LegacyForgeAnnotation) => void) {
    super(Opcodes.ASM5)
  }

  override visit(name: string, value: unknown): void {
    if (typeof value === 'string') this.values.set(name, value)
  }

  override visitEnd(): void {
    this.complete({
      modId: (this.values.get('modid') ?? this.values.get('value') ?? '').trim(),
      name: (this.values.get('name') ?? '').trim(),
      version: (this.values.get('version') ?? '').trim(),
      dependencies: (this.values.get('dependencies') ?? '').trim()
    })
  }
}

class ModClassVisitor extends ClassVisitor {
  constructor(private readonly complete: (value: LegacyForgeAnnotation) => void) {
    super(Opcodes.ASM5)
  }

  override visitAnnotation(descriptor: string | null): AnnotationVisitor | null {
    return descriptor && annotationDescriptors.has(descriptor) ? new ModAnnotationVisitor(this.complete) : null
  }
}

function inspectClass(buffer: Buffer): LegacyForgeAnnotation[] {
  if (!annotationMarkers.some((marker) => buffer.includes(marker))) return []
  const declarations: LegacyForgeAnnotation[] = []
  new ClassReader(buffer).accept(
    new ModClassVisitor((value) => declarations.push(value)),
    [],
    ClassReader.SKIP_CODE | ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES
  )
  return declarations
}

export async function inspectLegacyForgeAnnotations(root: string, files: string[]): Promise<LegacyForgeAnnotation[]> {
  const declarations: LegacyForgeAnnotation[] = []
  for (const relative of files) {
    if (!relative.endsWith('.class') || relative.startsWith('META-INF/versions/')) continue
    const target = path.join(root, ...relative.split('/'))
    try {
      const stat = await fs.stat(target)
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) continue
      declarations.push(...inspectClass(await fs.readFile(target)))
    } catch {
      // One malformed or unsupported class must not hide valid mod declarations in other classes.
    }
  }
  return declarations
}
