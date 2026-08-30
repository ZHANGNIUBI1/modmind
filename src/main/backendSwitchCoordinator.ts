export interface BackendSwitchTicket {
  projectKey: string
  sequence: number
}

export interface BackendSwitchTransition<T, M> {
  projectKey: string
  sequence: number
  rollbackValue: T
  target: M
  ready: boolean
}

export class BackendSwitchCoordinator<T, M> {
  private readonly requestSequences = new Map<string, number>()
  private readonly transitions = new Map<string, BackendSwitchTransition<T, M>>()

  request(projectKey: string): BackendSwitchTicket {
    const sequence = (this.requestSequences.get(projectKey) ?? 0) + 1
    this.requestSequences.set(projectKey, sequence)
    return { projectKey, sequence }
  }

  accept(ticket: BackendSwitchTicket, currentValue: T, target: M): BackendSwitchTransition<T, M> | null {
    const active = this.transitions.get(ticket.projectKey)
    if (active && active.sequence > ticket.sequence) return null
    const transition: BackendSwitchTransition<T, M> = {
      ...ticket,
      rollbackValue: active && !active.ready ? active.rollbackValue : currentValue,
      target,
      ready: false
    }
    this.transitions.set(ticket.projectKey, transition)
    return transition
  }

  current(projectKey: string): BackendSwitchTransition<T, M> | undefined {
    return this.transitions.get(projectKey)
  }

  isCurrent(transition: BackendSwitchTransition<T, M>): boolean {
    return this.transitions.get(transition.projectKey) === transition
  }

  markReady(transition: BackendSwitchTransition<T, M>): boolean {
    transition.ready = true
    return this.isCurrent(transition)
  }
}
