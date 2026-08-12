# Design: Notification Sender App

## 1. Overview & Principles
- **Target Platform**: Android APK (React Native / Expo SDK 54).
- **Design Philosophy**: Clean, minimal, one-handed navigation inspired by modern iOS/Android guidelines. High contrast typography, clear status indicators for device privileges and location validation.
- **Orientation**: Portrait (9:16).

## 2. Screen List
1. **Registration / Welcome Screen**:
   - Username input field.
   - Device detection card showing current device model (e.g. Samsung Galaxy F02s, Galaxy A17, Oppo CPH1909, or Standard Device) and special privilege status.
   - Location verification status (checking India GPS / IP region).
   - "Register Device" primary button.
2. **Dashboard / Notification Hub**:
   - User profile & device model badge ("Special Privilege Active" vs "Standard Device").
   - Send Notification Section: Title, body, target recipient selector (All users, or specific username), and "Send Notification" button.
   - Inbox / Received Notifications List: Displays all notifications received on this device with timestamps.
3. **Settings / Status Screen**:
   - Device hardware info (Model, OS, Push Token status).
   - Location details (Last checked coordinates / India region check).
   - Logout / Reset registration.

## 3. Key User Flows
- **Flow 1: App Launch & Registration gaurd**
  - App checks if already registered in local storage. If not, prompts for Username.
  - Requests Location permission and checks if user is in India. If outside India, displays blocking error ("Registration restricted to India only").
  - Detects device model via `expo-device`. If model is Samsung Galaxy F02s, Galaxy A17, or Oppo CPH1909, grants Special Privilege badge.
  - User taps Register -> saves profile and proceeds to Dashboard.
- **Flow 2: Sending Notifications**
  - User enters notification Title and Body.
  - Taps Send -> broadcast or targets specific registered user/device.
- **Flow 3: Receiving Notifications**
  - Local & push notification listeners catch incoming messages and render them in the app inbox and system notification tray.
