import { Topic, type UserTopic } from "@prisma/client";
import {
  Form,
  useLoaderData,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { prisma } from "~/utils/db.server";
import { useBrowserPermission } from "~/utils/push-notifications";
import { subscribeToPush } from "~/utils/push-notifications";
import { getUserIdOrThrow } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserIdOrThrow(request);
  let notificationTopics: UserTopic[] = [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationTopics: true },
  });
  if (user) {
    notificationTopics = user.notificationTopics;
  }
  const subscription = await prisma.pushSubscription.findFirst({
    where: {
      userId,
    },
    select: {
      userId: true,
    },
  });
  return { notificationTopics, hasSubscription: subscription ? true : false };
}

const topicSchema = z.union([
  z.object({ intent: z.literal("disable-all-topics") }),
  z.object({
    intent: z.literal("toggle-topic"),
    topic: z.nativeEnum(Topic),
    enabled: z.string().transform((v) => v === "true"),
  }),
]);

export async function action({ request }: LoaderFunctionArgs) {
  const userId = await getUserIdOrThrow(request);
  const formData = await request.formData();
  const body = Object.fromEntries(formData);
  const check = topicSchema.safeParse(body);
  if (!check.success) {
    return new Response("value not allowed", { status: 422 });
  }
  const { intent } = check.data;

  if (intent === "disable-all-topics") {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        notificationTopics: {
          deleteMany: {},
        },
      },
    });
    return new Response(null, { status: 200 });
  } else if (intent === "toggle-topic") {
    const { topic, enabled } = check.data;
    if (enabled) {
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          notificationTopics: {
            create: { topic },
          },
        },
      });
    } else {
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          notificationTopics: {
            delete: { userId_topic: { userId, topic } },
          },
        },
      });
    }
    return new Response(null, { status: 200 });
  } else {
    return new Response("value not allowed", { status: 422 });
  }
}

function TopicCheckbox(props: {
  topic: Topic;
  label: string;
  disabled?: boolean;
}) {
  const { notificationTopics } = useLoaderData<typeof loader>();
  if (!notificationTopics) return null;
  const enabled = notificationTopics.some(({ topic }) => topic === props.topic);
  return (
    <Form method="POST">
      <label className="flex items-center">
        <span className="flex-1 text-left">{props.label}</span>
        <input type="hidden" name="intent" value="toggle-topic" />
        <input type="hidden" name="topic" value={props.topic} />
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "false" : "true"}
        />
        <button className="border p-1 rounded-md" disabled={props.disabled}>
          {enabled ? "✅" : "🚫"}
        </button>
      </label>
    </Form>
  );
}

function NotificationTopics(props: { disabled?: boolean }) {
  return (
    <div className="max-w-xs mx-auto space-y-2 border rounded-md p-4">
      <TopicCheckbox
        topic="JOIN_LIST"
        label="List joins"
        disabled={props.disabled}
      />
      <TopicCheckbox
        topic="NEW_ITEM"
        label="New task added"
        disabled={props.disabled}
      />
      <TopicCheckbox
        topic="ITEM_DONE"
        label="Task marked as done"
        disabled={props.disabled}
      />
      <TopicCheckbox
        topic="ITEM_UNDONE"
        label="Task marked as undone"
        disabled={props.disabled}
      />
      <TopicCheckbox
        topic="ITEM_UPDATED"
        label="Task name updated"
        disabled={props.disabled}
      />
      <TopicCheckbox
        topic="ITEM_DELETED"
        label="Task deleted"
        disabled={props.disabled}
      />
    </div>
  );
}

export default function Settings() {
  const { notificationTopics, hasSubscription } =
    useLoaderData<typeof loader>();

  const { revalidate } = useRevalidator();

  const browserPermission = useBrowserPermission();

  return (
    <div>
      <h1 className="text-center text-2xl">Settings</h1>
      <div className="my-5" />
      {browserPermission === null ? (
        <p className="text-center">
          Checking browser notification permission...
        </p>
      ) : browserPermission === "unsupported" ? (
        <p className="text-center">Notifications not supported.</p>
      ) : browserPermission === "denied" ? (
        <p className="text-center">
          Notifications are blocked on browser-level. You have to reset this
          setting on browser-level to use notifications.
        </p>
      ) : (
        <div className="text-center">
          {browserPermission === "granted" && hasSubscription ? (
            <p className="text-sm">Notifications are enabled.</p>
          ) : (
            <p className="text-sm">
              Enable notifications to get informed about changes in shared
              lists.
            </p>
          )}
          <div className="my-5" />
          {browserPermission === "granted" && hasSubscription ? (
            <Form method="POST" preventScrollReset={true}>
              <input type="hidden" name="intent" value="disable-all-topics" />
              <button className="border p-2 rounded-md">
                {notificationTopics.length === 0
                  ? "All topics disabled 🚫"
                  : "Disable all topics 🚫"}
              </button>
            </Form>
          ) : (
            <button
              onClick={async () => {
                await subscribeToPush();
                revalidate();
              }}
              className="border p-2 rounded-md"
            >
              Enable Notifications 🔔
            </button>
          )}
          <div className="my-5" />
          <p className="text-sm">
            Enable the topics you want to get informed about below.
          </p>
          <div className="my-5" />
          <NotificationTopics disabled={browserPermission === "default"} />
          <div className="my-5" />
          <p className="text-xs">
            If you are using the app at the moment something happens, you will
            get a notification in the app itself. Otherwise you will get a push
            notification. You can enable notifications for each list separately.
          </p>
          <div className="border my-4" />
          <h2 className="text-lg">Troubleshooting</h2>
          <div className="my-2" />
          <p className="text-xs">
            This is only relevant if you do not receive notifications you would
            expect.
          </p>
          <div className="my-2" />
          <p className="text-xs">
            For example, if you switched browser notification permission off and
            on again, your notification subscription became invalid. In this
            case, you can either trigger a resubscription below now or your
            invalid subscription will be deleted as soon as a notification
            should be sent to you and you will then be informed to resubscribe.
          </p>
          <div className="my-5" />
          <button
            onClick={async () => {
              await subscribeToPush();
              revalidate();
            }}
            className="border p-2 rounded-md"
          >
            Resubscribe 🔔
          </button>
        </div>
      )}
    </div>
  );
}
