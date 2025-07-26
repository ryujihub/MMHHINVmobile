import 'firebase/compat/analytics';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyABZw1Jk2WdOFqmp2ww8lYV0DBdcVR50GI",
  authDomain: "hardwareinventory-65123.firebaseapp.com",
  databaseURL: "https://hardwareinventory-65123-default-rtdb.firebaseio.com",
  projectId: "hardwareinventory-65123",
  storageBucket: "hardwareinventory-65123.firebasestorage.app",
  messagingSenderId: "1006715726520",
  appId: "1:1006715726520:web:13897a36fb527e8194224d",
  measurementId: "G-Y4ZHE3GBN5"
};

// Initialize Firebase
let app;
try {
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
  } else {
    app = firebase.app();
    console.log('Firebase already initialized');
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Get Auth and Firestore instances
const auth = firebase.auth();
const db = firebase.firestore();

// Authentication functions
export const signIn = async (email, password) => {
  try {
    console.log('Starting sign in process...');
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    console.log('Sign in successful:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const signUp = async (email, password) => {
  try {
    console.log('Starting sign up process...');
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    console.log('Sign up successful:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    await auth.signOut();
    console.log('Sign out successful');
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

// Test auth state
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('Auth state changed: User is signed in', user.uid);
  } else {
    console.log('Auth state changed: User is signed out');
  }
});

// Test database connection
export const testDatabaseConnection = async () => {
  try {
    const testDoc = await db.collection('test').doc('connection-test').get();
    console.log('Database connection successful!');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

export { auth, db };
