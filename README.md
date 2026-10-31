# VibeChat - Android Chat Application

VibeChat is a modern, high-performance **Android** messaging application designed for fast, seamless, and secure communication. Built with **React Native 0.86** and **Expo SDK 57** using **Expo Router**, VibeChat relies exclusively on **Supabase** as its backend for authentication, database management, realtime events, and private media storage.

---

## 📱 Project Overview

VibeChat delivers a complete mobile messaging experience on Android devices, featuring direct 1-to-1 conversations, group chats, broadcast channels, voice notes, media sharing, and real-time audio/video calling.

- **Platform**: Android
- **Framework**: Expo SDK 57 (Managed Workflow)
- **Runtime**: React Native 0.86 with Hermes Engine
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Supabase (PostgreSQL, Realtime, Storage, Edge Functions)
- **Calling**: Agora RTC SDK (`react-native-agora`)

---

## ✨ Key Features

- **Supabase Authentication**: Secure user registration, email/password login, session persistence via native AsyncStorage, and password recovery.
- **Direct 1-to-1 Messaging**: Fast peer-to-peer conversations with sent indicators and read receipts.
- **Group Conversations**: Create and manage groups, assign admin roles, add/remove members, and update group profile photos.
- **Broadcast Channels**: Send one-to-many broadcast announcements to multiple recipients simultaneously.
- **Realtime Presence & Typing Indicators**: Instant online/offline status tracking and live typing indicators powered by Supabase Realtime Channels.
- **Media & Attachment Sharing**: Send photos and documents with compression and secure file upload to private Supabase Storage.
- **Voice Notes**: Built-in voice recording and playback powered by `expo-audio` with interactive progress tracking.
- **Audio & Video Calling**: Realtime peer-to-peer voice and video calls powered by Agora RTC SDK and authenticated via Supabase Edge Functions.
- **Android System Notifications**: High-importance Android notification channel with sound, vibration, and in-app banner alerts via `expo-notifications`.
- **Dynamic Theming**: Polished dark and light themes with custom UI components, smooth transitions, and tactile feedback.

---

## 🛠️ Technology Stack

