import path from 'node:path'

export function isSameOrNestedPath(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export function assertSeparateMigrationTrees(source: string, destination: string): void {
  if (isSameOrNestedPath(source, destination) || isSameOrNestedPath(destination, source)) {
    throw new Error('迁移源目录与目标目录不能相同或互相嵌套')
  }
}
