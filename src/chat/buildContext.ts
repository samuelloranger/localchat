import type { Message } from '@/src/domain/types'
import {
  CONTEXT_SAFETY_MARGIN,
  N_CTX,
  N_PREDICT,
} from '@/src/services/inferenceConstants'

export const CONTEXT_TOKEN_BUDGET = N_CTX - N_PREDICT - CONTEXT_SAFETY_MARGIN

export function buildContext(messages: Message[]): { role: Message['role']; content: string }[] {
  const complete = messages.filter((m) => m.status === 'complete' || m.role === 'user')
  const selected: Message[] = []
  let budget = CONTEXT_TOKEN_BUDGET
  for (let i = complete.length - 1; i >= 0; i--) {
    const m = complete[i]
    const cost = Math.ceil(m.content.length / 4)
    if (selected.length && budget - cost < 0) break
    selected.unshift(m)
    budget -= cost
  }
  return selected.map((m) => ({ role: m.role, content: m.content }))
}
