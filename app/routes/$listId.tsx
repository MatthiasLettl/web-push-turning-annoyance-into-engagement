import type { Item } from "@prisma/client";
import { useState } from "react";
import {
  Form,
  redirect,
  useLoaderData,
  useNavigate,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { prisma } from "~/utils/db.server";
import { useBrowserPermission } from "~/utils/push-notifications";
import { sendPushNotification } from "~/utils/push-notifications.server";
import { getUserIdOrThrow } from "~/utils/session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await getUserIdOrThrow(request);
  const listId = params.listId;
  if (!listId) {
    throw redirect("/");
  }
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { createdAt: "desc" },
      },
      owner: true,
      members: true,
    },
  });
  if (!list) {
    throw redirect("/");
  }
  const isOwner = list.ownerId === userId;
  const isMember = list.members.some((member) => member.id === userId);

  const notificationSetting = await prisma.userListNotification.findUnique({
    where: { userId_listId: { userId, listId } },
  });

  const subscription = await prisma.pushSubscription.findFirst({
    where: {
      userId,
    },
    select: {
      userId: true,
    },
  });

  return {
    list,
    isOwner,
    isMember,
    notificationEnabled: notificationSetting ? true : false,
    hasSubscription: subscription ? true : false,
  };
}

const newItemSchema = z.object({
  intent: z.literal("new-item"),
  name: z.string().min(1),
});

const updateItemSchema = z.object({
  intent: z.literal("update-item"),
  itemId: z.string(),
  name: z.string().min(1),
});

const deleteItemSchema = z.object({
  intent: z.literal("delete-item"),
  itemId: z.string(),
});

const toggleDoneSchema = z.object({
  intent: z.literal("toggle-done"),
  itemId: z.string(),
  done: z.string().transform((v) => v === "true"),
});

const joinListSchema = z.object({
  intent: z.literal("join-list"),
});

const enableNotificationsSchema = z.object({
  intent: z.literal("enable-notifications"),
  enabled: z.string().transform((v) => v === "true"),
  navigateToSettings: z.string().transform((v) => v === "true"),
});

