/**
 * resolveFlowStrings — fetch the language pack for a WhatsApp Flow screen.
 *
 * Lazy-loads from Supabase with a 15-minute in-memory TTL.
 * Falls back to 'en' if the requested language is not seeded.
 * Returns an empty object if neither lang nor 'en' exists (graceful — never throws).
 *
 * ⚠ 300ms SLA: Meta enforces a strict response window on data_exchange webhooks.
 *    The in-memory cache means DB latency only occurs on the first call per language
 *    after a TTL miss. Cache is shared across the process.
 */

export interface FlowStringsDeps {
  supabaseUrl: string;
  supabaseKey: string;
}

const cache = new Map<string, { pack: Record<string, string>; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function fetchFromSupabase(
  deps: FlowStringsDeps,
  flowId: string,
  screenId: string,
  langCode: string,
): Promise<Record<string, string> | null> {
  const url =
    `${deps.supabaseUrl}/rest/v1/flow_lang_packs` +
    `?flow_id=eq.${encodeURIComponent(flowId)}` +
    `&screen_id=eq.${encodeURIComponent(screenId)}` +
    `&lang_code=eq.${encodeURIComponent(langCode)}` +
    `&select=strings&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: deps.supabaseKey,
        Authorization: `Bearer ${deps.supabaseKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return null;
    }
    const rows = (await res.json()) as Array<{ strings: Record<string, string> }>;
    return rows[0]?.strings ?? null;
  } catch {
    return null;
  }
}

export async function resolveFlowStrings(
  deps: FlowStringsDeps,
  flowId: string,
  screenId: string,
  langCode: string,
): Promise<Record<string, string>> {
  const key = `${flowId}:${screenId}:${langCode}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pack;
  }

  // Try requested language, fall back to English
  const pack =
    (await fetchFromSupabase(deps, flowId, screenId, langCode)) ??
    (langCode !== 'en' ? await fetchFromSupabase(deps, flowId, screenId, 'en') : null) ??
    {};

  cache.set(key, { pack, expiresAt: Date.now() + CACHE_TTL_MS });
  return pack;
}

/** Clear the in-memory cache (e.g. after a deploy, for testing). */
export function clearFlowStringsCache(): void {
  cache.clear();
}
