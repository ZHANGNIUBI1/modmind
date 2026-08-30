/** Tracks the first asynchronous initialization so early consumers can wait for real state. */
export class InitialReadiness<T> {
  private initial: Promise<T> | null = null

  run(operation: () => Promise<T>): Promise<T> {
    if (this.initial) return operation()
    const tracked = operation().catch((error: unknown) => {
      if (this.initial === tracked) this.initial = null
      throw error
    })
    this.initial = tracked
    return tracked
  }

  wait(start: () => Promise<T>): Promise<T> {
    return this.initial ?? this.run(start)
  }

  reset(): void {
    this.initial = null
  }
}
