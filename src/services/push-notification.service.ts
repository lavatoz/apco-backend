import { prisma } from '../config/database';
import { FirebaseAdminService } from './firebase-admin.service';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

class PushNotificationServiceImpl {
  /**
   * Sends a push notification to all active devices of a single user
   */
  async sendToUser(userId: string, payload: PushNotificationPayload): Promise<void> {
    console.log(`[FCM-DIAGNOSTIC] sendToUser invoked for userId: ${userId}`);
    console.log(`[FCM-DIAGNOSTIC] Payload:`, JSON.stringify(payload));
    try {
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      console.log(`[FCM-DIAGNOSTIC] Query result: Found ${deviceTokens.length} device token(s) in DB for userId: ${userId}`);

      if (deviceTokens.length === 0) {
        console.log(`[FCM-DIAGNOSTIC] No tokens found, aborting push notification dispatch.`);
        return;
      }

      const tokens = deviceTokens.map((dt) => dt.token);
      console.log(`[FCM-DIAGNOSTIC] Tokens array:`, JSON.stringify(tokens));
      await this.sendToTokens(tokens, payload);
    } catch (error) {
      console.error(`[FCM] Error in sendToUser for user ID ${userId}:`, error);
    }
  }

  /**
   * Sends a push notification to all active devices of multiple users
   */
  async sendToUsers(userIds: string[], payload: PushNotificationPayload): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    try {
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });

      if (deviceTokens.length === 0) {
        return;
      }

      const tokens = deviceTokens.map((dt) => dt.token);
      await this.sendToTokens(tokens, payload);
    } catch (error) {
      console.error(`[FCM] Error in sendToUsers:`, error);
    }
  }

  /**
   * Sends a push notification to a specific Firebase topic
   */
  async sendToTopic(topic: string, payload: PushNotificationPayload): Promise<void> {
    try {
      const messaging = FirebaseAdminService.getMessaging();
      const message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      };
      await messaging.send(message);
    } catch (error) {
      console.error(`[FCM] Failed to send push notification to topic ${topic}:`, error);
    }
  }

  /**
   * Helper to send push notifications to a list of tokens in batches
   */
  private async sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<void> {
    const messaging = FirebaseAdminService.getMessaging();
    console.log(`[FCM-DIAGNOSTIC] sendToTokens invoked with ${tokens.length} token(s).`);
    console.log(`[FCM-DIAGNOSTIC] FirebaseAdminService isMock: ${FirebaseAdminService.isMock()}`);
    const invalidCodes = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ];

    // Split tokens into chunks of 500 (FCM sendEach limit)
    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const messages = chunk.map((token) => ({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      }));

      try {
        console.log(`[FCM-DIAGNOSTIC] Invoking messaging.sendEach for chunk of size ${chunk.length}...`);
        const response = await messaging.sendEach(messages);
        console.log(`[FCM-DIAGNOSTIC] Firebase sendEach response: Successes: ${response.successCount}, Failures: ${response.failureCount}`);

        // Handle responses and cleanup invalid/unregistered tokens
        for (let idx = 0; idx < response.responses.length; idx++) {
          const res = response.responses[idx];
          const token = chunk[idx];
          if (res.success) {
            console.log(`[FCM-DIAGNOSTIC] Token ${token} successfully sent. Message ID: ${res.messageId}`);
          } else {
            const errorCode = res.error?.code;
            const errorMessage = res.error?.message;
            console.error(`[FCM-DIAGNOSTIC] Token ${token} failed. Error Code: "${errorCode}", Error Message: "${errorMessage}"`);

            if (
              errorCode &&
              (invalidCodes.includes(errorCode) ||
              errorMessage?.includes('not-registered') ||
              errorMessage?.includes('entity was not found'))
            ) {
              console.log(`[FCM] Removing invalid/unregistered token from DB: ${token}`);
              await prisma.deviceToken.delete({
                where: { token },
              }).catch((err) => {
                console.error(`[FCM] Failed to delete invalid token from DB: ${token}`, err);
              });
            }
          }
        }
      } catch (error: any) {
        console.error('[FCM-DIAGNOSTIC] Exception thrown during messaging.sendEach:', error.message || error);
        console.error(error.stack || error);
      }
    }
  }
}

export const PushNotificationService = new PushNotificationServiceImpl();
