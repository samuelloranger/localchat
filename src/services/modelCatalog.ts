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
