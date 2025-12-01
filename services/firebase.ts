import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
// PARA QUE LA APP FUNCIONE:
// 1. Ve a https://console.firebase.google.com/
// 2. Crea un proyecto nuevo.
// 3. Agrega una "Web App" (ícono de </>).
// 4. Copia las credenciales que te da y pégalas abajo.

const firebaseConfig = {
  // Reemplaza esto con tus datos reales de Firebase Console
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_ID",
  appId: "TU_APP_ID"
};

// Inicialización segura para evitar errores si no hay config
let app;
let auth;
let db;

try {
  // Si no has configurado las llaves, esto fallará silenciosamente
  // para permitir que la UI cargue (aunque no guardará datos)
  if (firebaseConfig.apiKey !== "TU_API_KEY_AQUI") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase inicializado correctamente");
  } else {
    console.warn("⚠️ FALTA CONFIGURAR FIREBASE: Edita services/firebase.ts con tus credenciales.");
  }
} catch (e) {
  console.error("Error inicializando Firebase:", e);
}

export { auth, db };
