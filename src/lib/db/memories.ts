import { getDB } from './schema';
import { generateUUID } from '../utils';

export interface Memory {
  id: string;
  content: string;
  createdAt: number;
  source: 'user' | 'system';
  tags?: string[];
}

/**
 * Add a new memory
 */
export async function addMemory(content: string, source: 'user' | 'system' = 'user'): Promise<Memory> {
  const db = await getDB();
  const memory: Memory = {
    id: generateUUID(),
    content,
    createdAt: Date.now(),
    source
  };

  await db.put('memories', memory);
  return memory;
}

/**
 * Get all memories sorted by creation date (newest first)
 */
export async function getMemories(): Promise<Memory[]> {
  const db = await getDB();
  const memories = await db.getAllFromIndex('memories', 'by-created');
  return memories.reverse();
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memories', id);
}

/**
 * Update a memory
 */
export async function updateMemory(id: string, content: string): Promise<void> {
  const db = await getDB();
  const memory = await db.get('memories', id);
  if (memory) {
    memory.content = content;
    await db.put('memories', memory);
  }
}

/**
 * Clear all memories
 */
export async function clearMemories(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('memories', 'readwrite');
  await tx.objectStore('memories').clear();
  await tx.done;
}
