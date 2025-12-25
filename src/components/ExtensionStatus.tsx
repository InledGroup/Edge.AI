/**
 * Extension Status Notification Component
 * Shows when the browser extension connects
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getExtensionBridgeSafe, type ExtensionConnectionStatus } from '../lib/extension-bridge';

export function ExtensionStatus() {
  const [status, setStatus] = useState<ExtensionConnectionStatus>('disconnected');
  const [showNotification, setShowNotification] = useState(false);
  const [permissionMode, setPermissionMode] = useState<'ask' | 'permissive'>('ask');

  useEffect(() => {
    // Only run in browser
    const bridge = getExtensionBridgeSafe();
    if (!bridge) {
      console.warn('[ExtensionStatus] Not in browser context');
      return;
    }

    // Subscribe to status changes
    const unsubscribe = bridge.onStatusChange((newStatus) => {
      setStatus(newStatus);

      // Show notification when connected
      if (newStatus === 'connected') {
        setPermissionMode(bridge.getPermissionMode());
        setShowNotification(true);

        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowNotification(false);
        }, 5000);
      }
    });

    // Listen for custom connection event
    const handleConnectionEvent = (event: CustomEvent) => {
      console.log('[ExtensionStatus] Connection event received', event.detail);
    };

    window.addEventListener('edgeai-extension-connected', handleConnectionEvent as EventListener);

    return () => {
      unsubscribe();
      window.removeEventListener('edgeai-extension-connected', handleConnectionEvent as EventListener);
    };
  }, []);

  // Don't render anything if not showing notification
  if (!showNotification) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'linear-gradient(135deg, #212121 0%, #2f2f2f 100%)',
        color: 'white',
        padding: '16px 20px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(4, 251, 0, 0.3)',
        zIndex: 10000,
        maxWidth: '400px',
        animation: 'slideInRight 0.3s ease-out',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '32px', height: '32px' }}><img src="https://hosted.inled.es/inledai.png" alt="Edge.AI" width="48" height="auto"></img></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
            Extensión conectada
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            {permissionMode === 'permissive' 
              ? '✅ Modo permisivo activado'
              : '🔐 Se pedirá confirmación para búsquedas'
            }
          </div>
        </div>
        <button
          onClick={() => setShowNotification(false)}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            color: 'white',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
