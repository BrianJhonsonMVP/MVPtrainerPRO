import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFiles = ['.env', '.env.local'];

const readEnv = () => {
  const values = {};
  for (const file of envFiles) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    for (const rawLine of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...values, ...process.env };
};

const env = readEnv();
const results = [];
const add = (name, ok, detail, blocking = true) => results.push({ name, ok, detail, blocking });
const configured = name => Boolean(env[name] && !/^(xxx|.*_xxx|replace_)/i.test(env[name]));

add('Supabase URL', configured('VITE_SUPABASE_URL'), 'Conexión principal de la aplicación');
add('Supabase publishable key', configured('VITE_SUPABASE_ANON_KEY'), 'Clave pública para Auth y datos');
add('RevenueCat iOS', configured('VITE_REVENUECAT_APPLE_API_KEY'), 'Necesaria para compras y restauración en App Store');
add('RevenueCat Android', configured('VITE_REVENUECAT_GOOGLE_API_KEY'), 'Necesaria para compras y restauración en Google Play');
add('Proyecto Android', fs.existsSync(path.join(root, 'android', 'app')), 'Proyecto nativo sincronizable');
add('Proyecto iOS', fs.existsSync(path.join(root, 'ios', 'App')), 'Proyecto nativo sincronizable');

for (const page of ['privacy.html', 'terms.html', 'support.html', 'delete-account.html']) {
  add(`Página ${page}`, fs.existsSync(path.join(root, 'public', page)), 'Documento requerido para publicación');
}

const checkOAuth = async () => {
  if (!configured('VITE_SUPABASE_URL') || !configured('VITE_SUPABASE_ANON_KEY')) return;
  try {
    const response = await fetch(`${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings = await response.json();
    add('Ingreso con Google', settings?.external?.google === true, 'Proveedor OAuth habilitado en Supabase');
    add('Ingreso con Facebook', settings?.external?.facebook === true, 'Proveedor OAuth habilitado en Supabase');
  } catch {
    add('Estado OAuth', false, 'No se pudo consultar Supabase; repite con conexión a internet', false);
  }
};

await checkOAuth();

const width = Math.max(...results.map(item => item.name.length));
for (const item of results) {
  const marker = item.ok ? '[OK]' : item.blocking ? '[FALTA]' : '[AVISO]';
  console.log(`${marker.padEnd(8)} ${item.name.padEnd(width)}  ${item.detail}`);
}

console.log('\nSecretos del backend que se verifican en Supabase, no en archivos cliente:');
console.log('- Mercado Pago: access token, firma webhook, montos PEN y URL pública.');
console.log('- RevenueCat: autorización del webhook.');

const blockers = results.filter(item => item.blocking && !item.ok);
if (blockers.length) {
  console.error(`\nPrevuelo incompleto: ${blockers.length} requisito(s) pendiente(s).`);
  process.exitCode = 1;
} else {
  console.log('\nPrevuelo local completo. Continúa con las pruebas sandbox de cada proveedor.');
}
