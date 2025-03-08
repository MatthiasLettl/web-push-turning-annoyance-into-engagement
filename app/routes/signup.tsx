import {
  Form,
  Link,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  createUserSession,
  getUserId,
  loginSchema,
  signup,
} from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) {
    throw redirect("/");
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const check = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!check.success)
    return new Response("some values are not allowed", { status: 422 });

  const user = await signup({
    username: check.data.username,
    password: check.data.password,
  });

  return createUserSession(user.id.toString(), "/");
}

export default function Signup() {
  return (
    <div>
      <h1 className="text-center text-2xl">Signup</h1>
      <div className="my-10" />
      <Form method="POST" className="flex flex-col items-center justify-center">
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            required
            minLength={1}
            className="block border  rounded-md p-2"
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={1}
            className="block border  rounded-md p-2"
          />
        </div>
        <div className="my-3" />
        <div className="grid gap-2">
          <button className="border  rounded-md p-2 bg-gray-300">Signup</button>
          <Link to="/" className="border  rounded-md p-2">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
