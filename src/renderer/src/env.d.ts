/// <reference types="vite/client" />

import type { ModMindApi } from '../../shared/types'

declare global {
  interface Window {
    modmind: ModMindApi
  }
}

export {}
