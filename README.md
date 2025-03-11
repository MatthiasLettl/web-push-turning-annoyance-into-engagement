# Web Push: Turning Annoyance into Engagement

This is a simple ToDo-app to demonstrate the functionality of web push notifications with priority on user experience.

I used this app as a demo for a talk I gave at the Munich TypeScript Meetup [“TypeScript: When Designers & Developers Unite for Effortless UX”](https://www.meetup.com/munich-typescript-meetup/events/305997067/) on March 6, 2025.

You can find my corresponding blog post here: [https://matthiaslettl.com/blog/web-push-turning-annoyance-into-engagement](https://matthiaslettl.com/blog/web-push-turning-annoyance-into-engagement).

You can use this app to try out web push notifications and get a feeling for my ideas of an improved user experience (UX) regarding web push. You are also welcome to use this app as a reference to implement web push in your own app.

## Getting started

- `npm install` the relevant dependencies. For sending push notifications, the [web-push library](https://github.com/web-push-libs/web-push) is used.

- Create a `.env` file based on the `.env.example` file with your own values.

- Create a VAPID key pair executing `npx web-push generate-vapid-keys`.

- Set the `VAPID_PRIVATE_KEY` in the `.env` file and the `VAPID_PUBLIC_KEY` in the file `app/utils/push-notifications.ts`

- Create a local SQLite database with prisma using `npx prisma migrate dev --name init`. See the [Prisma Docs](https://www.prisma.io/docs/getting-started/quickstart-sqlite#3-run-a-migration-to-create-your-database-tables-with-prisma-migrate) for further reference.

- Start the dev server using `npm run dev`.

- Create two accounts in two different browsers (e.g. Chrome and Edge).

- Create a List in one account.

- Copy the invitation link to that list via the `Share` Button.

- Paste this invitation link in the browser of the second account and join the list.

- Enable notifications for a list via the `Enable Notifications` button.

- Play around with the events that trigger notifications for the different topics listed on the `/settings` page. See the different notification types (toast in web app or operating system (OS) level push notification) depending on whether the app is currently visible or not.

## Web Push specific Parts

If you want to use this codebase as reference for implementing web push in your own app or are just curious about the implementation details, you can find the main web push specific parts in the following sections of the app:

- `app/utils/push-notfications.ts` handles the logic for the subscription process and provides a custom hook to get the current state of the browser notification permission.

- `app/routes/push-notifications.tsx` provides the endpoint on the application server to process the subscription data and to trigger saving it to the database.

- `app/utils/push-notifications.server.ts` handles the process of actually saving the subscription information to the database and also includes the logic for sending push notifications.

- `public/service-worker.js` implements the event listeners for the `push` and `notificationclick` events.

- `app/root.tsx` handles the service worker messages, if a toast should be displayed instead of an operating system level push notification.

## UX Guidelines

This app primarily focuses on following guidelines, to improve the UX for web push notifications. Dive in further with [my blog post](https://matthiaslettl.com/blog/web-push-turning-annoyance-into-engagement).

### Permission Request: Tell them why

The user can explicitly trigger the subscription process (including the browser-level notifications permission request) and has context, about why they should enable this functionality.

### Subscription Management: Allow Configuration

The user has the ability to configure the subscription in a way, that they can decide about what topics to get informed or not.

### OS-Level Notifications only when in Background

OS-level push notifications should only be sent if necessary, to reduce overhead and do not unnecessarily annoy users. Therefore, as long as the user is actively using the web app, a notification in the web app itself is sufficient.

### Browser Notification Permission: Build expressive UI

The browser-level notification permission status is essential for the functionality of web push notifications. The current status should be used to inform the user about its influence on using the web push functionality.
