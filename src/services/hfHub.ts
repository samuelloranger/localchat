import type { HubGgufFile } from '@/src/domain/types'
import {
  isCpuRepackGguf,
  isNonModelGguf,
  isShardedGguf,
  parseQuantFamily,
  selectRepoFiles,
} from '@/src/services/modelCatalog'

/** Soft cap for browsing (show larger files as disabled if they don't fit RAM). */
export const BROWSE_MAX_BYTES = 8 * 1024 * 1024 * 1024

const TREE_FETCH_CONCURRENCY = 6
const SEARCH_REPO_LIMIT = 8

/**
 * Files kept per repo. Generous on purpose: the quant chips filter this list
 * client-side, so anything dropped here is invisible to every filter. Ordering
 * is by usefulness (see selectRepoFiles), never by size.
 */
const REPO_FILE_LIMIT = 12

/** Common public instruct GGUF repos for the default Models list. */
export const CURATED_REPOS = [
  'ggml-org/Qwen2.5-0.5B-Instruct-GGUF',
  'ggml-org/Qwen2.5-1.5B-Instruct-GGUF',
  'ggml-org/SmolLM2-360M-Instruct-GGUF',
  'HuggingFaceTB/SmolLM2-135M-Instruct-GGUF',
  'microsoft/Phi-3.5-mini-instruct-gguf',
  'bartowski/Llama-3.2-1B-Instruct-GGUF',
  'bartowski/Llama-3.2-3B-Instruct-GGUF',
  'Qwen/Qwen2.5-3B-Instruct-GGUF',
] as const

type HubTreeEntry = {
  path?: string
  type?: string
  size?: number
  oid?: string
}

type HubModelCard = {
  id?: string
  downloads?: number
  lastModified?: string
}

export function downloadUrl(repoId: string, filename: string): string {
  const encoded = filename
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://huggingface.co/${repoId}/resolve/main/${encoded}`
}

export function filterGgufEntries(
  repoId: string,
  entries: HubTreeEntry[],
  maxBytes: number = BROWSE_MAX_BYTES,
  meta?: { downloads?: number; lastModified?: number },
): HubGgufFile[] {
  return entries
    .filter(
      (e) =>
        e.type === 'file' &&
        typeof e.path === 'string' &&
        e.path.toLowerCase().endsWith('.gguf') &&
        // A split GGUF piece cannot be loaded on its own; offering one as a
        // download would always produce a broken install. Same for projectors,
        // LoRA adapters and tokenizer dumps, which are not models at all.
        !isShardedGguf(e.path) &&
        !isNonModelGguf(e.path) &&
        !isCpuRepackGguf(e.path) &&
        typeof e.size === 'number' &&
        e.size > 0 &&
        e.size <= maxBytes,
    )
    .map((e) => {
      const filename = e.path as string
      return {
        repoId,
        filename,
        displayName: `${repoId.split('/').pop()}/${filename.split('/').pop()}`,
        sizeBytes: e.size as number,
        sha: e.oid,
        quant: parseQuantFamily(filename),
        downloads: meta?.downloads,
        lastModified: meta?.lastModified,
      }
    })
}

export async function listRepoGgufFiles(
  repoId: string,
  opts?: {
    maxBytes?: number
    downloads?: number
    lastModified?: number
    signal?: AbortSignal
  },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? BROWSE_MAX_BYTES
  const res = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`, {
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  })
  if (!res.ok) {
    throw new Error(`HUB_TREE_FAILED:${res.status}`)
  }
  const entries = (await res.json()) as HubTreeEntry[]
  return filterGgufEntries(repoId, entries, maxBytes, {
    downloads: opts?.downloads,
    lastModified: opts?.lastModified,
  })
}

async function fetchModelCard(
  repoId: string,
  signal?: AbortSignal,
): Promise<HubModelCard | null> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!res.ok) return null
    return (await res.json()) as HubModelCard
  } catch {
    return null
  }
}

function cardMeta(card: HubModelCard | null): { downloads?: number; lastModified?: number } {
  if (!card) return {}
  const lastModified = card.lastModified ? Date.parse(card.lastModified) : undefined
  return {
    downloads: typeof card.downloads === 'number' ? card.downloads : undefined,
    lastModified: Number.isFinite(lastModified) ? lastModified : undefined,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function searchGgufModels(
  query: string,
  opts?: { maxBytes?: number; signal?: AbortSignal },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? BROWSE_MAX_BYTES
  const signal = opts?.signal
  const q = query.trim()

  if (!q) {
    const batches = await mapWithConcurrency(
      [...CURATED_REPOS],
      TREE_FETCH_CONCURRENCY,
      async (repoId: string) => {
        try {
          const card = await fetchModelCard(repoId, signal)
          return await listRepoGgufFiles(repoId, { maxBytes, signal, ...cardMeta(card) })
        } catch {
          return [] as HubGgufFile[]
        }
      },
    )
    return batches.flat()
  }

  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&limit=25&full=true&sort=downloads&direction=-1`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) {
    throw new Error(`HUB_SEARCH_FAILED:${res.status}`)
  }
  const models = ((await res.json()) as HubModelCard[]).slice(0, SEARCH_REPO_LIMIT)
  const files: HubGgufFile[] = []

  const repoFiles = await mapWithConcurrency(models, TREE_FETCH_CONCURRENCY, async (model) => {
    if (!model.id) return [] as HubGgufFile[]
    try {
      const listed = await listRepoGgufFiles(model.id, {
        maxBytes,
        signal,
        ...cardMeta(model),
      })
      return selectRepoFiles(listed, REPO_FILE_LIMIT)
    } catch {
      return [] as HubGgufFile[]
    }
  })

  for (const batch of repoFiles) {
    files.push(...batch)
  }
  return files
}
