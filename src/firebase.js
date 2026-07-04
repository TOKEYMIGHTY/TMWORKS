import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBXMLNJWxU7JNh7Mt3gXttHEPcRCrURPKY",
  authDomain: "tokey-mighty-works.firebaseapp.com",
  projectId: "tokey-mighty-works",
  storageBucket: "tokey-mighty-works.firebasestorage.app",
  messagingSenderId: "26313503085",
  appId: "1:26313503085:web:e9d5aa32030b036c0aaa64",
  measurementId: "G-CL7H71Y4QB",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(app) : null));

if (typeof window !== "undefined") {
  try {
    const key = "tmworks_firebase_config";
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(firebaseConfig));
    }
  } catch (error) {
    console.warn("Firebase config could not be stored locally:", error);
  }
}

export {
  app,
  analyticsPromise,
  db,
  firebaseConfig,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence,
};

export default app;
