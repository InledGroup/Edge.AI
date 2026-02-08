import { getDB } from './schema';
import type { MCPServer } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all MCP servers
 */
export async function getMCPServers(): Promise<MCPServer[]> {
  const db = await getDB();
  return db.getAll('mcp_servers');
}

/**
 * Get enabled MCP servers
 */
export async function getEnabledMCPServers(): Promise<MCPServer[]> {
  const servers = await getMCPServers();
  return servers.filter(s => s.enabled);
}

/**
 * Add a new MCP server
 */
export async function addMCPServer(data: Omit<MCPServer, 'id' | 'status' | 'createdAt'>): Promise<MCPServer> {
  const db = await getDB();
  const server: MCPServer = {
    id: uuidv4(),
    ...data,
    status: 'disconnected',
    createdAt: Date.now()
  };
  
  await db.put('mcp_servers', server);
  return server;
}

/**
 * Update an MCP server
 */
export async function updateMCPServer(id: string, updates: Partial<MCPServer>): Promise<void> {
  const db = await getDB();
  const server = await db.get('mcp_servers', id);
  if (!server) throw new Error(`MCP Server ${id} not found`);
  
  const updated = { ...server, ...updates };
  await db.put('mcp_servers', updated);
}

/**
 * Delete an MCP server
 */
export async function deleteMCPServer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('mcp_servers', id);
}

/**
 * Update server status (ephemeral, not always persisted? actually we persist it for UI)
 */
export async function updateMCPServerStatus(id: string, status: MCPServer['status'], error?: string): Promise<void> {
  await updateMCPServer(id, { status, errorMessage: error });
}
