# MVP Trainer Pro

SaaS web/PWA para personal trainers. La app está pensada primero para celular, con acceso web responsive, Supabase real para auth/datos y Gemini real desde el backend local (`server.ts`).

## Stack

- React + Vite + TypeScript
- Express local en `server.ts`
- Supabase Auth + Postgres + RLS
- Gemini vía `GEMINI_API_KEY` o `GOOGLE_API_KEY`
- PWA básica con `public/manifest.webmanifest` y `public/sw.js`

## Configuración local

1. Instala dependencias:

```bash
npm install
```

2. Copia `.env.example` a `.env.local` y completa las claves reales:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
```

No subas `.env.local` ni claves reales a GitHub.

3. Verifica Supabase. Si falta alguna tabla/policy, ejecuta:

```text
supabase/migrations/20260701_beta_saas.sql
```

4. Levanta la app:

```bash
npm run dev
```

La app corre en `http://localhost:3000`.

## Revision visual aislada

Para revisar la interfaz en Google AI Studio u otro entorno externo sin conectar
Supabase, Stripe ni datos reales, abre:

```text
/?review=visual
```

Este modo usa los componentes reales de la app con clientes, agenda, rutinas,
dieta y pagos ficticios guardados solo en memoria. No requiere secretos. En AI
Studio se puede cerrar la ventana de variables de entorno; no se deben introducir
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ni credenciales de produccion para
una auditoria visual.

## Acceso al producto

La experiencia del producto es única: durante los primeros 21 días, el entrenador dispone de todas las funciones sin límites artificiales entre Free y PRO. Al finalizar la prueba, el trabajo permanece guardado pero las herramientas operativas se bloquean hasta activar una suscripción.

El acceso se resuelve desde el estado confirmado de la suscripción en Supabase. Un error temporal de red, una renovación de token o un valor nulo transitorio no deben degradar una cuenta confirmada ni conceder acceso a otra cuenta.

## Validación beta

Antes de beta real, probar:

- registro/login y sesión persistente
- crear, editar y archivar clientes
- generar, guardar y borrar rutina IA
- generar, guardar y borrar dieta IA
- registrar pagos básicos
- validar los 21 días de acceso completo y el bloqueo posterior
- comprobar que pagos históricos no cambien al pausar o finalizar clientes
- comprobar conflictos al crear, editar y reprogramar sesiones
- revisar móvil: 390x844, 414x896, 360x800 y desktop
- validar PWA sin errores permanentes de service worker
