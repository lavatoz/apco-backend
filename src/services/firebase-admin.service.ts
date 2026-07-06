import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging as getAdminMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env';

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
let privateKey = env.FIREBASE_PRIVATE_KEY;

const isProd = env.NODE_ENV === 'production';
const hasCredentials = !!(projectId && clientEmail && privateKey);

let isMockMode = false;
let messagingMock: any = null;

// Temporary startup logging
console.log('Firebase Configuration Status at Startup:');
console.log(`- FIREBASE_PROJECT_ID loaded: ${projectId ? 'YES' : 'NO'}`);
console.log(`- FIREBASE_CLIENT_EMAIL loaded: ${clientEmail ? 'YES' : 'NO'}`);
console.log(`- FIREBASE_PRIVATE_KEY loaded: ${privateKey ? 'YES' : 'NO'}`);

// Define mock messaging helper
const createMessagingMock = () => ({
  send: async (message: any) => {
    console.log('[MOCK FCM] Sending message to token:', message.token);
    if (message.token && (message.token.includes('invalid') || message.token.includes('unregistered'))) {
      const error: any = new Error('Requested entity was not found.');
      error.code = 'messaging/registration-token-not-registered';
      throw error;
    }
    return 'mock-message-id-' + Math.random().toString(36).substring(2, 9);
  },
  sendEach: async (messages: any[]) => {
    console.log('[MOCK FCM] Sending batch of messages, count:', messages.length);
    const responses = messages.map((m) => {
      if (m.token && (m.token.includes('invalid') || m.token.includes('unregistered'))) {
        const error: any = new Error('Requested entity was not found.');
        error.code = 'messaging/registration-token-not-registered';
        return {
          success: false,
          error,
        };
      }
      return {
        success: true,
        messageId: 'mock-message-id-' + Math.random().toString(36).substring(2, 9),
      };
    });
    const successCount = responses.filter((r) => r.success).length;
    const failureCount = responses.length - successCount;
    return {
      responses,
      successCount,
      failureCount,
    };
  },
  sendEachForMulticast: async (message: any) => {
    console.log('[MOCK FCM] Sending multicast message to tokens:', message.tokens);
    const tokens = message.tokens || [];
    const responses = tokens.map((token: string) => {
      if (token && (token.includes('invalid') || token.includes('unregistered'))) {
        const error: any = new Error('Requested entity was not found.');
        error.code = 'messaging/registration-token-not-registered';
        return {
          success: false,
          error,
        };
      }
      return {
        success: true,
        messageId: 'mock-message-id-' + Math.random().toString(36).substring(2, 9),
      };
    });
    const successCount = responses.filter((r: any) => r.success).length;
    const failureCount = responses.length - successCount;
    return {
      responses,
      successCount,
      failureCount,
    };
  },
});

if (!hasCredentials) {
  if (isProd) {
    throw new Error(
      'Missing Firebase credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be configured in production.'
    );
  } else {
    isMockMode = true;
    const missing: string[] = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
    
    console.warn(
      `⚠️ Firebase Admin entered MOCK MODE. Reason: Incomplete or missing credentials (missing: ${missing.join(', ')}).`
    );
    messagingMock = createMessagingMock();
  }
} else {
  try {
    let replacedEscapedNewlines = false;
    // Format private key correctly (replace escaped newlines if any)
    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      replacedEscapedNewlines = true;
    }

    // Diagnostics
    if (privateKey) {
      console.log('--- Firebase Private Key Diagnostics ---');
      console.log(`- Contains BEGIN header: ${privateKey.includes('-----BEGIN PRIVATE KEY-----')}`);
      console.log(`- Contains END footer: ${privateKey.includes('-----END PRIVATE KEY-----')}`);
      console.log(`- Replaced escaped \\n characters: ${replacedEscapedNewlines}`);
      console.log(`- Total newline characters count: ${(privateKey.match(/\n/g) || []).length}`);
      console.log(`- First 30 characters: "${privateKey.substring(0, 30)}"`);
      console.log(`- Last 30 characters: "${privateKey.substring(privateKey.length - 30)}"`);
      console.log('----------------------------------------');
    }

    // Initialize SDK exactly once
    const apps = getApps();
    if (apps.length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    console.log('✅ Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    if (isProd) {
      console.error('❌ Failed to initialize Firebase Admin SDK in production:', error);
      console.error(error.stack || error);
      throw error;
    } else {
      isMockMode = true;
      console.warn(
        `⚠️ Firebase Admin initialization failure: ${error.message}. Falling back to MOCK MODE.`
      );
      console.error('Full stack trace:', error.stack || error);
      messagingMock = createMessagingMock();
    }
  }
}

export class FirebaseAdminService {
  static getMessaging() {
    if (isMockMode) {
      return messagingMock;
    }
    return getAdminMessaging();
  }

  static isMock() {
    return isMockMode;
  }
}
