import {
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { prisma } from "./utils/db.server";
import { getUserId } from "./utils/session.server";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { z } from "zod";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  let username: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (user) {
      username = user.username;
    }
  }
  return { username };
}

const swMessageSchema = z.object({
  type: z.literal("SHOW_TOAST"),
  title: z.string(),
  description: z.string(),
  url: z.string().optional(),
});

export default function App() {
  const { username } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) {
        return;
      }
      const check = swMessageSchema.safeParse(event.data);
      if (!check.success) {
        return;
      }
      const { type, title, description, url } = check.data;
      if (type === "SHOW_TOAST") {
        toast(title, {
          description: description,
          action: url
            ? {
                label: location.pathname === url ? "Reload" : "Show",
                onClick:
                  location.pathname === url ? revalidate : () => navigate(url),
              }
            : undefined,
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [location.pathname, navigate]);

  return (
    <div className="container mt-2 px-5 mx-auto max-w-xl mb-8">
      <Toaster position="top-center" closeButton={true} />
      <p className="text-center tracking-widest font-light">
        {username ? `ToDos for ${username}` : "Simple ToDo"}
      </p>
      <div className="border my-2" />
      <div className="grid grid-cols-3 gap-4 font-light">
        <div>
          {username ? (
            <Link to="/" className="underline underline-offset-2">
              Lists
            </Link>
          ) : (
            <div />
          )}
        </div>
        <div className="text-center">
          {username ? (
            <Link to="/settings" className="underline underline-offset-2">
              Settings
            </Link>
          ) : (
            <div />
          )}
        </div>
        <div className="text-right">
          {username ? (
            <Form method="POST" action="/logout">
              <button className="underline underline-offset-2">Logout</button>
            </Form>
          ) : (
            <Link to="/login" className="underline underline-offset-2">
              Login
            </Link>
          )}
        </div>
      </div>
      <div className="border mt-2 mb-1" />
      <div className="border mb-8" />
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
