import type { HubGgufFile } from '@/src/domain/types'
import { parseQuantFamily } from '@/src/services/modelCatalog'

/** Soft cap for browsing (show larger files as disabled if they don't fit RAM). */
export const BROWSE_MAX_BYTES = 8 * 1024 * 1024 * 1024

/** Legacy alias used by download paths that still prefer phone-friendly files. */
export const MAX_GGUF_BYTES = BROWSE_MAX_BYTES

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
  opts?: { maxBytes?: number; downloads?: number; lastModified?: number },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? BROWSE_MAX_BYTES
  const res = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`, {
    headers: { Accept: 'application/json' },
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

async function fetchModelCard(repoId: string): Promise<HubModelCard | null> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
      headers: { Accept: 'application/json' },
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

export async function searchGgufModels(
  query: string,
  opts?: { maxBytes?: number },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? BROWSE_MAX_BYTES
  const q = query.trim()

  if (!q) {
    const batches = await Promise.all(
      CURATED_REPOS.map(async (repoId) => {
        try {
          const card = await fetchModelCard(repoId)
          return await listRepoGgufFiles(repoId, { maxBytes, ...cardMeta(card) })
        } catch {
          return [] as HubGgufFile[]
        }
      }),
    )
    return batches.flat()
  }

  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&limit=25&full=true&sort=downloads&direction=-1`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`HUB_SEARCH_FAILED:${res.status}`)
  }
  const models = (await res.json()) as HubModelCard[]
  const files: HubGgufFile[] = []
  for (const model of models) {
    if (!model.id) continue
    try {
      const repoFiles = await listRepoGgufFiles(model.id, {
        maxBytes,
        ...cardMeta(model),
      })
      // Prefer smaller quants first within a repo for mobile browsing
      const preferred = [...repoFiles].sort((a, b) => a.sizeBytes - b.sizeBytes).slice(0, 4)
      files.push(...preferred)
    } catch {
      // skip repos that fail tree listing
    }
  }
  return files
}
