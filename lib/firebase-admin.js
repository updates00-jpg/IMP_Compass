// lib/firebase-admin.js
// Shared Firebase Admin SDK initialisation — single source of truth.
// All API routes import from here instead of duplicating initializeApp().

'use strict';

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');

function getFirebaseAdmin() {
  if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set');
    }

    initializeApp({
      credential: cert({
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
    });
  }

  return {
    messaging: getMessaging(),
    firestore: getFirestore(),
  };
}

module.exports = { getFirebaseAdmin };
