import type { HubGgufFile } from '@/src/domain/types'

export const MAX_GGUF_BYTES = 2_147_483_648

/** Public small instruct GGUF repos used when the Models search is empty. */
export const CURATED_REPOS = [
  'ggml-org/Qwen2.5-0.5B-Instruct-GGUF',
  'ggml-org/SmolLM2-360M-Instruct-GGUF',
  'HuggingFaceTB/SmolLM2-135M-Instruct-GGUF',
] as const

type HubTreeEntry = {
  path?: string
  type?: string
  size?: number
  oid?: string
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
  maxBytes: number = MAX_GGUF_BYTES,
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
    .map((e) => ({
      repoId,
      filename: e.path as string,
      displayName: `${repoId.split('/').pop()}/${(e.path as string).split('/').pop()}`,
      sizeBytes: e.size as number,
      sha: e.oid,
    }))
}

export async function listRepoGgufFiles(
  repoId: string,
  opts?: { maxBytes?: number },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? MAX_GGUF_BYTES
  const res = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`HUB_TREE_FAILED:${res.status}`)
  }
  const entries = (await res.json()) as HubTreeEntry[]
  return filterGgufEntries(repoId, entries, maxBytes)
}

export async function searchGgufModels(
  query: string,
  opts?: { maxBytes?: number },
): Promise<HubGgufFile[]> {
  const maxBytes = opts?.maxBytes ?? MAX_GGUF_BYTES
  const q = query.trim()

  if (!q) {
    const batches = await Promise.all(
      CURATED_REPOS.map(async (repoId) => {
        try {
          return await listRepoGgufFiles(repoId, { maxBytes })
        } catch {
          return [] as HubGgufFile[]
        }
      }),
    )
    return batches.flat()
  }

  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&limit=20&full=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`HUB_SEARCH_FAILED:${res.status}`)
  }
  const models = (await res.json()) as Array<{ id?: string }>
  const files: HubGgufFile[] = []
  for (const model of models) {
    if (!model.id) continue
    try {
      const repoFiles = await listRepoGgufFiles(model.id, { maxBytes })
      files.push(...repoFiles.slice(0, 3))
    } catch {
      // skip repos that fail tree listing
    }
  }
  return files
}
