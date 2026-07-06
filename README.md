# Safen - Emergency Alert System

We built **Safen** with a core focus on reliability: an emergency app needs to work seamlessly when it matters most. Our goal is to ensure the app remains stable and responsive, handling high-stress situations gracefully.

Safen is a cross-platform React Native application designed for rapid emergency SOS activation, real-time location sharing, and incident reporting.

## ⚡ Architecture & Resilience
Our frontend architecture is built with stability and performance in mind:
- **State Management & Notifications**: Handling real-time alerts efficiently to minimize unnecessary re-renders and ensure smooth performance during critical moments.
- **Cross-Platform Development**: Leveraging Expo to apply React best practices to a mobile environment, creating a practical and accessible tool.
- **Backend as a Service**: Powered by Supabase for secure authentication, reliable data storage, and real-time syncing.

## 📂 Project Structure

The codebase is organized to be scalable and maintainable:

```
safen/
├── app/                  # Expo Router layout and navigation
│   ├── (tabs)/           # Main tab navigation (Dashboard, Contacts, Map, Report, Settings)
│   ├── _layout.tsx       # Root application layout and context providers
│   ├── auth.tsx          # Authentication flows
│   └── verify.tsx        # Verification and onboarding
├── src/                  # Core application source
│   ├── components/       # Reusable, strictly-typed UI components (SOSButton, Header, Modals)
│   ├── context/          # Global state management providers
│   ├── hooks/            # Custom React hooks (useNotifications, useAlert, useAvatar)
│   ├── lib/              # Third-party integrations and utility functions (Supabase client)
│   └── constants/        # Application-wide constants and configurations
├── assets/               # Static assets (images, fonts, splash screens)
├── app.json              # Expo configuration
└── package.json          # Dependencies and scripts
```

## 🚀 Key Features
- **Rapid SOS Trigger**: UI components (`SOSButton`, `SwipeButton`) designed to prevent accidental triggers while ensuring immediate activation when needed.
- **Live Location Tracking**: Integrates with `expo-location` and `react-native-maps` to broadcast real-time user location during active emergencies.
- **Emergency Contacts**: Contact management that syncs reliably via Supabase.
- **Incident Reporting**: A structured flow for reporting incidents, complete with media attachments and AI-assisted risk analysis.

## 🛠 Tech Stack
- **Framework**: React Native with Expo (Expo Router for file-based routing)
- **Language**: TypeScript
- **Backend**: Supabase (Auth, Postgres DB, Realtime)
- **Mapping & Location**: `react-native-maps` & `expo-location`

## 🏃‍♂️ Running Locally

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Set up your `.env` with the required Supabase keys.
3. Start the Expo development server:
   ```bash
   npm start
   ```

## Accessibility & Inclusion
Safen is designed to be highly accessible and easy to use. We prioritize clear visual hierarchies and large tap targets so that anyone can navigate the app quickly and safely during stressful situations.
