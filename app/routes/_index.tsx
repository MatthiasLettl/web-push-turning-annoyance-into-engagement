import type { List } from "@prisma/client";
import { useState } from "react";
import {
  Form,
  Link,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { prisma } from "~/utils/db.server";
import { getUserId, getUserIdOrThrow } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  let lists: List[] = [];
  if (userId) {
    lists = await prisma.list.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { id: userId } } }],
      },
      orderBy: { createdAt: "desc" },
    });
  }
  return { userId, lists };
}

const newListSchema = z.object({
  intent: z.literal("new-list"),
  name: z.string().min(1),
});

const updateListSchema = z.object({
  intent: z.literal("update-list"),
  listId: z.string(),
  name: z.string().min(1),
});

const deleteListSchema = z.object({
  intent: z.literal("delete-list"),
  listId: z.string(),
});

const listSchema = z.union([newListSchema, updateListSchema, deleteListSchema]);

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserIdOrThrow(request);
  const formData = await request.formData();
  const body = Object.fromEntries(formData);
  const check = listSchema.safeParse(body);
  if (!check.success) {
    return new Response("some values are not allowed", { status: 422 });
  }
  const { intent } = check.data;
  if (intent === "new-list") {
    const { name } = check.data;
    await prisma.list.create({
      data: {
        name,
        ownerId: userId,
      },
    });
    return new Response(null, { status: 200 });
  } else if (intent === "update-list") {
    const { listId, name } = check.data;
    const list = await prisma.list.findUnique({
      where: { id: listId },
    });
    if (!list) {
      return new Response("list not found", { status: 404 });
    }
    if (list.ownerId !== userId) {
      return new Response("not authorized", { status: 403 });
    }
    await prisma.list.update({
      where: { id: listId },
      data: { name },
    });
    return new Response(null, { status: 200 });
  } else if (intent === "delete-list") {
    const { listId } = check.data;
    const list = await prisma.list.findUnique({
      where: { id: listId },
    });
    if (!list) {
      return new Response("list not found", { status: 404 });
    }
    if (list.ownerId !== userId) {
      return new Response("not authorized", { status: 403 });
    }
    await prisma.list.delete({
      where: { id: listId },
    });
    return new Response(null, { status: 200 });
  } else {
    return new Response("invalid intent", { status: 422 });
  }
}

function NewListForm() {
  const [name, setName] = useState("");
  return (
    <Form method="POST" onSubmit={() => setName("")}>
      <input type="hidden" name="intent" value="new-list" />
      <div className="flex gap-1">
        <input
          type="text"
          name="name"
          placeholder="List Name"
          className="border flex-1  p-2 rounded-md"
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

function UpdateListForm({
  list,
  onSubmit,
  onCancel,
}: {
  list: List;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(list.name);
  return (
    <Form method="POST" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="update-list" />
      <input type="hidden" name="listId" value={list.id} />
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

function DeleteListForm({ listId }: { listId: string }) {
  return (
    <Form method="POST">
      <input type="hidden" name="intent" value="delete-list" />
      <input type="hidden" name="listId" value={listId} />
      <button
        type="submit"
        className="border p-2 rounded-md bg-red-500 text-red-950 text-xs"
      >
        Delete
      </button>
    </Form>
  );
}

function Lists() {
  const { userId, lists } = useLoaderData<typeof loader>();
  const [editingListId, setEditingListId] = useState<string | null>(null);

  const handleShare = (listId: string) => {
    const url = `${window.location.origin}/${listId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast("Link copied to clipboard!");
    });
  };

  return (
    <div>
      <h2 className="text-center text-2xl">Your Lists</h2>
      <div className="my-5" />
      {lists.length === 0 ? (
        <p className="text-center font-light mt-2">No lists. Create one! 🚀</p>
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => (
            <li key={list.id} className="border p-2 rounded-md">
              {editingListId === list.id ? (
                <UpdateListForm
                  list={list}
                  onSubmit={() => setEditingListId(null)}
                  onCancel={() => setEditingListId(null)}
                />
              ) : (
                <>
                  {userId === list.ownerId && (
                    <>
                      <div className="flex justify-between gap-1">
                        <button
                          onClick={() => handleShare(list.id)}
                          className="border rounded-md p-2 text-xs bg-gray-300 text-gray-950"
                        >
                          Share
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingListId(list.id)}
                            className="border rounded-md p-2 text-xs"
                          >
                            Edit
                          </button>
                          <DeleteListForm listId={list.id} />
                        </div>
                      </div>
                      <div className="my-2" />
                    </>
                  )}
                  <Link
                    to={`/${list.id}`}
                    className="underline underline-offset-2 break-words"
                  >
                    {list.name}
                  </Link>
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
  const { userId } = useLoaderData<typeof loader>();

  return (
    <div>
      {userId ? (
        <div>
          <h1 className="text-center text-2xl">New List</h1>
          <div className="my-5" />
          <NewListForm />
          <div className="my-5 border" />
          <Lists />
        </div>
      ) : (
        <p className="text-center">Login to manage your tasks! 🔐</p>
      )}
    </div>
  );
}
