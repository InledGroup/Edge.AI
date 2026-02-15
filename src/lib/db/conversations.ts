// ============================================================================
// Conversations Store - CRUD operations for chat conversations
// ============================================================================

import { getDB } from './schema';
import type { Conversation, Message } from '@/types';
import { generateUUID } from '../utils';

/**
 * Create a new conversation
 */
export async function createConversation(
  title: string = 'New Conversation',
  model?: string
): Promise<Conversation> {
  const db = await getDB();

  const conversation: Conversation = {
    id: generateUUID(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model
  };

  await db.add('conversations', conversation);
  return conversation;
}

/**
 * Get conversation by ID
 */
export async function getConversation(
  id: string
): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get('conversations', id);
}

/**
 * Get all conversations
 */
export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB();
  return db.getAll('conversations');
}

/**
 * Get conversations sorted by last update (newest first)
 */
export async function getConversationsSorted(): Promise<Conversation[]> {
  const db = await getDB();
  const conversations = await db.getAllFromIndex(
    'conversations',
    'by-updated'
  );
  return conversations.reverse();
}

/**
 * Update conversation
 */
export async function updateConversation(
  id: string,
  updates: Partial<Omit<Conversation, 'id' | 'createdAt'>>
): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', id);

  if (!conversation) {
    throw new Error(`Conversation ${id} not found`);
  }

  const updated = {
    ...conversation,
    ...updates,
    updatedAt: Date.now()
  };

  await db.put('conversations', updated);
}

/**
 * Add message to conversation
 */
export async function addMessage(
  conversationId: string,
  message: Omit<Message, 'id' | 'timestamp'>
): Promise<Message> {
  const conversation = await getConversation(conversationId);

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const newMessage: Message = {
    ...message,
    id: generateUUID(),
    timestamp: Date.now()
  };

  conversation.messages.push(newMessage);
  await updateConversation(conversationId, {
    messages: conversation.messages
  });

  return newMessage;
}

/**
 * Update conversation title (auto-generate from first message)
 */
export async function updateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  await updateConversation(id, { title });
}

/**
 * Generate title from first user message
 */
export function generateTitle(firstMessage: string): string {
  const maxLength = 40;
  const cleaned = firstMessage.trim().split('\n')[0];

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength - 3) + '...';
}

/**
 * Advanced title generation using the AI engine
 */
export async function aiGenerateTitle(firstMessage: string): Promise<string> {
  try {
    const { default: EngineManager } = await import('@/lib/ai/engine-manager');
    const chatEngine = await EngineManager.getChatEngine();
    
    const prompt = `Generate a very short, concise title (max 5 words) for a conversation that starts with this message: "${firstMessage.substring(0, 100)}". Respond ONLY with the title, no quotes or punctuation.`;
    
    const title = await chatEngine.generateText([
      { role: 'user', content: prompt }
    ], { max_tokens: 20 });

    return title.trim().replace(/^["']|["']$/g, '') || generateTitle(firstMessage);
  } catch (error) {
    console.warn('Failed to generate AI title, falling back to basic title:', error);
    return generateTitle(firstMessage);
  }
}

/**
 * Delete conversation
 */
export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
}

/**
 * Delete all conversations
 */
export async function deleteAllConversations(): Promise<void> {
  const db = await getDB();
  await db.clear('conversations');
}

/**
 * Get conversation count
 */
export async function getConversationCount(): Promise<number> {
  const db = await getDB();
  return db.count('conversations');
}

/**
 * Get or create a conversation
 * If conversationId is provided and exists, return it
 * Otherwise create a new one
 */
export async function getOrCreateConversation(
  conversationId?: string,
  model?: string
): Promise<Conversation> {
  if (conversationId) {
    const existing = await getConversation(conversationId);
    if (existing) {
      return existing;
    }
  }

  return createConversation('New Conversation', model);
}

/**
 * Clear messages from a conversation
 */
export async function clearConversationMessages(
  id: string
): Promise<void> {
  await updateConversation(id, { messages: [] });
}

/**
 * Get last N conversations
 */
export async function getRecentConversations(
  limit: number = 10
): Promise<Conversation[]> {
  const conversations = await getConversationsSorted();
  return conversations.slice(0, limit);
}

/**
 * Search conversations by title
 */
export async function searchConversations(
  query: string
): Promise<Conversation[]> {
  const conversations = await getAllConversations();
  const lowerQuery = query.toLowerCase();

  return conversations.filter(conv =>
    conv.title.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Export all conversations to JSON-compatible object
 */
export async function exportConversations(): Promise<{ version: number; conversations: Conversation[] }> {
  const conversations = await getAllConversations();
  return {
    version: 1,
    conversations
  };
}

/**
 * Import conversations from JSON object
 * Merges with existing conversations. Overwrites if ID matches.
 */
export async function importConversations(data: { version: number; conversations: Conversation[] }): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('conversations', 'readwrite');
  
  try {
    if (!data.conversations || !Array.isArray(data.conversations)) {
      throw new Error('Invalid data format');
    }

    for (const conv of data.conversations) {
      // Basic validation
      if (!conv.id || !conv.messages) {
        console.warn('Skipping invalid conversation:', conv);
        continue;
      }
      await tx.store.put(conv);
    }
    
    await tx.done;
  } catch (error) {
    console.error('Failed to import conversations:', error);
    throw error;
  }
}
