import { registerSW } from 'virtual:pwa-register';

if (typeof window !== 'undefined') {
  console.log('🚀 Intentando registrar Service Worker (PWA Mode)...');
  
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('✨ Nueva versión disponible');
      if (confirm('Nueva versión disponible. ¿Deseas actualizar?')) {
        window.location.reload();
      }
    },
    onOfflineReady() {
      console.log('📱 Aplicación lista para trabajar offline');
    },
    onRegistered(r) {
      console.log('✅ Service Worker registrado con éxito');
      if (r) {
        // Forzar actualización cada hora
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('❌ Error al registrar el Service Worker:', error);
    }
  });
}

