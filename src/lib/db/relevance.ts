import { getDB } from './schema';

/**
 * Update chunk relevance based on user feedback
 */
export async function updateChunkRelevance(chunkId: string, type: 'up' | 'down') {
  if (!chunkId || typeof chunkId !== 'string' || chunkId.trim() === '') {
    console.error('❌ [Chunk Relevance] Cannot update relevance: Invalid chunkId provided', chunkId);
    return;
  }

  const db = await getDB();
  
  // Safety check: ensure the store exists (migration safety)
  if (!db.objectStoreNames.contains('chunk_relevance')) {
    console.warn('⚠️ [Chunk Relevance] Database store not found.');
    return;
  }

  const existing = await db.get('chunk_relevance', chunkId);
  
  const boostChange = type === 'up' ? 0.1 : -0.1;
  const currentBoost = existing?.relevanceBoost || 1.0;
  
  // Clamp boost between 0.5 and 2.0
  const newBoost = Math.max(0.5, Math.min(2.0, currentBoost + boostChange));
  
  await db.put('chunk_relevance', {
    chunkId,
    relevanceBoost: newBoost,
    votes: (existing?.votes || 0) + 1,
    lastVote: type,
    lastUpdated: Date.now()
  });
  
  console.log(`📊 [Chunk Relevance] ${chunkId} updated to ${newBoost.toFixed(2)} (${type})`);
}

/**
 * Get current vote for a chunk
 */
export async function getChunkVote(chunkId: string): Promise<'up' | 'down' | null> {
  if (!chunkId || typeof chunkId !== 'string' || chunkId.trim() === '') return null;
  const db = await getDB();
  if (!db.objectStoreNames.contains('chunk_relevance')) return null;
  
  const entry = await db.get('chunk_relevance', chunkId);
  return entry?.lastVote || null;
}

/**
 * Get boost for a list of chunk IDs
 */
export async function getChunkBoosts(chunkIds: string[]): Promise<Map<string, number>> {
  const db = await getDB();
  const boosts = new Map<string, number>();
  
  // Safety check for migration
  if (!db.objectStoreNames.contains('chunk_relevance')) {
    return boosts;
  }
  
  for (const id of chunkIds) {
    try {
      const entry = await db.get('chunk_relevance', id);
      if (entry) {
        boosts.set(id, entry.relevanceBoost);
      }
    } catch (e) {
      console.warn('Error fetching boost for chunk', id, e);
    }
  }
  
  return boosts;
}
