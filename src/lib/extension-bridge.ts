/**
 * Extension Bridge - Simplified communication with browser extension
 *
 * Architecture:
 * 1. Extension's content script auto-detects edge.inled.es or localhost:4321
 * 2. Extension sends CONNECTION_READY via window.postMessage
 * 3. Page shows notification that extension is connected
 * 4. When page needs search, sends SEARCH_REQUEST
 * 5. Extension shows permission dialog (unless in permissive mode)
 * 6. Extension sends SEARCH_RESPONSE with results
 */

export type ExtensionConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ExtensionPermissionMode = 'ask' | 'permissive';

export interface ExtensionSearchRequest {
  query: string;
  maxResults?: number;
}

export interface ExtensionSearchResult {
  title: string;
  url: string;
  content: string;
  wordCount: number;
  extractedAt: number;
}

export interface ExtensionSearchResponse {
  success: boolean;
  results: ExtensionSearchResult[];
  error?: string;
}

/**
 * Extension Bridge - Main API
 */
export class ExtensionBridge {
  private status: ExtensionConnectionStatus = 'disconnected';
  private permissionMode: ExtensionPermissionMode = 'ask';
  private listeners: Set<(status: ExtensionConnectionStatus) => void> = new Set();
  private pendingRequests: Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }> = new Map();

  constructor() {
    this.setupMessageListener();
    this.sendPing();
  }

  /**
   * Setup message listener from extension (via window.postMessage)
   */
  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      // Only accept messages from same origin
      if (event.source !== window) return;

      const message = event.data;

      // Check if it's an extension message
      if (!message || message.source !== 'edgeai-extension') return;

      console.log('[ExtensionBridge] 📨 Received:', message.type);

      switch (message.type) {
        case 'PONG':
          this.handlePong(message.data);
          break;

        case 'CONNECTION_READY':
          this.handleConnectionReady(message.data);
          break;

        case 'SEARCH_RESPONSE':
          this.handleSearchResponse(message.data);
          break;

        case 'SEARCH_DENIED':
          this.handleSearchDenied(message.data);
          break;

        case 'SEARCH_ERROR':
          this.handleSearchError(message.data);
          break;
      }
    });
  }

  /**
   * Send ping to check if extension is present
   */
  private sendPing() {
    console.log('[ExtensionBridge] 🔍 Checking for extension...');
    window.postMessage({
      source: 'edgeai-webapp',
      type: 'PING'
    }, '*');
  }

  /**
   * Handle PONG response from extension
   */
  private handlePong(data: any) {
    console.log('[ExtensionBridge] 🏓 Extension responded to ping');
    // Don't change status here - wait for CONNECTION_READY
  }

  /**
   * Handle CONNECTION_READY from extension
   */
  private handleConnectionReady(data: any) {
    console.log('[ExtensionBridge] ✅ Extension connected!', data);
    this.permissionMode = data?.permissionMode || 'ask';
    this.updateStatus('connected');

    // Show connection notification
    this.showConnectionNotification();
  }

  /**
   * Show connection notification to user
   */
  private showConnectionNotification() {
    // Dispatch custom event for UI to listen
    window.dispatchEvent(new CustomEvent('edgeai-extension-connected', {
      detail: {
        permissionMode: this.permissionMode
      }
    }));
  }

  /**
   * Handle search response
   */
  private handleSearchResponse(data: any) {
    const { requestId, results } = data;
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      console.warn('[ExtensionBridge] ⚠️ No pending request for:', requestId);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    console.log('[ExtensionBridge] ✅ Search completed:', results?.length || 0, 'results');
    pending.resolve({
      success: true,
      results: results || []
    });
  }

  /**
   * Handle search denied by user
   */
  private handleSearchDenied(data: any) {
    const { requestId, reason } = data;
    const pending = this.pendingRequests.get(requestId);

    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    console.log('[ExtensionBridge] ❌ Search denied:', reason);
    pending.reject(new Error(reason || 'Search request denied by user'));
  }

  /**
   * Handle search error
   */
  private handleSearchError(data: any) {
    const { requestId, error } = data;
    const pending = this.pendingRequests.get(requestId);

    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    console.error('[ExtensionBridge] ❌ Search error:', error);

    // Check if it's an extension reload error
    if (error && error.includes('Extension was reloaded')) {
      // Update status and trigger reconnection attempt
      this.updateStatus('disconnected');
      console.log('[ExtensionBridge] 🔄 Extension reloaded, attempting reconnection...');

      // Try to reconnect after a short delay
      setTimeout(() => {
        this.reconnect();
      }, 1000);

      pending.reject(new Error('Extension was reloaded. Please refresh the page to reconnect.'));
    } else {
      pending.reject(new Error(error || 'Search failed'));
    }
  }

  /**
   * Update connection status
   */
  private updateStatus(status: ExtensionConnectionStatus) {
    const oldStatus = this.status;
    this.status = status;

    if (oldStatus !== status) {
      console.log('[ExtensionBridge] Status changed:', oldStatus, '→', status);
      this.notifyListeners();
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.status);
      } catch (error) {
        console.error('[ExtensionBridge] Listener error:', error);
      }
    });
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(listener: (status: ExtensionConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current status
    listener(this.status);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current status
   */
  getStatus(): ExtensionConnectionStatus {
    return this.status;
  }

  /**
   * Check if extension is connected
   */
  isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Get current permission mode
   */
  getPermissionMode(): ExtensionPermissionMode {
    return this.permissionMode;
  }

  /**
   * Request search only (no extraction yet)
   */
  async searchOnly(query: string, maxResults: number = 10): Promise<ExtensionSearchResponse> {
    if (!this.isConnected()) {
      throw new Error('Extension not connected. Please install and enable the Edge.AI browser extension.');
    }

    const requestId = `search_only_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[ExtensionBridge] 🔍 Requesting search only:', query);

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Search request timeout (30s)'));
      }, 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      window.postMessage({
        source: 'edgeai-webapp',
        type: 'SEARCH_ONLY_REQUEST',
        data: {
          requestId,
          query,
          maxResults
        }
      }, '*');
    });
  }

  /**
   * Request extraction for specific URLs
   */
  async extractUrls(urls: string[]): Promise<ExtensionSearchResponse> {
    if (!this.isConnected()) {
      throw new Error('Extension not connected.');
    }

    const requestId = `extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[ExtensionBridge] 📄 Requesting extraction for:', urls.length, 'URLs');

    return new Promise((resolve, reject) => {
      // Setup longer timeout for extraction
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Extraction request timeout (60s)'));
      }, 60000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      window.postMessage({
        source: 'edgeai-webapp',
        type: 'EXTRACT_URLS_REQUEST',
        data: {
          requestId,
          urls
        }
      }, '*');
    });
  }

  /**
   * Request search from extension
   */
  async search(query: string, maxResults: number = 10): Promise<ExtensionSearchResponse> {
    if (!this.isConnected()) {
      throw new Error('Extension not connected. Please install and enable the Edge.AI browser extension.');
    }

    const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[ExtensionBridge] 🔍 Requesting search:', query);

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Search request timeout (60s)'));
      }, 60000);

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send search request
      window.postMessage({
        source: 'edgeai-webapp',
        type: 'SEARCH_REQUEST',
        data: {
          requestId,
          query,
          maxResults
        }
      }, '*');
    });
  }

  /**
   * Manually trigger connection check
   */
  reconnect() {
    console.log('[ExtensionBridge] 🔄 Reconnecting...');
    this.updateStatus('connecting');
    this.sendPing();
  }

  /**
   * Cleanup pending requests
   */
  cleanup() {
    this.pendingRequests.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('Bridge cleanup'));
    });
    this.pendingRequests.clear();
    this.listeners.clear();
  }
}

