// frontend/src/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Configuración del Web SDK de Firebase para el proyecto LLYC Adtech Pruebas
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCx-PlaceholderKeyForCompilationOnly",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "llyc-adtech-pruebas.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "llyc-adtech-pruebas",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "llyc-adtech-pruebas.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1076786873783",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1076786873783:web:default"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar y exportar servicios de Auth
export const auth = getAuth(app);

// Configurar el proveedor de Google OAuth
export const googleProvider = new GoogleAuthProvider();

// Fuerza a Google a priorizar o sugerir cuentas bajo el dominio corporativo llyc.global en el selector
googleProvider.setCustomParameters({ hd: 'llyc.global' });