const itemSchema = z.union([
  newItemSchema,
  updateItemSchema,
  deleteItemSchema,
  toggleDoneSchema,
  joinListSchema,
  enableNotificationsSchema,
]);

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await getUserIdOrThrow(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) {
    return new Response("user not found", { status: 404 });
  }
  const listId = params.listId;
  if (!listId) {
    return new Response("listId is required", { status: 422 });
  }
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { name: true },
  });
  if (!list) {
    return new Response("list not found", { status: 404 });
  }
  const formData = await request.formData();
  const body = Object.fromEntries(formData);
  const check = itemSchema.safeParse(body);
  if (!check.success) {
    return new Response("some values are not allowed", { status: 422 });
  }
  const { intent } = check.data;
  if (intent === "new-item") {
    const { name } = check.data;
    await prisma.item.create({
      data: {
        name,
        list: {
          connect: {
            id: listId,
          },
        },
      },
    });
    await sendPushNotification({
      title: `${list.name} - New Task`,
      description: `${user.username} added ${name}`,
      topic: "NEW_ITEM",
      listId,
      originUserId: userId,
      url: `/${listId}`,
    });
    return new Response(null, { status: 200 });
  } else if (intent === "update-item") {
    const { itemId, name } = check.data;
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { name: true },
    });
    if (!item) {
      return new Response("item not found", { status: 404 });
    }
    await prisma.item.update({
      where: { id: itemId },
      data: { name },
    });
    await sendPushNotification({
      title: `${list.name} - Updated Task`,
      description: `${user.username} updated ${item.name} to ${name}`,
      topic: "ITEM_UPDATED",
      listId,
      originUserId: userId,
      url: `/${listId}`,
    });
    return new Response(null, { status: 200 });
  } else if (intent === "delete-item") {
    const { itemId } = check.data;
    const item = await prisma.item.delete({
      where: { id: itemId },
    });
    await sendPushNotification({
      title: `${list.name} - Task deleted`,
      description: `${user.username} deleted ${item.name}`,
      topic: "ITEM_DELETED",
      listId,
      originUserId: userId,
      url: `/${listId}`,
    });
    return new Response(null, { status: 200 });
  } else if (intent === "toggle-done") {
    const { itemId, done } = check.data;
    const item = await prisma.item.update({
      where: { id: itemId },
      data: { done },
    });
    if (done) {
      await sendPushNotification({
        title: `${list.name} - Task completed`,
        description: `${user.username} marked ${item.name} as done`,
        topic: "ITEM_DONE",
        listId,
        originUserId: userId,
        url: `/${listId}`,
      });
    } else {
      await sendPushNotification({
        title: `${list.name} - Task reopened`,
        description: `${user.username} marked ${item.name} as open`,
        topic: "ITEM_UNDONE",
        listId,
        originUserId: userId,
        url: `/${listId}`,
      });
    }
    return new Response(null, { status: 200 });
  } else if (intent === "join-list") {
    await prisma.list.update({
      where: { id: listId },
      data: {
        members: {
          connect: { id: userId },
        },
      },
    });
    await sendPushNotification({
      title: `${list.name} - Join`,
      description: `${user.username} joined ${list.name}`,
      topic: "JOIN_LIST",
      listId,
      originUserId: userId,
      url: `/${listId}`,
    });
    return new Response(null, { status: 200 });
  } else if (intent === "enable-notifications") {
    const { enabled, navigateToSettings } = check.data;
    if (navigateToSettings) {
      if (enabled) {
        await prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            listNotifications: {
              create: { listId },
            },
          },
        });
      }
      throw redirect("/settings");
    }

    if (enabled) {
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          listNotifications: {
            create: { listId },
          },
        },
      });
    } else {
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          listNotifications: {
            delete: { userId_listId: { userId, listId } },
          },
        },
      });
    }
    return new Response(null, { status: 200 });
  } else {
    return new Response("invalid intent", { status: 422 });
  }
}

function JoinListForm() {
  const { list } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <div className="text-center">
      <p>Do you want to join the list {list.name}?</p>
      <div className="my-5" />
      <Form method="POST">
        <input type="hidden" name="intent" value="join-list" />
        <button
          type="submit"
          className="border p-2 rounded-md bg-gray-300 text-gray-950"
        >
          Join
        </button>
        <button
          type="button"
          className="border p-2 rounded-md ml-2"
          onClick={() => navigate("/")}
        >
          Cancel
        </button>
      </Form>
    </div>
  );
}

function NewItemForm() {
  const [name, setName] = useState("");
  return (
    <Form method="POST" onSubmit={() => setName("")}>
      <input type="hidden" name="intent" value="new-item" />
      <div className="flex gap-1">
        <input
          type="text"
          name="name"
          placeholder="Task Name"
          className="border flex-1 p-2 rounded-md"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="border p-2 rounded-md">
          Create
        </button>
      </div>
    </Form>
  );
}

