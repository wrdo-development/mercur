// Step-1 port stubs — these modules (tribe-directory, tribe-user, tribe-booking)
// are NOT yet ported into Mercur. The WhatsApp pipeline only uses these at
// build-time (types) or behind runtime try/catch (provider lookup → []), so the
// verify→receive→reply path works without them. REPLACE with real imports when
// the data-stack lands (later phase). See docs/plans/2026-06-16-whatsapp-port-step1.md.

// ── tribe-directory ────────────────────────────────────────────────────────
// Source: apps/backend/src/modules/tribe-directory/index.ts
export const TRIBE_DIRECTORY_MODULE = 'tribe_directory';

// Source: apps/backend/src/modules/tribe-directory/provider.types.ts
/** Abstraction over TribeDirectoryService for Provider CRUD. */
export interface IProviderDirectory {
  createProviders(data: Record<string, unknown>): Promise<{ id: string } | { id: string }[]>;
  updateProviders(
    data: Record<string, unknown>,
  ): Promise<{ id: string; [key: string]: unknown } | { id: string; [key: string]: unknown }[]>;
  listProviders(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<{ id: string; [key: string]: unknown }[]>;
  listAndCountProviders(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<[{ id: string }[], number]>;
  retrieveProvider(id: string): Promise<{ id: string; [key: string]: unknown } | null>;
}

// Source: apps/backend/src/modules/tribe-directory/provider.repository.ts
export interface ProviderListFilters {
  category: string;
  area: string;
  is_active?: boolean;
}

export interface ProviderListOptions {
  order?: { rating_average?: 'ASC' | 'DESC' };
  take?: number;
  skip?: number;
}

/**
 * Stub: always returns []. Real impl delegates to IProviderDirectory.listProviders.
 * Matches source signature in provider.repository.ts.
 */
export async function listProvidersByService(
  _directory: IProviderDirectory,
  _filters: ProviderListFilters,
  _options?: ProviderListOptions,
): Promise<never[]> {
  return [];
}

// ── tribe-user ─────────────────────────────────────────────────────────────
// Source: apps/backend/src/modules/tribe-user/tribe-user.service.ts
// webhook-pipeline.types.ts only uses: Pick<TribeUserService, 'updateBsuidByPhone'>
export interface TribeUserService {
  updateBsuidByPhone(phone: string, bsuid: string): Promise<void>;
}

// ── tribe-booking (provider-matcher) ───────────────────────────────────────
// Source: apps/backend/src/modules/tribe-booking/provider-matcher.types.ts
export interface ProviderMatch {
  id: string;
  name?: string;
  average_rating?: number;
  response_time_minutes?: number;
  verification_status?: string;
}
