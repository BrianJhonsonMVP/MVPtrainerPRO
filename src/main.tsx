
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

/**
 * Registro seguro de Service Worker
 * Evita el error de "Origin Mismatch" en entornos de preview como AI Studio.
 */
const safeRegisterSW = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const swUrl = '/sw.js';
    const swOrigin = new URL(swUrl, window.location.origin).origin;
    
    // 1. Validar que el origen coincida estrictamente
    const isSameOrigin = swOrigin === window.location.origin;
    
    // 2. Detectar entornos de previsualización conocidos que bloquean SW
    const isPreview = 
      window.location.hostname.includes('googleusercontent.com') || 
      window.location.hostname.includes('aistudio.google') ||
      window.location.hostname.includes('localhost') && window.location.port === '0'; // Algunos sandboxes

    if (!isSameOrigin || isPreview) {
      console.warn("⚠️ Registro de ServiceWorker omitido: Entorno de previsualización o posible conflicto de origen detectado.", {
        hostname: window.location.hostname,
        isSameOrigin
      });
      
      // Intentar limpiar SW previos que puedan estar causando ruido
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        registration.unregister();
      }
      return;
    }

    // 3. Registro final con captura de errores
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swUrl)
        .then(reg => console.log('✅ SW registrado con éxito:', reg.scope))
        .catch(err => {
          // Si el error es de origen, no lo propagamos al thread principal
          if (err.name === 'SecurityError') {
            console.warn('🔇 Error de seguridad al registrar SW (silenciado):', err.message);
          } else {
            console.error('❌ Error al registrar SW:', err);
          }
        });
    });
  } catch (e) {
    console.warn("No se pudo procesar el registro del Service Worker:", e);
  }
};

safeRegisterSW();
