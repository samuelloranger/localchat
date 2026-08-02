import { initLlama, type LlamaContext } from 'llama.rn'

import type { MessageRole } from '@/src/domain/types'
import {
  CONTEXT_SAFETY_MARGIN,
  N_CTX,
  N_PREDICT,
} from '@/src/services/inferenceConstants'

export { CONTEXT_SAFETY_MARGIN, N_CTX, N_PREDICT }

let ctx: LlamaContext | null = null
let path: string | null = null

function toFileUri(localPath: string): string {
  return localPath.startsWith('file://') ? localPath : `file://${localPath}`
}

export function isLoaded(): boolean {
  return ctx !== null
}

export function loadedPath(): string | null {
  return path
}

export async function loadModel(
  localPath: string,
  onProgress?: (n: number) => void,
): Promise<void> {
  if (path === localPath && ctx) return
  await unloadModel()

  const baseOptions = {
    model: toFileUri(localPath),
    n_ctx: N_CTX,
    n_gpu_layers: 99,
    use_mmap: true,
  }

  try {
    ctx = await initLlama(baseOptions, onProgress)
  } catch (firstError) {
    if (baseOptions.n_gpu_layers > 0) {
      ctx = await initLlama({ ...baseOptions, n_gpu_layers: 0 }, onProgress)
    } else {
      throw firstError
    }
  }
  path = localPath
}

export async function unloadModel(): Promise<void> {
  if (ctx) {
    await ctx.release()
    ctx = null
    path = null
  }
}

export async function completeChat(params: {
  messages: { role: MessageRole; content: string }[]
  onToken: (token: string) => void
}): Promise<{ text: string }> {
  if (!ctx) throw new Error('NO_MODEL_LOADED')
  const result = await ctx.completion(
    {
      messages: params.messages,
      n_predict: N_PREDICT,
      temperature: 0.7,
      stop: ['</s>', '<|end|>', '<|im_end|>', '<|eot_id|>'],
    },
    (data) => {
      params.onToken(data.token)
    },
  )
  return { text: result.content || result.text }
}

export async function stop(): Promise<void> {
  if (ctx) await ctx.stopCompletion()
}