/**
 * Global singleton instance
 */
let bridgeInstance: ExtensionBridge | null = null;

/**
 * Get or create extension bridge instance
 */
export function getExtensionBridge(): ExtensionBridge {
  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    throw new Error('ExtensionBridge can only be used in browser environment');
  }

  if (!bridgeInstance) {
    bridgeInstance = new ExtensionBridge();
  }
  return bridgeInstance;
}

/**
 * Initialize extension bridge (creates new instance)
 */
export function initExtensionBridge(): ExtensionBridge {
  if (typeof window === 'undefined') {
    throw new Error('ExtensionBridge can only be used in browser environment');
  }

  if (bridgeInstance) {
    bridgeInstance.cleanup();
  }
  bridgeInstance = new ExtensionBridge();
  return bridgeInstance;
}

/**
 * Get extension bridge safely (returns null if not in browser)
 */
export function getExtensionBridgeSafe(): ExtensionBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return getExtensionBridge();
}

// Export singleton instance - initialize lazily
let _lazyBridge: ExtensionBridge | null = null;

export const extensionBridge = new Proxy({} as ExtensionBridge, {
  get(target, prop) {
    // Initialize on first access in browser
    if (typeof window !== 'undefined' && !_lazyBridge) {
      _lazyBridge = getExtensionBridge();
    }

    if (!_lazyBridge) {
      throw new Error('ExtensionBridge not available in SSR context');
    }

    return (_lazyBridge as any)[prop];
  }
});
