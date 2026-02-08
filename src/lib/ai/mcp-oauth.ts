import type { 
  OAuthClientProvider, 
  AddClientAuthentication 
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { 
  OAuthClientMetadata, 
  OAuthClientInformationMixed, 
  OAuthTokens 
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { updateMCPServer } from '../db/mcp';
import type { MCPServer } from '@/types';
import { getDB } from '../db/schema';

export class BrowserOAuthProvider implements OAuthClientProvider {
  private server: MCPServer;

  constructor(server: MCPServer) {
    this.server = server;
  }

  get redirectUrl(): string {
    return window.location.origin + window.location.pathname;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Edge.AI Local",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: [this.redirectUrl],
      scope: "read_content" // Default, will be overridden by server request if available
    };
  }

  async state(): Promise<string> {
    const state = Math.random().toString(36).substring(2);
    sessionStorage.setItem(`mcp_oauth_state_${this.server.id}`, state);
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const db = await getDB();
    const info = await db.get('settings', `mcp_client_info_${this.server.id}`);
    return info;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    const db = await getDB();
    await db.put('settings', clientInformation, `mcp_client_info_${this.server.id}`);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const db = await getDB();
    const tokens = await db.get('settings', `mcp_tokens_${this.server.id}`);
    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const db = await getDB();
    await db.put('settings', tokens, `mcp_tokens_${this.server.id}`);
    // Also update server status if it was authorized
    await updateMCPServer(this.server.id, { status: 'connected' });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log('🔗 Redirecting to OAuth:', authorizationUrl.href);
    // Store current server ID so we know which one we're authenticating on return
    localStorage.setItem('mcp_pending_auth_id', this.server.id);
    window.location.href = authorizationUrl.href;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    sessionStorage.setItem(`mcp_oauth_verifier_${this.server.id}`, codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    return sessionStorage.getItem(`mcp_oauth_verifier_${this.server.id}`) || '';
  }

  // Handle the callback from OAuth
  static async handleCallback(): Promise<boolean> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const serverId = localStorage.getItem('mcp_pending_auth_id');

    if (code && serverId) {
      const savedState = sessionStorage.getItem(`mcp_oauth_state_${serverId}`);
      if (state !== savedState) {
        console.error('❌ OAuth state mismatch');
        return false;
      }

      // We found a code! We need to notify the MCPManager to complete the exchange.
      // But we are in a fresh page load. 
      // We'll store the code and clear the URL.
      localStorage.setItem(`mcp_oauth_code_${serverId}`, code);
      localStorage.removeItem('mcp_pending_auth_id');
      
      // Clean URL
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname);
      
      return true;
    }
    return false;
  }
}
