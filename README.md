# Vibe

Vibe is an Expo Router chat app backed by Firebase Authentication and Cloud Firestore. It keeps the existing `users/{uid}` and `chats/{chatId}/messages/{messageId}` data layout; no profile photos or Firebase Storage are required.

## Run on Android with Expo Go

```powershell
npm install
npx expo start
```

Install Expo Go on the Android phone, connect the phone and development computer to the same network, then scan the QR code. If the network blocks LAN discovery, start with `npx expo start --tunnel`.

## Firestore setup

Review the complete rules in `firestore.rules` and publish them from Firebase Console > Firestore Database > Rules. These rules preserve existing documents, prevent deletes, require authenticated access, restrict conversations to their participants, and allow only the receiver to set a message's `seen` field to `true`.

The application adds these optional fields to existing documents:

- `users/{uid}`: `isOnline` and `lastSeen`
- `chats/{chatId}`: `unreadCounts.{uid}`, `typing.{uid}`, and `typingUpdatedAt.{uid}`

Existing chats and messages are not migrated or deleted. Unread badges count messages sent after unread tracking is enabled; historical unread messages are marked read when their conversation is opened, but are not backfilled into the unread counter.

## Presence limitation

Presence uses Firestore writes on foreground/background transitions and a 60-second foreground heartbeat. Firestore alone cannot reliably detect a process kill, network loss, or device power-off at the instant it occurs. Vibe treats a profile as online only while its last heartbeat is less than two minutes old. For authoritative disconnect handling, use Firebase Realtime Database presence with `onDisconnect()` and synchronize to Firestore using a trusted Cloud Function; that requires enabling Realtime Database and deploying the function.

## Two-account smoke test

1. Create two accounts on separate Android devices or one Android device plus a browser session. Use unique email addresses.
2. On account A, open New chat, choose account B, and send a message. Confirm the message appears with a sent tick and the chat preview appears in A's list.
3. While B is signed in but not viewing the conversation, confirm the chat row shows an unread badge. Open that chat on B and confirm the badge clears and A's sent tick becomes `✓✓`.
4. Leave the conversation open on B. Type from A without sending and verify B sees `typing...`; stop typing and confirm it clears. Background A to check its presence changes to last seen/offline after the heartbeat window.
5. Open Profile, change the display name, save, and verify the other account sees it in the user list. Log out and verify Vibe returns to Login.
6. Use Forgot Password with a registered email and follow the Firebase email link.

Email/password sign-in must be enabled in Firebase Authentication, and Firebase's password-reset email template/action URL must be configured for the desired delivery flow.
