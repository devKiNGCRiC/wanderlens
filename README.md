# Wanderlens 🌍📸

A cross-platform mobile application built with Expo and React Native that connects photographers and travelers. Discover amazing photography spots, share your creations, and connect with a community of visual storytellers.

## Overview

Wanderlens is a social photography platform that enables users to:

- **Discover** nearby photography spots and locations
- **Share** photography with tags, genres, and location data
- **Connect** with photographers and travelers worldwide
- **Explore** user profiles and photography collections
- **Save** favorite spots and photographers for later

Whether you're a professional photographer looking to showcase your work or a traveler seeking the best photo opportunities, Wanderlens brings the community together.

## Features

- 📍 **Location-Based Discovery** - Find nearby photography spots and locations
- 🎨 **Photography Feed** - Browse and interact with photography posts from the community
- 👥 **User Profiles** - View photographer portfolios and travel enthusiast profiles
- 💾 **Save Favorites** - Bookmark spots and photographers you love
- 🗺️ **Interactive Map** - Visualize photography locations with MapLibre
- 🔐 **Secure Authentication** - Supabase-powered user authentication
- 🎯 **Smart Filtering** - Filter content by genre, time of day, and more
- 📸 **Image Picking & Upload** - Easily share your photography
- 🌍 **Multi-Country Support** - Browse locations worldwide
- 🎭 **User Types** - Distinct profiles for photographers and travelers

## Tech Stack

- **Frontend Framework**: React Native with Expo 54.0.37
- **Language**: TypeScript 5.9
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand
- **Backend**: Supabase (PostgreSQL, authentication, storage)
- **Mapping**: MapLibre React Native
- **UI Components**: React Native, Expo Vector Icons
- **Styling**: React Native Stylesheet, Linear Gradient
- **Image Handling**: Expo Image Picker, Expo Image
- **Location**: Expo Location API
- **Platform Support**: iOS, Android, Web

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI (optional but recommended)
- For iOS: Xcode and CocoaPods
- For Android: Android SDK and Android Studio

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd Wanderlens
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   - Create a `.env.local` file with your Supabase credentials:
     ```
     EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
     EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Start the development server**
   ```bash
   npm start
   ```

### Running on Different Platforms

- **iOS Simulator**

  ```bash
  npm run ios
  ```

- **Android Emulator**

  ```bash
  npm run android
  ```

- **Web Browser**

  ```bash
  npm run web
  ```

- **Expo Go** (iOS/Android app)
  - Press `i` (iOS) or `a` (Android) when the dev server is running

## Project Structure

```
Wanderlens/
├── app/                          # App screens and routing
│   ├── (auth)/                   # Authentication screens (login, signup)
│   ├── (tabs)/                   # Tab-based navigation
│   │   ├── index.tsx             # Feed screen
│   │   ├── map.tsx               # Map screen
│   │   ├── connect.tsx           # Connections screen
│   │   └── profile.tsx           # User profile screen
│   ├── spot/                     # Spot detail screens
│   ├── user/                     # User profile pages
│   ├── add-spot.tsx              # Add new spot screen
│   ├── edit-profile.tsx          # Edit profile screen
│   ├── onboarding.tsx            # Onboarding flow
│   └── modal.tsx                 # Modal components
├── components/                   # Reusable UI components
│   ├── PolaroidCard.tsx          # Polaroid-style card for photos
│   ├── FilterSheet.tsx           # Bottom sheet for filtering
│   ├── ImageViewer.tsx           # Image viewing component
│   ├── ShareProfileModal.tsx     # Share profile modal
│   ├── TagInfoModal.tsx          # Tag information display
│   ├── ScreenBackground.tsx      # Background gradient wrapper
│   └── ui/                       # UI primitives (icons, collapsibles)
├── context/                      # React Context (Auth state management)
│   └── AuthProvider.tsx          # Authentication context
├── hooks/                        # Custom React hooks
│   ├── useUserLocation.ts        # Location tracking hook
│   ├── use-theme-color.ts        # Theme management
│   └── use-color-scheme.ts       # Color scheme detection
├── lib/                          # Utilities and services
│   ├── supabase.js               # Supabase client setup
│   ├── formatTimeAgo.ts          # Time formatting utility
│   └── formatUserType.ts         # User type display formatting
├── constants/                    # App constants
│   ├── theme.ts                  # Theme configuration
│   ├── tagInfo.ts                # Tag information
│   └── countries.ts              # Countries list
├── assets/                       # Images and media
├── scripts/                      # Build and utility scripts
├── package.json                  # Dependencies and scripts
├── app.json                      # Expo configuration
├── app.config.js                 # Expo app configuration (JS)
├── tsconfig.json                 # TypeScript configuration
└── eslint.config.js              # ESLint configuration
```

## Key Dependencies

### Core Framework

- `expo` - Universal React framework
- `react` - UI library
- `react-native` - Cross-platform mobile framework
- `typescript` - Type safety

### Navigation & Routing

- `expo-router` - File-based routing system
- `@react-navigation/*` - Navigation infrastructure

### Backend & Authentication

- `@supabase/supabase-js` - Supabase client library
- `@react-native-async-storage/async-storage` - Local persistence

### UI & Components

- `expo-linear-gradient` - Gradient backgrounds
- `@expo/vector-icons` - Icon library
- `expo-image` - Optimized image component
- `react-native-reanimated` - Animation library
- `react-native-gesture-handler` - Gesture support

### Map & Location

- `@maplibre/maplibre-react-native` - Interactive maps
- `expo-location` - Location services

### Image & Media

- `expo-image-picker` - Photo library access
- `base64-arraybuffer` - Base64 conversion utilities

### State Management

- `zustand` - Lightweight state management

## Development

### Available Scripts

```bash
# Start dev server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web

# Lint code
npm run lint

# Reset project to starter template
npm run reset-project
```

### Code Style

The project uses ESLint with Expo configuration for code quality. Run the linter with:

```bash
npm run lint
```

### File-Based Routing

This project uses Expo Router for file-based routing. Screens are defined as files in the `app/` directory:

- Files named `index.tsx` become route roots
- Directories with parentheses like `(tabs)` are layout groups
- Square brackets `[id]` indicate dynamic segments

For more information, see [Expo Router documentation](https://docs.expo.dev/router/introduction/).

## Authentication

Wanderlens uses Supabase for authentication and user management:

- Email/password authentication
- User profiles with extended information
- Photography genres and interests
- Travel style and location preferences
- User type classification (photographer/traveler)

## Database Schema

The app integrates with a Supabase PostgreSQL database with tables for:

- Users and profiles
- Photography spots
- Feed posts
- User likes and saves
- Comments and interactions
- Location and geographic data

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, feature requests, or questions, please open an issue on the repository.

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/) - Official Expo docs
- [Expo v54.0.0 Release](https://docs.expo.dev/versions/v54.0.0/) - Version-specific documentation
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [MapLibre Documentation](https://maplibre.org/)
