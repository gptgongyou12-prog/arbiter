import { get } from './client'

// Cache signed stream URLs for 45s to avoid redundant roundtrips
const _streamCache = new Map<string, { url: string; expiresAt: number }>()

export async function getStreamUrl(
	trackId: string,
	params?: { quality?: string; versionId?: number | null }
): Promise<{ url: string }> {
	const cacheKey = `${trackId}:${params?.quality ?? ''}:${params?.versionId ?? ''}`
	const cached = _streamCache.get(cacheKey)
	if (cached && Date.now() < cached.expiresAt) {
		return { url: cached.url }
	}

	const query = new URLSearchParams()
	if (params?.quality) {
		query.set('quality', params.quality)
	}
	if (params?.versionId) {
		query.set('version_id', String(params.versionId))
	}
	const suffix = query.toString() ? `?${query.toString()}` : ''
	const result = await get<{ url: string }>(`/api/media/stream/${trackId}${suffix}`)
	_streamCache.set(cacheKey, { url: result.url, expiresAt: Date.now() + 45_000 })
	return result
}

export async function getProjectCoverUrl(
	projectId: string,
	params?: { size?: string }
): Promise<{ url: string }> {
	const query = new URLSearchParams()
	if (params?.size) {
		query.set('size', params.size)
	}
	const suffix = query.toString() ? `?${query.toString()}` : ''
	return get<{ url: string }>(`/api/media/projects/${projectId}/cover${suffix}`)
}
