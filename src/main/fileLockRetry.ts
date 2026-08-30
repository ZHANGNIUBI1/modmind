import path from 'node:path'

const TRANSIENT_FILE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String((error as NodeJS.ErrnoException).code ?? '') : ''
}

export function isTransientFileLockError(error: unknown): boolean {
  return TRANSIENT_FILE_CODES.has(errorCode(error))
}

export function isMissingFileError(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

export async function retryTransientFileLock<T>(operation: () => Promise<T>, delays = [100, 200, 400, 800, 1_000, 1_000, 1_000]): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransientFileLockError(error) || attempt >= delays.length) throw error
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }
  }
}

export function lockedFileReadError(filePath: string, cause: unknown): Error {
  return new Error(`无法读取文件“${path.basename(filePath)}”：文件持续被其他程序占用。请关闭 Minecraft、启动器或压缩软件；若项目位于网盘同步目录，请暂停同步后重试`, { cause })
}
