import { prisma } from "./db.server";
import webPush from "web-push";
import { VAPID_PUBLIC_KEY } from "./push-notifications";
import { z } from "zod";
import type { Topic } from "@prisma/client";

export const subscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

type TSubscription = z.infer<typeof subscriptionSchema>;

export async function saveSubscriptionToDb(props: {
  userId: string;
  subscription: TSubscription;
}) {
  const { userId, subscription } = props;
  const existingSubscription = await prisma.pushSubscription.findUnique({
    where: { endpoint: subscription.endpoint },
  });

  if (existingSubscription) {
    await prisma.pushSubscription.update({
      where: { id: existingSubscription.id },
      data: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userId,
      },
    });
  } else {
    await prisma.pushSubscription.create({
      data: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userId,
      },
    });
  }
}

webPush.setVapidDetails(
  "mailto:mail@example.com",
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

type PushPayload = {
  title: string;
  description: string;
  url?: string;
};

type PushMeta = {
  topic: Topic;
  listId: string;
  originUserId: string;
};

type PushPayloadAndMeta = PushPayload & PushMeta;

async function getSubscriptions(pushMeta: PushMeta) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      user: {
        AND: [
          {
            OR: [
              { listsOwned: { some: { id: pushMeta.listId } } },
              { listsMembered: { some: { id: pushMeta.listId } } },
            ],
          },
          {
            id: {
              not: pushMeta.originUserId,
            },
          },
          {
            notificationTopics: {
              some: {
                topic: pushMeta.topic,
              },
            },
          },
          {
            listNotifications: {
              some: { listId: pushMeta.listId },
            },
          },
        ],
      },
    },
  });

  return subscriptions;
}

export async function sendPushNotification(data: PushPayloadAndMeta) {
  const subscriptions = await getSubscriptions({
    topic: data.topic,
    listId: data.listId,
    originUserId: data.originUserId,
  });

  const payload: PushPayload = {
    title: data.title,
    description: data.description,
    url: data.url,
  };

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: "mailto:mail@example.com",
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY,
          },
          TTL: 24 * 60 * 60,
        }
      );
      console.info("Push notification sent successfully");
    } catch (error) {
      console.error("Error sending push notification:", error);
      await prisma.pushSubscription.delete({
        where: { endpoint: subscription.endpoint },
      });
      console.info("Removed invalid subscription:", subscription.endpoint);
    }
  }
}