| Layer | Technology | Version / Details |
| :--- | :--- | :--- |
| **Mobile Platform** | Android | Android 8.0+ (API level 26+) |
| **App Framework** | [Expo](https://expo.dev/) | SDK 57 (`~57.0.28`) |
| **Core Runtime** | [React Native](https://reactnative.dev/) | 0.86.3 (React 19.2.3) |
| **Routing** | [Expo Router](https://docs.expo.dev/router/introduction/) | `~57.0.26` (Typed file-based navigation) |
| **Backend & DB** | [Supabase](https://supabase.com/) | PostgreSQL Database, Auth, Realtime, Storage |
| **Voice & Video** | [Agora RTC](https://www.agora.io/) | `react-native-agora` `^4.6.4` |
| **Audio Engine** | [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) | `expo-audio` `~57.0.5` |
| **Image & Media** | Expo Image / Image Picker | `expo-image`, `expo-image-picker`, `expo-document-picker` |
| **Notifications** | Expo Notifications | `expo-notifications` `~57.0.22` |
| **Build Tooling** | [EAS Build](https://docs.expo.dev/build/introduction/) | Expo Application Services (APK / AAB) |

---

## 🗄️ Backend – Supabase

VibeChat uses **Supabase as its ONLY backend**. No other cloud provider or legacy service is required.

- **Authentication**: Native session management via `@supabase/supabase-js` and `@react-native-async-storage/async-storage`.
- **Database**: PostgreSQL with Row-Level Security (RLS) policies protecting:
  - `profiles`: User information, avatars, status, and last seen timestamps.
  - `chats` & `chat_members`: One-to-one and group chat memberships, unread counters, and member roles.
  - `messages`: Text content, media metadata, reply references, and timestamps.
  - `message_reads` & `message_reactions`: Read status tracking and emoji reactions.
  - `broadcast_channels` & `broadcast_messages`: Multi-recipient broadcast distribution.
  - `calls`: Call logs, call status, and channel names for Agora sessions.
- **Realtime Channels**: WebSocket subscriptions listening to Postgres changes (`postgres_changes`) for incoming messages, read receipts, and presence updates.
- **Storage**: Private Supabase Storage bucket:
  - **Bucket Name**: `vibechat-media`
  - Encrypted, authenticated uploads for profile avatars, group photos, voice notes, and file attachments with signed download URLs.
- **Edge Functions**:
  - `agora-token`: Deno-based Supabase Edge Function generating secure, dynamic RTC authentication tokens for voice/video calls.

---

## 📋 Prerequisites

Ensure the following tools are installed on your development machine:

1. **Node.js**: LTS version (v18.x or v20.x recommended) — [Download Node.js](https://nodejs.org/)
2. **Git**: Version control — [Download Git](https://git-scm.com/)
3. **Android Device or Emulator**:
   - Physical Android device with USB debugging enabled, OR
   - Android Studio with an Android Virtual Device (AVD) configured.
4. **Expo Go** (Optional for quick prototyping): Available on Google Play Store.
5. **EAS CLI** (For standalone Android APK builds):
   ```powershell
   npm install -g eas-cli
   ```

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/pratibha1512/vibechat.git
   cd Vibechat
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```powershell
   New-Item -ItemType File -Name ".env"
   ```

---

## 🔑 Environment Variables

Add your Supabase project credentials to `.env`. Never commit actual keys or production secrets to source control.

```env
# Supabase Configuration (Required)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

> **Note**: Both variables use the `EXPO_PUBLIC_` prefix, allowing Expo to bundle them securely at build time without exposing private server secrets.

---

## 🤖 Run on Android

### Option A: Run with Expo Go / Local Dev Server

Start the Metro development server:

```powershell
npm run android
# or
npx expo start --android
```

- If using a physical Android device on the same Wi-Fi network, open **Expo Go** and scan the terminal QR code.
- If your network restricts local network discovery, start Expo in tunnel mode:
  ```powershell
  npx expo start --tunnel
  ```

### Option B: Run via Expo Development Build

For native modules requiring custom native code (such as `react-native-agora` for calls):

```powershell
npx expo run:android
```

This compiles the native Android app into your local Android emulator or connected device via Android SDK / ADB.

---

## 📦 APK Build Instructions using EAS

VibeChat is pre-configured with `eas.json` for creating standalone Android APK packages directly through Expo Application Services (EAS).

### 1. Log in to Expo
```powershell
eas login
```

### 2. Build a Standalone Android APK (Preview Profile)
The `preview` profile in `eas.json` is configured to produce a shareable, installable `.apk` file:

```powershell
eas build --platform android --profile preview
```

Once the cloud build finishes, EAS provides a direct download link and QR code to install the `.apk` on any Android device.

### 3. Build a Development APK
To test with the development client on a physical device:

```powershell
eas build --platform android --profile development
```

### 4. Build a Production Android App Bundle (AAB)
For Google Play Store submission:

```powershell
eas build --platform android --profile production
```

---

## 📁 Project Folder Structure

```
Vibechat/
├── assets/                     # App icons, splash images, and notification assets
│   ├── images/                 # Adaptive Android icons, logo, and splash screen
│   └── expo.icon/              # Vector icons and asset specifications
├── src/
│   ├── app/                    # Expo Router file-based pages (Android screens)
│   │   ├── _layout.tsx         # Root layout, Supabase auth gate & presence listener
│   │   ├── index.tsx           # Login screen
│   │   ├── signup.tsx          # Account registration screen
│   │   ├── forgot-password.tsx # Password recovery request screen
│   │   ├── reset-password.tsx  # Update password screen
│   │   ├── chats.tsx           # Direct and group conversations list
│   │   ├── chat.tsx            # Active conversation screen (messages, voice, media)
│   │   ├── broadcasts.tsx      # Broadcast channels dashboard
│   │   ├── broadcast-chat.tsx  # Channel messages & broadcast composer
│   │   ├── new-broadcast.tsx   # New broadcast channel creation
│   │   ├── calls.tsx           # Audio/video call history and logs
│   │   ├── profile.tsx         # User profile, avatar management, and sign out
│   │   └── explore.tsx         # User search and discovery
│   ├── components/             # Reusable UI components
│   │   ├── call-modal.tsx      # Active audio/video call overlay modal
│   │   ├── message-bubble.tsx  # Chat bubbles with media, replies, and reactions
│   │   ├── voice-player.tsx    # Audio playback waveform and controls
│   │   └── vibe-ui.tsx         # Custom buttons, inputs, avatars, and headers
│   ├── constants/              # Theme definitions, colors, and layout metrics
│   ├── context/                # React context providers
│   │   ├── call-context.tsx    # Agora call state and incoming call management
│   │   └── theme-context.tsx   # Dark/light theme state and dynamic colors
│   ├── services/               # External service integrations
│   │   ├── agora.ts            # Agora RTC engine initialization and event listeners
│   │   └── calling.ts          # Supabase call session records and signaling
│   ├── utils/                  # Utility functions
│   │   ├── broadcast.ts        # Broadcast multi-recipient distribution logic
│   │   └── notifications.ts    # Android notification channels and local alerts
│   ├── supabase.ts             # Supabase client configuration & storage adapter
│   └── types/                  # TypeScript interface and type declarations
├── supabase/
│   ├── functions/agora-token/  # Deno Edge Function for Agora RTC token generation
│   └── migrations/             # SQL schema migrations and stored procedures
├── app.json                    # Expo project configuration & Android permissions
├── eas.json                    # EAS build profiles for Android APK and AAB
├── package.json                # Project dependencies and development scripts
└── tsconfig.json               # TypeScript configuration
```

---

## 🔒 Security Notes

- **Sole Backend**: All data, sessions, media, and authorization are managed through Supabase.
- **Row-Level Security (RLS)**: PostgreSQL tables are protected by strict RLS policies ensuring users can only read and write messages in chats they participate in.
- **Private Storage**: Media in `vibechat-media` is strictly private and accessed via authenticated signed URLs with time-limited expirations.
- **Safe Environment**: Never expose Supabase service role keys or database connection strings on the client. Only the public anon key (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is bundled into the client.

---

## 🔮 Future Improvements

- End-to-end encryption (E2EE) for 1-to-1 chats.
- Background push notification delivery via an independent MQTT gateway.
- Offline message queuing and local SQLite cache synchronization.
- Message search and media gallery view within conversations.
- Voice message transcription using AI audio models.

---

## 👤 Author & Credits

- **Developer**: Pratibha Kumari ([@pratibha1512](https://github.com/pratibha1512))
- **Application**: VibeChat Android
- **Package**: `com.pratibha1512.vibechat`
