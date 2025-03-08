import { redirect, type ActionFunctionArgs } from "react-router";
import {
  saveSubscriptionToDb,
  subscriptionSchema,
} from "~/utils/push-notifications.server";
import { getUserIdOrThrow } from "~/utils/session.server";

export async function loader() {
  throw redirect("/");
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserIdOrThrow(request);

  try {
    const _subscription = await request.json();
    const subscription = subscriptionSchema.parse(_subscription);

    await saveSubscriptionToDb({ userId, subscription });

    return new Response("subscription saved successfully", { status: 200 });
  } catch (error) {
    console.error("failed to save subscription: ", error);
    return new Response("failed to save subscription", { status: 500 });
  }
}
