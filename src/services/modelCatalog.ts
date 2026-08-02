import type { HubGgufFile } from '@/src/domain/types'
import { evaluateModelFit, type FitResult } from '@/src/services/deviceCapability'

export type QuantFamily = 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q8' | 'IQ' | 'F16' | 'other'

export type ModelSortKey = 'downloads' | 'sizeAsc' | 'sizeDesc' | 'name' | 'updated'

export type ModelBrowseFilters = {
  query?: string
  quant?: QuantFamily | 'any'
  maxSizeBytes?: number
  fitsDeviceOnly?: boolean
}

const QUANT_PATTERNS: Array<{ family: QuantFamily; re: RegExp }> = [
  { family: 'IQ', re: /iq\d/i },
  { family: 'Q2', re: /q2(?=[_\-.]|$)/i },
  { family: 'Q3', re: /q3(?=[_\-.]|$)/i },
  { family: 'Q4', re: /q4(?=[_\-.]|$)/i },
  { family: 'Q5', re: /q5(?=[_\-.]|$)/i },
  { family: 'Q6', re: /q6(?=[_\-.]|$)/i },
  { family: 'Q8', re: /q8(?=[_\-.]|$)/i },
  { family: 'F16', re: /f16|fp16/i },
]

export function parseQuantFamily(filename: string): QuantFamily {
  for (const { family, re } of QUANT_PATTERNS) {
    if (re.test(filename)) return family
  }
  return 'other'
}

/**
 * Desirability order for phone inference, best first. Quantization damage grows
 * as the model shrinks, so on the 1B–8B files this app targets, Q4_K_M is the
 * point where quality is near-indistinguishable from F16 at a quarter the RAM.
 * Anything below Q3 is a last resort — it only makes sense to fit a model that
 * would not otherwise load at all.
 *
 * Used to decide which files survive the per-repo cap: a repo with twenty
 * quants must not be represented by its four smallest, which are always the
 * unusable Q2/IQ2 ones.
 */
const QUANT_PREFERENCE: Array<{ re: RegExp; rank: number }> = [
  { re: /q4_k_m/i, rank: 0 },
  { re: /q4_k_s/i, rank: 1 },
  { re: /q5_k_m/i, rank: 2 },
  { re: /q5_k_s/i, rank: 3 },
  { re: /iq4_(xs|nl)/i, rank: 4 },
  { re: /q4_[01]/i, rank: 5 },
  { re: /q3_k_(l|m)/i, rank: 6 },
  { re: /q6_k/i, rank: 7 },
  { re: /q8_0/i, rank: 8 },
  { re: /iq3_(m|s)/i, rank: 9 },
  { re: /iq3_(xs|xxs)/i, rank: 10 },
  { re: /q3_k_s/i, rank: 11 },
  { re: /iq2_/i, rank: 12 },
  { re: /q2_/i, rank: 13 },
  { re: /f16|fp16|bf16|f32/i, rank: 14 },
  { re: /iq1_/i, rank: 15 },
]

/** Lower is better. Unrecognised names sort mid-table, ahead of Q2 and F16. */
export const UNKNOWN_QUANT_RANK = 11.5

export function quantPreferenceRank(filename: string): number {
  const base = filename.split('/').pop() ?? filename
  for (const { re, rank } of QUANT_PREFERENCE) {
    if (re.test(base)) return rank
  }
  return UNKNOWN_QUANT_RANK
}

/**
 * True for one piece of a split GGUF (`…-00001-of-00003.gguf`). Each piece is
 * useless alone, and llama.rn is handed a single path — offering the parts as
 * separate downloads guarantees a broken install.
 */
export function isShardedGguf(filename: string): boolean {
  return /-\d{5}-of-\d{5}\.gguf$/i.test(filename)
}

/**
 * Trim a repo's file list to `limit` entries, keeping the most useful quants
 * rather than the smallest. Ties break on size ascending so the lighter of two
 * equally-good options wins on a phone.
 */
export function selectRepoFiles(files: HubGgufFile[], limit: number): HubGgufFile[] {
  return [...files]
    .sort((a, b) => {
      const rank = quantPreferenceRank(a.filename) - quantPreferenceRank(b.filename)
      if (rank !== 0) return rank
      return a.sizeBytes - b.sizeBytes
    })
    .slice(0, limit)
}

export function withCatalogFields(file: HubGgufFile): HubGgufFile {
  return {
    ...file,
    quant: file.quant ?? parseQuantFamily(file.filename),
  }
}

function tokenizeQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function applyModelFilters(
  files: HubGgufFile[],
  filters: ModelBrowseFilters,
  deviceRamBytes: number,
): HubGgufFile[] {
  const tokens = filters.query ? tokenizeQuery(filters.query) : []
  const quant = filters.quant ?? 'any'
  const maxSize = filters.maxSizeBytes
  const fitsOnly = filters.fitsDeviceOnly ?? false

  return files.filter((file) => {
    if (tokens.length > 0) {
      const hay = `${file.displayName} ${file.repoId} ${file.filename}`.toLowerCase()
      if (!tokens.every((token) => hay.includes(token))) return false
    }
    const fileQuant = file.quant ?? parseQuantFamily(file.filename)
    if (quant !== 'any' && fileQuant !== quant) return false
    if (typeof maxSize === 'number' && file.sizeBytes > maxSize) return false
    if (fitsOnly) {
      const fit = evaluateModelFit(file.sizeBytes, deviceRamBytes)
      if (!fit.fits) return false
    }
    return true
  })
}

export function sortModels(files: HubGgufFile[], sort: ModelSortKey): HubGgufFile[] {
  const copy = [...files]
  copy.sort((a, b) => {
    switch (sort) {
      case 'sizeAsc':
        return a.sizeBytes - b.sizeBytes
      case 'sizeDesc':
        return b.sizeBytes - a.sizeBytes
      case 'name':
        return a.displayName.localeCompare(b.displayName)
      case 'updated':
        return (b.lastModified ?? 0) - (a.lastModified ?? 0)
      case 'downloads':
      default:
        return (
          (b.downloads ?? 0) - (a.downloads ?? 0) ||
          a.sizeBytes - b.sizeBytes ||
          a.displayName.localeCompare(b.displayName)
        )
    }
  })
  return copy
}

export function fitForFile(file: HubGgufFile, deviceRamBytes: number): FitResult {
  return evaluateModelFit(file.sizeBytes, deviceRamBytes)
}
