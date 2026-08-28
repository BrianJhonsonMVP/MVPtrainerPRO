# UI QA Report - MVP Trainer Pro

Fecha: 2026-07-17

## Estado actual

Este reporte inicia el seguimiento de QA visual y funcional de la renovacion premium mobile-first. No representa cierre completo del rediseño; documenta la linea base y la Fase 1 completada.

## Validaciones ejecutadas

| Validacion | Resultado | Evidencia |
| --- | --- | --- |
| npm.cmd install | Paso | Dependencias al dia. |
| npm.cmd run lint | Paso | TypeScript sin errores. |
| npm.cmd run build | Paso | Build Vite + server completado fuera del sandbox. |
| npm.cmd run check:mojibake | Paso | No mojibake found. |
| Render body sin caracter danado | Paso | Edge headless no encontro `�` en DOM renderizado. |
| API health | Paso | `/api/health` respondio `{"status":"ok"}`. |

## Capturas baseline

| Pantalla | Viewport | Resultado | Archivo |
| --- | --- | --- | --- |
| Carga/Login inicial | 390 x 844 Android | Capturada | qa-screenshots/baseline/android-390x844.png |
| Carga/Login inicial | 414 x 896 iPhone | Capturada | qa-screenshots/baseline/iphone-414x896.png |
| Carga/Login inicial | 820 x 1180 iPad | Capturada | qa-screenshots/baseline/ipad-820x1180.png |
| Carga/Login inicial | 1440 x 900 Desktop | Capturada | qa-screenshots/baseline/desktop-1440x900.png |

## Fase 1 - Mojibake

### Problema encontrado

Se detectaron textos con caracteres de reemplazo en `src/App.tsx` y un comentario mojibake en `index.html`.

Ejemplos corregidos:

- `Iniciar sesi�n` -> `Iniciar sesión`
- `Contrase�a` -> `Contraseña`
- `Gesti�n` -> `Gestión`
- `Tel�fono` -> `Teléfono`
- `D�as` -> `Días`
- `�xito` -> `Éxito`
- `�Eliminar cliente?` -> `¿Eliminar cliente?`
- `ConfiguraciÃ³n PWA` -> `Configuración PWA`

### Correccion aplicada

- Se corrigieron textos y comentarios dañados sin cambiar logica de negocio.
- Se reemplazaron bullets rotos `�` en listas por guion simple para evitar simbolos dañados en mensajes y UI.
- Se agrego `scripts/check-mojibake.mjs`.
- Se agrego el script `check:mojibake` a `package.json`.

### Resultado

`npm.cmd run check:mojibake` pasa correctamente.

## Pendientes para siguientes fases

- Auditar dimensiones reales del logo y favicon.
- Reemplazar apple-touch-icon externo por asset local nitido.
- Consolidar tokens finales solicitados en CSS.
- Crear/refactorizar componentes compartidos.
- Rediseñar pantalla por pantalla con QA visual.
- Crear smoke tests e2e si se instala Playwright o se confirma herramienta compatible.
- Capturar pantallas autenticadas de dashboard, cliente, agenda, rutinas, dieta, pagos y cuenta.

## Confirmacion de negocio

En esta etapa no se modifico:

- Supabase.
- RLS.
- Autenticacion.
- Free/Premium.
- Contadores.
- IA Gemini.
- WhatsApp.
- Precios.
- Datos guardados.
