import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, exchangeAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { getEnabledMCPServers, updateMCPServerStatus, getMCPServers } from '../db/mcp';
import type { MCPServer } from '@/types';
import { BrowserOAuthProvider } from './mcp-oauth';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
  serverName: string;
}

class MCPManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private static instance: MCPManager;

  private constructor() {}

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * Initialize connections to all enabled servers
   */
  async initialize() {
    // Handle OAuth Callback first
    await BrowserOAuthProvider.handleCallback();

    const servers = await getEnabledMCPServers();
    for (const server of servers) {
      // Check if we have a pending code for this server
      const code = localStorage.getItem(`mcp_oauth_code_${server.id}`);
      if (code) {
        localStorage.removeItem(`mcp_oauth_code_${server.id}`);
        await this.completeOAuth(server, code);
      }
      
      await this.connect(server);
    }
  }

  /**
   * Complete OAuth flow by exchanging code for tokens
   */
  async completeOAuth(server: MCPServer, code: string) {
    try {
      console.log(`🔑 Completing OAuth for ${server.name}...`);
      const provider = new BrowserOAuthProvider(server);
      
      // We use the SDK's auth function which handles the exchange if code is provided
      await auth(provider, {
        serverUrl: new URL(server.url),
        authorizationCode: code
      });
      
      console.log(`✅ OAuth completed for ${server.name}`);
    } catch (error) {
      console.error(`❌ OAuth failed for ${server.name}:`, error);
    }
  }

  /**
   * Connect to a specific server
   */
  async connect(server: MCPServer) {
    if (this.clients.has(server.id)) return;

    try {
      let transport;
      const provider = new BrowserOAuthProvider(server);

      if (server.transport === 'http') {
        // SSEClientTransport is generally more compatible with existing MCP servers
        // like the one for Notion which might not support StreamableHTTP yet.
        transport = new SSEClientTransport(new URL(server.url), {
          requestInit: {
            headers: {
              ...(server.headers || {})
            }
          }
        });
      } else {
        transport = new WebSocketClientTransport(new URL(server.url));
      }

      const client = new Client({
        name: "edge-ai-client",
        version: "1.0.0",
      }, {
        capabilities: {
          tools: {},
        }
      });

      await client.connect(transport);
      this.clients.set(server.id, client);
      
      // Fetch tools
      const result = await client.listTools();
      const serverTools = result.tools.map(t => ({
        ...t,
        serverName: server.name
      }));
      this.tools.set(server.id, serverTools);

      await updateMCPServerStatus(server.id, 'connected');
      console.log(`✅ Connected to MCP server: ${server.name}`);
    } catch (error: any) {
      console.error(`❌ Failed to connect to MCP server ${server.name}:`, error);
      
      let errorMessage = error.message;
      if (errorMessage.includes('404')) {
        errorMessage += ' (Check URL path)';
      } else if (errorMessage.includes('405')) {
        errorMessage += ' (Method Not Allowed - check if server requires WebSocket or URL is correct)';
      }
      
      await updateMCPServerStatus(server.id, 'error', errorMessage);
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverId: string) {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.error('Error closing client:', e);
      }
      this.clients.delete(serverId);
      this.tools.delete(serverId);
      await updateMCPServerStatus(serverId, 'disconnected');
    }
  }

  /**
   * Get all available tools from all connected servers
   * Optional: filter by server name (if user invoked /server_name)
   */
  async getTools(serverNameFilter?: string): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    // Refresh tools if needed? For now assume static list after connect
    // Or we could re-fetch. Let's rely on cache for speed.

    for (const [serverId, tools] of this.tools.entries()) {
      // Find server config to check name
      // This is inefficient, we should store server name in map or look up
      // For now, we stored serverName in the tool object itself!
      
      const matchingTools = serverNameFilter 
        ? tools.filter(t => t.serverName.toLowerCase() === serverNameFilter.toLowerCase())
        : tools;
        
      allTools.push(...matchingTools);
    }

    return allTools;
  }

  async getEnabledMCPServers() {
    return getEnabledMCPServers();
  }

  /**
   * Execute a tool
   */
  async callTool(serverName: string, toolName: string, args: any) {
    // Find the client for this server
    // We need to map serverName -> serverId -> client
    // Since we don't have that map handy, let's look up servers from DB or store metadata
    // We'll search active clients
    
    // Optimization: Store serverName -> clientId mapping
    
    // For now, iterate
    for (const [clientId, tools] of this.tools.entries()) {
      if (tools.length > 0 && tools[0].serverName === serverName) {
        const client = this.clients.get(clientId);
        if (client) {
          return await client.callTool({
            name: toolName,
            arguments: args
          });
        }
      }
    }
    throw new Error(`Server ${serverName} not found or not connected`);
  }
}

export const mcpManager = MCPManager.getInstance();
