import { rm } from 'node:fs/promises'
import path from 'node:path'

// electron-vite can leave hashed renderer chunks behind when a dev watcher is open.
// Remove only generated output before production builds so stale chunks never ship.
await rm(path.resolve('out'), { recursive: true, force: true })
