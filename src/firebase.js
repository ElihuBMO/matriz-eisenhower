// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBbsOICUZydws88NjXBO74s_QO1OGPjlNI",
  authDomain: "app-eisenhower.firebaseapp.com",
  projectId: "app-eisenhower",
  storageBucket: "app-eisenhower.firebasestorage.app",
  messagingSenderId: "250065034405",
  appId: "1:250065034405:web:774efe794ad7417322814c",
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar la Base de Datos (Firestore)
export const db = getFirestore(app);
