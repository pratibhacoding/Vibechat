import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    initializeAuth,
    type Persistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const getReactNativePersistence = (
  require('@firebase/auth') as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

const firebaseConfig = {
  apiKey: 'AIzaSyBOL8J98Q3KDQ0GQgJpP9K56hyFaDVvRmY',
  authDomain: 'vibe-800e9.firebaseapp.com',
  projectId: 'vibe-800e9',
  storageBucket: 'vibe-800e9.firebasestorage.app',
  messagingSenderId: '519365558273',
  appId: '1:519365558273:web:276fb0f14604cb1f308000',
};

const app = initializeApp(firebaseConfig);

export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;