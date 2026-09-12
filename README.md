# Safen - Emergency Alert System

Safen is a cross-platform React Native application designed for rapid emergency SOS activation, real-time location sharing, and incident reporting. We built **Safen** with a core focus on reliability: an emergency app needs to work seamlessly when it matters most.

## 🚀 Key Features

- **Rapid SOS Trigger**: UI components (like swipe-to-activate and hold-to-trigger) designed to prevent accidental triggers while ensuring immediate activation.
- **Offline SMS Fallback**: If you lose network connectivity during an emergency, Safen automatically routes SOS alerts via SMS to your trusted contacts, complete with your last known location.
- **Safe Check-In**: Set a watchdog timer when heading into a potentially unsafe situation. If you don't check in before the deadline, your contacts are automatically alerted.
- **Live Trip Sharing**: Broadcast your real-time location to chosen contacts for a set duration or indefinitely.
- **Comprehensive Incident Reporting**: A structured flow for reporting incidents (Medical, Fire, Security, Missing Person) complete with audio/video/image attachments, precise location mapping, and AI-assisted report quality analysis.
- **Emergency Contacts Network**: A secure, real-time synchronized contact management system that keeps your safety network up to date.

## ⚡ Architecture & Resilience

Our frontend architecture is built with stability and performance in mind:

- **Robust State Management**: We utilize highly optimized hooks and atomicity via `AsyncStorage` to ensure background tasks, watchdog timers, and location tracking survive app restarts and prevent race conditions.
- **Realtime Syncing**: Leveraging Supabase Realtime to push live location updates, SOS feed events, and contact requests instantly to users' devices.
- **Cross-Platform Development**: Built with Expo and React Native, delivering a consistent, accessible experience on both iOS and Android.
- **Resource Management**: Strict cleanup of hardware resources (camera, microphone) to prevent memory leaks and ensure the app never crashes when handling media.

## 📂 Project Structure

```text
safen/
├── app/                  # Expo Router layout and navigation
│   ├── (tabs)/           # Main tab navigation (Home, Network, Map, Report, Profile)
│   ├── _layout.tsx       # Root application layout and context providers
│   └── auth.tsx          # Authentication flows
├── src/                  
│   ├── components/       # Reusable, strictly-typed UI components (SOSButton, Modals, Forms)
│   ├── context/          # Global state management providers (Theme, Haptics)
│   ├── hooks/            # Custom React hooks (useAlert, useSafeCheckIn, useShareLiveTrip, etc.)
│   ├── lib/              # Core utilities (Supabase, Offline SMS routing, Notifications)
│   └── constants/        # Application-wide constants and configurations
└── package.json          # Dependencies and scripts
```

## 🛠 Tech Stack

- **Framework**: React Native with Expo (Expo Router)
- **Language**: TypeScript
- **Backend**: Supabase (Auth, Postgres DB, Edge Functions, Realtime)
- **Mapping & Location**: `react-native-maps` & `expo-location`
- **Media**: `expo-av`, `expo-image-picker`

## 🏃‍♂️ Running Locally

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Set up your `.env` with the required Supabase keys.
3. Start the Expo development server:
   ```bash
   npm run start
   ```

## Accessibility & Inclusion

Safen is designed to be highly accessible and easy to use. We prioritize clear visual hierarchies, proper accessibility labeling, and large tap targets so that anyone can navigate the app quickly and safely during stressful situations.
