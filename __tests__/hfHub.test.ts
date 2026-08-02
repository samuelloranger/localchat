import { downloadUrl, filterGgufEntries } from '../src/services/hfHub'

test('downloadUrl is public resolve URL without token query', () => {
  const u = downloadUrl('owner/repo', 'model-Q4_K_M.gguf')
  expect(u).toBe('https://huggingface.co/owner/repo/resolve/main/model-Q4_K_M.gguf')
  expect(u.includes('token')).toBe(false)
})

test('filterGgufEntries drops non-gguf and oversized', () => {
  const out = filterGgufEntries(
    'o/r',
    [
      { path: 'a-Q4_K_M.gguf', size: 1_000_000, type: 'file' },
      { path: 'readme.md', size: 100, type: 'file' },
      { path: 'huge.gguf', size: 9_000_000_000, type: 'file' },
    ],
    8_000_000_000,
  )
  expect(out).toHaveLength(1)
  expect(out[0].filename).toBe('a-Q4_K_M.gguf')
  expect(out[0].quant).toBe('Q4')
})