function UpdateItemForm({
  item,
  onSubmit,
  onCancel,
}: {
  item: Item;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  return (
    <Form method="POST" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="update-item" />
      <input type="hidden" name="itemId" value={item.id} />
      <div className="flex justify-end gap-1">
        <button type="submit" className="border p-2 rounded-md text-xs">
          Save
        </button>
        <button
          type="button"
          className="border p-2 rounded-md text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <input
        type="text"
        name="name"
        className="border p-2 rounded-md w-full mt-2"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </Form>
  );
}

function DeleteItemForm({ itemId }: { itemId: string }) {
  return (
    <Form method="POST">
      <input type="hidden" name="intent" value="delete-item" />
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        className="border p-2 rounded-md bg-red-500 text-red-950 text-xs"
      >
        Delete
      </button>
    </Form>
  );
}

function ToggleDoneForm({ item }: { item: Item }) {
  return (
    <Form method="POST">
      <input type="hidden" name="intent" value="toggle-done" />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="done" value={item.done ? "false" : "true"} />
      <button className="border rounded-md p-2 text-xs bg-gray-300 text-gray-950">
        {item.done ? "Undo" : "Done"}
      </button>
    </Form>
  );
}

function Items() {
  const { list } = useLoaderData<typeof loader>();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const notDoneItems = list.items.filter((item) => !item.done);
  const doneItems = list.items.filter((item) => item.done);

  return (
    <div>
      <h2 className="text-center text-lg">Open Tasks</h2>
      <div className="my-5" />
      {notDoneItems.length === 0 ? (
        <p className="text-center font-light mt-2">No open tasks.</p>
      ) : (
        <ul className="space-y-2">
          {notDoneItems.map((item) => (
            <li key={item.id} className="border p-2 rounded-md">
              {editingItemId === item.id ? (
                <UpdateItemForm
                  item={item}
                  onSubmit={() => setEditingItemId(null)}
                  onCancel={() => setEditingItemId(null)}
                />
              ) : (
                <>
                  <div className="flex justify-between gap-1 items-center">
                    <ToggleDoneForm item={item} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingItemId(item.id)}
                        className="border  rounded-md p-2 text-xs"
                      >
                        Edit
                      </button>
                      <DeleteItemForm itemId={item.id} />
                    </div>
                  </div>
                  <div className="my-2" />
                  <p className="break-words">{item.name}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="my-5 border" />
      <h2 className="text-center text-lg">Completed Tasks</h2>
      <div className="my-5" />
      {doneItems.length === 0 ? (
        <p className="text-center font-light mt-2">No completed tasks.</p>
      ) : (
        <ul className="space-y-2 mt-2">
          {doneItems.map((item) => (
            <li key={item.id} className="border p-2 rounded-md">
              {editingItemId === item.id ? (
                <UpdateItemForm
                  item={item}
                  onSubmit={() => setEditingItemId(null)}
                  onCancel={() => setEditingItemId(null)}
                />
              ) : (
                <>
                  <div className="flex justify-between gap-1 items-center">
                    <ToggleDoneForm item={item} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingItemId(item.id)}
                        className="border  rounded-md p-2 text-xs"
                      >
                        Edit
                      </button>
                      <DeleteItemForm itemId={item.id} />
                    </div>
                  </div>
                  <p className="break-words line-through">{item.name}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Index() {
  const { list, isOwner, isMember, notificationEnabled, hasSubscription } =
    useLoaderData<typeof loader>();

  const browserPermission = useBrowserPermission();

  const handleShare = (listId: string) => {
    const url = `${window.location.origin}/${listId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast("Link copied to clipboard!");
    });
  };

  const navigateToSettings =
    !hasSubscription ||
    browserPermission === "denied" ||
    browserPermission === "default";

  if (!isOwner && !isMember) {
    return <JoinListForm />;
  }

  return (
    <div>
      <div className="flex justify-between gap-1 -my-3">
        <button
          onClick={() => handleShare(list.id)}
          className="border rounded-md p-2 text-xs bg-gray-300 text-gray-950"
        >
          Share
        </button>
        <Form method="POST">
          <input type="hidden" name="intent" value="enable-notifications" />
          <input
            type="hidden"
            name="enabled"
            value={notificationEnabled ? "false" : "true"}
          />
          <input
            type="hidden"
            name="navigateToSettings"
            value={navigateToSettings ? "true" : "false"}
          />
          <button className="border p-2 rounded-md text-xs">
            {!notificationEnabled || navigateToSettings
              ? "Enable Notifications 🔔"
              : "Disable Notifications 🚫"}
          </button>
        </Form>
      </div>
      <div className="my-5" />
      <h1 className="text-center text-2xl break-words">List: {list.name}</h1>
      <div className="my-5" />
      <NewItemForm />
      <div className="my-5 border" />
      <Items />
    </div>
  );
}
