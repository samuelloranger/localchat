/**
 * Short, human name for an installed model.
 *
 * displayName is "<repo>/<filename>", which on a phone header truncates to
 * something like "Dolphin3.0-Llama3.2-3B-GGUF/Dolphin3.0-Lla…" — the repo
 * prefix eats the width and the part that identifies the model is cut off.
 * Keep the filename, drop the extension, and drop the GGUF/quant noise, so the
 * label carries the family and the parameter count.
 */
export function formatModelLabel(displayName: string): string {
  const base = (displayName.split('/').pop() ?? displayName).replace(/\.gguf$/i, '')
  return (
    base
      // Trailing quant marker: -Q4_K_M, .IQ3_XS, -i1-Q4_0, -f16 …
      .replace(/[-_.](i1[-_.])?(iq\d\w*|q\d(_\w+)*|bf16|fp16|f16|f32)$/i, '')
      .replace(/[-_.]?GGUF$/i, '')
      .trim() || base
  )
}

/**
 * Provenance line under a finished assistant turn.
 *
 * The model name is a constant for the conversation and already sits in the
 * header, so repeating it under every reply is noise. The first reply names who
 * is answering; after that only the rate is reported, because the rate is the
 * part that actually changes from turn to turn — and it is something only a
 * local runtime can know.
 *
 * Returns null when there is nothing true to say.
 */
export function formatProvenance(
  modelLabel: string,
  tokensPerSecond: number | null | undefined,
  isFirstReply: boolean,
): string | null {
  const rate =
    typeof tokensPerSecond === 'number' && Number.isFinite(tokensPerSecond) && tokensPerSecond > 0
      ? `${tokensPerSecond.toFixed(1)} tok/s`
      : null

  if (isFirstReply) return rate ? `${modelLabel} · ${rate}` : modelLabel
  return rate
}
