# UI Redesign Audit - MVP Trainer Pro

Fecha: 2026-07-17

## Alcance

Auditoria inicial para la renovacion visual premium mobile-first de MVP Trainer Pro. Esta linea base preserva la logica existente y registra el estado antes de nuevas modificaciones visuales masivas.

## Restricciones respetadas

- No se modifico arquitectura.
- No se modificaron rutas.
- No se modifico Supabase, tablas, RLS ni datos.
- No se modifico autenticacion.
- No se modifico logica Free/Premium ni contadores.
- No se modificaron funciones de IA.
- No se modifico comportamiento de WhatsApp.

## Stack detectado

- React 19.2.0
- Vite 6.2.0
- TypeScript 5.8.2
- Tailwind CSS 3.4.17
- Framer Motion 12.39.0
- Lucide React 0.555.0
- Supabase JS 2.97.0
- Express 5.2.1
- Gemini via @google/genai 1.30.0

## Scripts disponibles

- npm.cmd run dev: inicia server.ts con tsx.
- npm.cmd run build: compila Vite y empaqueta server.ts.
- npm.cmd run lint: ejecuta tsc --noEmit.
- No existe script de tests automatizados en package.json al iniciar esta auditoria.

## Validacion inicial

| Comando | Resultado | Nota |
| --- | --- | --- |
| npm.cmd install | Paso | Dependencias al dia. NPM aviso de install scripts pendientes por allow-scripts. |
| npm.cmd run lint | Paso | Typecheck sin errores. |
| npm.cmd run build | Paso con permisos elevados | En sandbox fallo por acceso denegado a vite.config.ts; fuera del sandbox compilo correctamente. |
| GET /api/health | Paso | http://127.0.0.1:3000/api/health respondio {"status":"ok"}. |
| Tests | No disponible | package.json no define script test. |

## Capturas baseline

Se generaron capturas limpias con Edge headless usando `?dev_preview=1` para ocultar la herramienta local de viewport.

| Viewport | Archivo |
| --- | --- |
| Android 390 x 844 | qa-screenshots/baseline/android-390x844.png |
| iPhone 414 x 896 | qa-screenshots/baseline/iphone-414x896.png |
| iPad 820 x 1180 | qa-screenshots/baseline/ipad-820x1180.png |
| Desktop 1440 x 900 | qa-screenshots/baseline/desktop-1440x900.png |

## Pantallas y componentes encontrados

### App.tsx

- DevViewportSwitcher
- ExerciseItem
- UsageBar
- Toast
- PaywallPro
- PlanAIModal
- ConfirmModal
- AuthView
- AccountView
- ClientDetail view dentro de App.tsx
- ClientFormModal
- Dashboard principal
- Vista de cliente
- Vista de cuenta
- Vista de agenda diaria
- Vista de pagos/calendario
- Modales de cliente, IA, confirmacion y paywall

### Componentes separados

- BrandingSettings
- DailySchedule
- DebugPanel
- ErrorBoundary
- PaymentCalendar
- SupabaseSetupModal
- TrainerLandingEditor
- TrainerPublicPage

## Estado visual inicial por pantalla

| Pantalla | Estado inicial | Riesgo visual |
| --- | --- | --- |
| Login | Redisenado parcialmente; requiere validacion mobile real y limpieza de mojibake. | Alto |
| Registro | Redisenado parcialmente; debe eliminar copy de limitaciones Free en registro. | Alto |
| Dashboard | Tiene nuevo sistema visual parcial; aun requiere jerarquia premium consistente. | Medio-Alto |
| Nuevo cliente | Modal funcional; necesita sheet mobile, sticky footer/header y campos mas comodos. | Alto |
| Itinerario | Bloqueo premium necesita estado refinado y menos espacio vacio. | Medio |
| Paywall Premium | Visual parcial; requiere pulido, motion y evitar estilo agresivo/casino. | Alto |
| Perfil cliente | Funcional; header, contacto y tabs requieren sistema compartido. | Medio-Alto |
| Agenda | Funcional; requiere reducir vacio y mejorar accion integrada. | Medio |
| Rutinas | Funcional; requiere empty states, cards y accordions consistentes. | Medio-Alto |
| Dieta | Funcional; requiere jerarquia y consistencia visual con rutinas. | Medio-Alto |
| Pagos | Funcional; debe evitar botones gigantes y compactar contacto. | Alto |
| Mi cuenta | Tiene usage bars; requiere coherencia visual y limpieza de colores residuales. | Medio |
| Personalizacion bloqueada | Requiere locked state refinado. | Medio |
| Pagina publica bloqueada | Requiere locked state refinado. | Medio |
| Modales/estados | Mezcla estilos viejos y nuevos; requiere componentes compartidos. | Alto |

## Hallazgos de codificacion

- `index.html` tiene `<meta charset="UTF-8" />` correcto.
- Se detecta mojibake visible en codigo. Ejemplo observado: `D�as de Entrenamiento` en `src/App.tsx`.
- El comentario de `index.html` aparece como `ConfiguraciÃ³n PWA`, senal de texto guardado con codificacion danada.
- Se necesita script automatizado `scripts/check-mojibake.mjs` para bloquear regresiones.

## Activos detectados

- `public/brand/mvp-trainer-pro-logo.png` existe y pesa 62961 bytes.
- `public/sw.js` existe.
- No se detectaron multiples assets visuales locales adicionales en `public`.
- Se debe auditar tamano nativo del logo contra tamano renderizado antes de escalarlo mas.

## Riesgos base antes del rediseño

- Gran parte de la UI vive en un solo archivo (`src/App.tsx`), lo que aumenta riesgo de estilos duplicados.
- No hay tests e2e ni visual QA formal en package.json.
- El build genera warning de chunk grande: `dist/assets/index-*.js` supera 500 kB.
- El entorno Windows/OneDrive puede producir errores falsos de permisos en sandbox; repetir validaciones criticas con permisos elevados cuando sea necesario.
- El selector local de viewports es solo herramienta dev y no debe entrar como feature de producto.

## Proxima fase permitida

Fase 1: corregir mojibake y crear `scripts/check-mojibake.mjs` antes de avanzar a cambios visuales profundos.
