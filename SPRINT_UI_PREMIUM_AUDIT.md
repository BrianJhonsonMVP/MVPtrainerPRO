# Sprint UI Premium Audit - MVP Trainer Pro

Fecha: 2026-07-18

## Alcance

Sprint visual y de experiencia para elevar MVP Trainer Pro a una sensacion mas premium, fluida, mobile-first y usable en escritorio. Esta auditoria es el punto de partida obligatorio antes de hacer cambios masivos.

## Restricciones de producto

No se tocara en este sprint:

- Arquitectura general.
- Rutas funcionales.
- Supabase, tablas, RLS o datos.
- Autenticacion.
- Planes, precios, limites Free/PRO y contadores historicos.
- Prompts de IA ni logica de rutinas/dietas.
- Logica de pagos.
- Integraciones.
- Acciones y enlaces actuales de WhatsApp.
- Orden funcional de pantallas.

Los cambios permitidos son visuales: componentes reutilizables, motion, loaders, skeletons, botones, layout responsive, toasts y correcciones puntuales de texto/estilo.

## Estado del stack detectado

- React 19.2.0.
- Vite 6.4.1 en build actual.
- TypeScript 5.8.2.
- Tailwind CSS 3.4.17.
- Framer Motion 12.39.0 ya instalado y usado en `src/App.tsx`.
- Lucide React 0.555.0 es la libreria principal de iconos.
- Recharts 3.5.1 instalado.
- Supabase JS 2.97.0.
- Express 5.2.1.

No se detecto React Router. La navegacion principal usa estado local en `src/App.tsx` (`view`, `selectedClient`, `activeTab`, modales y rutas publicas puntuales por URL).

## Validacion previa

| Check | Resultado | Nota |
| --- | --- | --- |
| `npm.cmd run check:mojibake` | Paso | No encontro caracteres de reemplazo en los archivos cubiertos por el script. |
| `npm.cmd run lint` | Paso | `tsc --noEmit` sin errores. |
| `npm.cmd run build` | Paso con permisos completos | En sandbox fallo por permisos de Windows/OneDrive; con permisos completos compilo correctamente. |
| `/api/health` | Paso | `http://127.0.0.1:3000/api/health` respondio `{"status":"ok"}`. |
| Tests automatizados | No disponible | `package.json` no define script `test`. |

## Punto de restauracion

Git existe como carpeta de proyecto, pero `git` no esta disponible en el PATH de esta terminal. Para no bloquear el sprint, se creo un punto de restauracion local con copias de los archivos principales:

- `restore-points/ui-premium-20260718/App.tsx`
- `restore-points/ui-premium-20260718/index.css`
- `restore-points/ui-premium-20260718/package.json`

## Componentes actuales

### `src/App.tsx`

- `MVPBrandLogo`.
- `DevViewportSwitcher`.
- `LanguageSwitcher`.
- `ExerciseItem`.
- `UsageProgress`.
- `Toast`.
- `PaywallPro`.
- `PlanAIModal`.
- `ConfirmModal`.
- `AuthView`.
- `AccountView`.
- `ClientDetail`.
- `ClientFormModal`.
- Dashboard principal.
- Estado de carga inicial.
- Estado degradado de autenticacion.
- Overlay de reconexion.

### `src/components`

- `BrandingSettings`.
- `DailySchedule`.
- `DebugPanel`.
- `ErrorBoundary`.
- `PaymentCalendar`.
- `SupabaseSetupModal`.
- `TrainerLandingEditor`.
- `TrainerPublicPage`.

## Pantallas afectadas

- Login.
- Registro.
- Recuperacion/restablecimiento de clave.
- Splash y carga inicial.
- Dashboard.
- Nuevo cliente.
- Editar cliente.
- Perfil de cliente.
- Agenda de cliente.
- Rutinas.
- Dieta.
- Pagos.
- Calendario de pagos.
- Mi Cuenta.
- Paywall.
- Estados bloqueados PRO.
- Toasts y confirmaciones.

## Problemas encontrados

- El sistema centralizado de movimiento ya existe: tokens `100/140/220/300ms`, easing premium, `PageTransition`, `TabPanel`, `AccordionPanel` y `MotionChevron`.
- `PageTransition` ya esta conectado en login, dashboard, cliente, agenda, pagos y mi cuenta.
- Framer Motion ya cubre pantallas, tabs, modales, toasts, acordeones principales y botones reutilizables; quedan botones secundarios sueltos para barridos posteriores.
- Las pantallas principales usan una columna estrecha en desktop, dejando espacio vacio.
- Los botones son inconsistentes: algunos ocupan todo el ancho aunque son acciones secundarias.
- Las acciones de contacto siguen apareciendo en varios lugares como barras largas.
- Pagos funciona, pero visualmente se siente mas administrativo que premium.
- El sistema de toast existe, pero falta normalizarlo como sistema reutilizable con mejor posicion, duracion y semantica.
- El splash/loading ya tiene elementos base, pero falta formalizarlo como componente oficial con skeletons por tipo de contenido.
- Varias piezas visuales viven dentro de `src/App.tsx`, aumentando el riesgo de tocar logica por accidente.
- Algunos textos danados aun pueden existir fuera de lo cubierto por `check:mojibake`, especialmente en componentes separados antiguos.
- `DailySchedule` y `PaymentCalendar` todavia tienen copy fijo en espanol y deben revisarse durante las fases de idioma/visual sin cambiar su logica.

## Plan de trabajo por fase

1. Motion design: tokens, `PageTransition`, transiciones de tabs, modales, accordions, botones y tarjetas.
2. Splash/loading: formalizar `AppSplashScreen` y skeletons reutilizables.
3. Botones premium: crear sistema visual de botones sin cambiar acciones.
4. Contactos: compactar WhatsApp/Mensaje/Llamar preservando enlaces actuales.
5. Pagos: rediseno profundo visual usando solo datos existentes.
6. Responsive desktop: mejorar grids y max-widths sin alterar orden funcional.
7. Correcciones puntuales: registro, idioma visible, avatar, chips, scrollbar, logo y uso de naranja.
8. Toasts: sistema visual consistente para acciones existentes.
9. QA final: capturas por viewport, build, lint, mojibake y reporte final. Video/GIF queda fuera del alcance por decision del usuario.

## Riesgos funcionales

- `src/App.tsx` concentra demasiada UI y logica; las ediciones deben ser pequenas y verificadas por fase.
- Los modales y tabs dependen de estado local; las animaciones no deben desmontar formularios ni reiniciar datos.
- Paywall y botones PRO no deben cambiar reglas de acceso.
- Contact buttons deben conservar exactamente los links actuales a WhatsApp/llamada/mensaje.
- Pagos debe conservar los mismos campos y acciones, solo reorganizar visualmente.
- El selector local de dispositivos debe seguir siendo solo herramienta de desarrollo local.
- Las pruebas de motion requieren navegador real o captura, no solo build. La evidencia en video no es obligatoria para este sprint porque el usuario la validara manualmente.

## Criterio para avanzar

No avanzar a una fase siguiente si se rompe:

- Login.
- Navegacion principal.
- Clientes.
- Rutinas.
- Dietas.
- Pagos.
- WhatsApp.
- Limites Free/PRO.
- Supabase.

Cada fase debe cerrar con validacion tecnica y evidencia visual proporcional.
