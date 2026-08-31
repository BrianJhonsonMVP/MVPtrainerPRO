# MVP Trainer Pro: runbook de lanzamiento

Este documento separa lo que ya vive en el codigo de lo que requiere cuentas, llaves o aprobaciones externas.

Antes de preparar cualquier build de tienda, ejecutar:

```bash
npm run check:launch
```

El comando no imprime secretos. Comprueba la configuración cliente, los proyectos móviles, las páginas legales y el estado público de Google/Facebook.

## Arquitectura de cobro

- Web: Mercado Pago Suscripciones crea el checkout. Su webhook confirma el estado en `public.subscriptions`.
- Android/iOS: Google Play y App Store cobran mediante RevenueCat. Su webhook actualiza la misma tabla.
- Aplicacion: nunca concede PRO por una respuesta del checkout. Solo usa el estado confirmado de Supabase o, dentro del binario nativo, el entitlement `pro` confirmado por la tienda.
- Los webhooks se registran primero en `billing_provider_events`; el identificador externo evita procesarlos dos veces.

## Backend Supabase

1. Aplicar `supabase/migrations/202608300002_unified_billing.sql`.
2. Desplegar `create-mercadopago-subscription` y `delete-account` con verificacion JWT.
3. Desplegar `mercadopago-webhook` y `revenuecat-webhook` sin JWT de Supabase; ambos verifican su propia firma o secreto.
4. Configurar secretos:

```text
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_WEBHOOK_SECRET
MVP_PRICE_MONTHLY_USD=14.99
MVP_PRICE_SEMIANNUAL_USD=79.99
MVP_PRICE_YEARLY_USD=149.99
MERCADOPAGO_CHARGE_CURRENCY=PEN
MERCADOPAGO_CHARGE_MONTHLY
MERCADOPAGO_CHARGE_SEMIANNUAL
MERCADOPAGO_CHARGE_YEARLY
APP_PUBLIC_URL
APP_ALLOWED_ORIGINS
REVENUECAT_WEBHOOK_AUTHORIZATION
```

5. Autorizar en Supabase Auth estos redirects:

```text
https://app.mvptrainerpro.com/
com.mvptrainer.pro://auth/callback
```

## Mercado Pago web

1. Crear una aplicacion de produccion de Mercado Pago Peru.
2. Mantener como lista oficial USD 14.99, USD 79.99 y USD 149.99. Si Mercado Pago liquida en PEN, configurar los importes locales exactos que mostrará antes de confirmar. Si se crean planes de suscripcion, configurar sus IDs opcionales `MERCADOPAGO_PLAN_*_ID`.
3. Registrar el webhook:

```text
https://brbkfmshwwehidsdqijl.supabase.co/functions/v1/mercadopago-webhook
```

4. Guardar la firma secreta del webhook en Supabase.
5. Probar alta, renovacion, pago rechazado, cancelacion, notificacion duplicada y retorno al sitio.

## RevenueCat y tiendas

1. Crear las apps con bundle/package `com.mvptrainer.pro`.
2. Crear los productos mensual, semestral y anual en App Store Connect y Google Play Console.
3. Importarlos a RevenueCat, asociarlos a un offering vigente y al entitlement exacto `pro`.
4. Configurar el webhook de RevenueCat:

```text
https://brbkfmshwwehidsdqijl.supabase.co/functions/v1/revenuecat-webhook
```

5. Usar en RevenueCat el mismo header Authorization almacenado como `REVENUECAT_WEBHOOK_AUTHORIZATION`.
6. Configurar `VITE_REVENUECAT_APPLE_API_KEY` y `VITE_REVENUECAT_GOOGLE_API_KEY` antes del build.
7. Validar compra, restauracion, renovacion, cancelacion, expiracion y problema de cobro con cuentas sandbox.

## Compilacion movil

```bash
npm install
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Android puede compilarse desde Android Studio. iOS requiere macOS, Xcode, equipo de firma y Apple Developer Program. Los iconos y splash de marca ya se generan desde `resources/`.

## Publicacion y cumplimiento

- Publicar `privacy.html`, `terms.html`, `support.html` y `delete-account.html` bajo el dominio final.
- Activar y monitorear `support@mvptrainerpro.com` antes de enviar a revision.
- Completar fichas de privacidad, Data Safety, capturas, clasificacion de edad y datos del equipo revisor.
- La eliminacion desde Cuenta borra datos y cuenta. Una suscripcion de tienda debe cancelarse desde la tienda; la interfaz abre su administracion.
- No publicar hasta que el dominio use HTTPS, `/api/health` tenga monitoreo y exista una copia de seguridad verificada.

## Matriz de salida obligatoria

- Registro por email, Google y Facebook en web, Android e iPhone.
- Sesion restaurada tras cerrar y abrir la app.
- Alta y edicion de cliente, agenda, rutina, dieta, pagos y perfil publico.
- Trial de 21 dias, bloqueo al expirar, compra y restauracion.
- Modo sin red, red lenta, token renovado y webhook repetido sin degradar PRO a Free.
- Borrado de cuenta, enlaces legales, accesibilidad, telefono pequeno y tablet.
- Build web, Android release y archivo iOS sin errores de consola ni secretos privados en el binario.
