import {
  Form,
  Link,
  redirect,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  createUserSession,
  getUserId,
  login,
  loginSchema,
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
    redirectTo: formData.get("redirectTo"),
  });
  if (!check.success) {
    return new Response("some values are not allowed", { status: 422 });
  }
  const user = await login({
    username: check.data.username,
    password: check.data.password,
  });

  if (!user) {
    return new Response("wrong username or password", { status: 401 });
  }

  return createUserSession(user.id.toString(), check.data.redirectTo || "/");
}

export default function Login() {
  const [searchParams] = useSearchParams();
  return (
    <div>
      <h1 className="text-center text-2xl">Login</h1>
      <div className="my-10" />
      <Form method="POST" className="flex flex-col items-center justify-center">
        <input
          type="hidden"
          name="redirectTo"
          value={searchParams.get("redirectTo") ?? undefined}
        />
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            required
            minLength={1}
            className="block border p-2 rounded-md"
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
            className="block border p-2 rounded-md"
          />
        </div>
        <div className="my-3" />
        <div className="grid gap-2">
          <button className="border p-2 rounded-md bg-gray-300">Login</button>
          <Link to="/" className="border p-2 rounded-md">
            Cancel
          </Link>
        </div>
      </Form>
      <div className="my-5" />
      <div className="text-center space-x-2">
        <span>No account?</span>
        <Link to="/signup" className="underline underline-offset-2">
          Signup
        </Link>
      </div>
    </div>
  );
}
