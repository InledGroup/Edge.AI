import { getDB } from './schema';
import type { CustomApp } from '../../types';

/**
 * Save a custom app
 */
export async function saveCustomApp(app: CustomApp): Promise<string> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('custom_apps')) {
    console.warn('custom_apps store not found, skipping save');
    return app.id;
  }
  await db.put('custom_apps', app);
  return app.id;
}

/**
 * Get all custom apps
 */
export async function getAllCustomApps(): Promise<CustomApp[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('custom_apps')) {
    console.warn('custom_apps store not found, returning empty list');
    return [];
  }
  return db.getAllFromIndex('custom_apps', 'by-created');
}

/**
 * Get a custom app by ID
 */
export async function getCustomApp(id: string): Promise<CustomApp | undefined> {
  const db = await getDB();
  return db.get('custom_apps', id);
}

/**
 * Delete a custom app
 */
export async function deleteCustomApp(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('custom_apps', id);
}
