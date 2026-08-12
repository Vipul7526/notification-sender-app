import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import {
  getDevicePrivilege,
  isIndiaCountry,
  isSpecialDeviceModel,
  validateUsername,
  type InboxNotification,
  type RegistrationProfile,
} from "@/shared/notification-policy";

const PROFILE_KEY = "notification-sender-profile-v1";
const INSTALLATION_KEY = "notification-sender-installation-v1";

type LocationState = "idle" | "checking" | "approved" | "blocked" | "unavailable";

type DeviceSnapshot = {
  brand: string;
  model: string;
  isSpecial: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getInstallationId() {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const generated = `install-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, generated);
  return generated;
}

async function verifyIndiaLocation() {
  if (Platform.OS === "web") {
    throw new Error("India verification is available in the Android APK, not in the web preview.");
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("Turn on Location Services, then try again.");
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission is required to register in India.");
  }

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const places = await Location.reverseGeocodeAsync({
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
  });
  const place = places[0];
  const countryCode = place?.isoCountryCode ?? "";
  const countryName = place?.country ?? "";

  if (!isIndiaCountry(countryCode, countryName)) {
    throw new Error("Registration is available only while you are in India.");
  }

  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
    countryCode: countryCode.toUpperCase(),
    countryName: countryName || "India",
  };
}

async function registerForPushNotifications() {
  if (Platform.OS === "web" || !Device.isDevice) return null;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#25C7C9",
  });

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus = existing.status === "granted"
    ? existing.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "warning" | "error" | "neutral" }) {
  return (
    <View style={[styles.statusPill, styles[`statusPill_${tone}`]]}>
      <View style={[styles.statusDot, styles[`statusDot_${tone}`]]} />
      <Text style={[styles.statusPillText, styles[`statusPillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const [profile, setProfile] = useState<RegistrationProfile | null>(null);
  const [username, setUsername] = useState("");
  const [device, setDevice] = useState<DeviceSnapshot>({ brand: "Android", model: "Detecting device…", isSpecial: false });
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [locationMessage, setLocationMessage] = useState("Location permission is required before registration.");
  const [registrationError, setRegistrationError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const registerMutation = trpc.notifications.register.useMutation();
  const saveTokenMutation = trpc.notifications.savePushToken.useMutation();
  const sendMutation = trpc.notifications.send.useMutation();
  const recipientsQuery = trpc.notifications.recipients.useQuery(undefined, { enabled: Boolean(profile) });
  const inboxQuery = trpc.notifications.inbox.useQuery(
    { installationId: profile?.installationId ?? "pending-installation" },
    { enabled: Boolean(profile) },
  );
  const refetchInbox = inboxQuery.refetch;

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(PROFILE_KEY),
    ]).then(([stored]) => {
      if (!active) return;
      if (stored) {
        try {
          setProfile(JSON.parse(stored) as RegistrationProfile);
        } catch {
          AsyncStorage.removeItem(PROFILE_KEY);
        }
      }
      const brand = Device.manufacturer || "Android";
      const model = Device.modelName || Device.osBuildId || "Android device";
      setDevice({ brand, model, isSpecial: isSpecialDeviceModel(model) });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const receivedListener = Notifications.addNotificationReceivedListener(() => {
      void refetchInbox();
    });
    return () => receivedListener.remove();
  }, [refetchInbox]);

  const inbox = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const recipients = useMemo(() => recipientsQuery.data ?? [], [recipientsQuery.data]);
  const privilege = getDevicePrivilege(profile?.isSpecial ?? device.isSpecial);

  async function handleVerifyLocation() {
    setLocationState("checking");
    setRegistrationError("");
    try {
      const result = await verifyIndiaLocation();
      setLocationState("approved");
      setLocationMessage(`India confirmed · ${result.countryCode}`);
    } catch (error) {
      setLocationState(error instanceof Error && error.message.includes("only") ? "blocked" : "unavailable");
      setLocationMessage(error instanceof Error ? error.message : "We could not verify your location.");
    }
  }

  async function handleRegister() {
    const trimmed = username.trim();
    if (!validateUsername(trimmed)) {
      setRegistrationError("Use 2–30 letters, numbers, spaces, dots, dashes, or underscores.");
      return;
    }
    setRegistrationError("");
    if (locationState !== "approved") {
      setRegistrationError("Verify your India location before registering.");
      return;
    }

    setIsResetting(true);
    try {
      const location = await verifyIndiaLocation();
      const installationId = await getInstallationId();
      const registered = await registerMutation.mutateAsync({
        username: trimmed,
        installationId,
        model: device.model,
        brand: device.brand,
        countryCode: location.countryCode,
        countryName: location.countryName,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        await saveTokenMutation.mutateAsync({ installationId, expoPushToken: pushToken });
      }
      const nextProfile: RegistrationProfile = { ...registered, ...location, installationId, expoPushToken: pushToken ?? undefined };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed. Please try again.";
      setRegistrationError(message);
      if (message.includes("only in India")) setLocationState("blocked");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleSend() {
    if (!profile || !title.trim() || !body.trim()) return;
    setSendMessage("");
    try {
      const result = await sendMutation.mutateAsync({
        senderInstallationId: profile.installationId,
        title: title.trim(),
        body: body.trim(),
        recipientInstallationId: selectedRecipient,
      });
      setTitle("");
      setBody("");
      setSendMessage(result.recipientCount > 0
        ? `Sent to ${result.recipientCount} device${result.recipientCount === 1 ? "" : "s"}.`
        : "Notification saved. No other registered device is online yet.");
      void refetchInbox();
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : "Could not send notification.");
    }
  }

  async function handleReset() {
    Alert.alert("Reset registration?", "This removes this device from the app on this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(PROFILE_KEY);
          setProfile(null);
          setUsername("");
          setLocationState("idle");
          setLocationMessage("Location permission is required before registration.");
        },
      },
    ]);
  }

  if (!profile) {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <FlatList
            data={[{ key: "registration" }]}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.registrationContent}
            renderItem={() => (
              <View>
                <View style={styles.brandRow}>
                  <View style={styles.logoMark}><IconSymbol name="bell.fill" size={25} color="#FFFFFF" /></View>
                  <View>
                    <Text style={styles.eyebrow}>NOTIFICATION SENDER</Text>
                    <Text style={[styles.brandName, { color: colors.foreground }]}>Stay in the loop.</Text>
                  </View>
                </View>

                <View style={styles.heroCopy}>
                  <Text style={[styles.heroTitle, { color: colors.foreground }]}>One place for every alert.</Text>
                  <Text style={[styles.heroBody, { color: colors.muted }]}>Register this device to send and receive notifications with other approved users.</Text>
                </View>

                <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardIcon}><IconSymbol name="iphone" size={21} color="#25C7C9" /></View>
                  <View style={styles.flex}>
                    <Text style={[styles.cardLabel, { color: colors.muted }]}>THIS DEVICE</Text>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{device.model}</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{device.brand} · {device.isSpecial ? "Special privilege eligible" : "Standard access"}</Text>
                  </View>
                  <StatusPill label={device.isSpecial ? "Special" : "Standard"} tone={device.isSpecial ? "success" : "neutral"} />
                </View>

                <Text style={[styles.inputLabel, { color: colors.foreground }]}>Choose a username</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="e.g. arjun.notifications"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                />

                <View style={[styles.locationCard, { backgroundColor: colors.surface, borderColor: locationState === "blocked" ? colors.error : colors.border }]}>
                  <View style={[styles.locationIcon, { backgroundColor: locationState === "approved" ? "#DDF8F4" : "#FFF3E8" }]}>
                    <IconSymbol name="location.fill" size={20} color={locationState === "approved" ? "#0F9F8C" : "#D97706"} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>India-only registration</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{locationMessage}</Text>
                  </View>
                  {locationState === "checking" ? <ActivityIndicator color="#25C7C9" /> : (
                    <Pressable onPress={handleVerifyLocation} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
                      <Text style={styles.smallButtonText}>{locationState === "approved" ? "Recheck" : "Verify"}</Text>
                    </Pressable>
                  )}
                </View>

                {registrationError ? <Text style={[styles.errorText, { color: colors.error }]}>{registrationError}</Text> : null}

                <Pressable
                  onPress={handleRegister}
                  disabled={isResetting || locationState !== "approved"}
                  style={({ pressed }) => [styles.primaryButton, (isResetting || locationState !== "approved") && styles.disabledButton, pressed && styles.pressed]}
                >
                  {isResetting ? <ActivityIndicator color="#07142F" /> : <Text style={styles.primaryButtonText}>Register this device</Text>}
                </Pressable>

                <View style={styles.policyNote}>
                  <IconSymbol name="checkmark.circle.fill" size={17} color="#25C7C9" />
                  <Text style={[styles.policyText, { color: colors.muted }]}>All Android devices can register. Samsung Galaxy F02s, Galaxy A17, and Oppo CPH1909 receive special privileges.</Text>
                </View>
              </View>
            )}
          />
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <FlatList
        data={inbox as InboxNotification[]}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={inboxQuery.isFetching} onRefresh={() => void inboxQuery.refetch()} tintColor="#25C7C9" />}
        contentContainerStyle={styles.dashboardContent}
        ListHeaderComponent={
          <View>
            <View style={styles.dashboardHeader}>
              <View>
                <Text style={styles.eyebrow}>NOTIFICATION HUB</Text>
                <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>Hello, {profile.username}</Text>
              </View>
              <View style={styles.avatar}><Text style={styles.avatarText}>{profile.username.slice(0, 1).toUpperCase()}</Text></View>
            </View>

            <View style={[styles.profileStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>REGISTERED DEVICE</Text>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{profile.model}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{profile.countryName} · {profile.expoPushToken ? "Push ready" : "Push setup pending"}</Text>
              </View>
              <StatusPill label={privilege === "special" ? "Special privilege" : "Standard access"} tone={privilege === "special" ? "success" : "neutral"} />
            </View>

            <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Send a notification</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.muted }]}>Broadcast to everyone or choose one device.</Text>
                </View>
                <IconSymbol name="paperplane.fill" size={22} color="#25C7C9" />
              </View>
              <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.muted} style={[styles.input, styles.composerInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.messageInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <FlatList
                data={[{ installationId: null, username: "Everyone", model: "All registered devices", isSpecial: false }, ...recipients]}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.installationId ?? "everyone"}
                contentContainerStyle={styles.recipientList}
                renderItem={({ item }) => {
                  const active = selectedRecipient === item.installationId;
                  return (
                    <Pressable onPress={() => setSelectedRecipient(item.installationId)} style={({ pressed }) => [styles.recipientChip, { borderColor: active ? "#25C7C9" : colors.border, backgroundColor: active ? "#E8FBFA" : colors.background }, pressed && styles.pressed]}>
                      <Text style={[styles.recipientName, { color: active ? "#087F7D" : colors.foreground }]}>{item.username}</Text>
                      <Text style={[styles.recipientModel, { color: colors.muted }]}>{item.installationId ? item.model : "Broadcast"}</Text>
                    </Pressable>
                  );
                }}
              />
              <Pressable onPress={handleSend} disabled={sendMutation.isPending || !title.trim() || !body.trim()} style={({ pressed }) => [styles.primaryButton, (sendMutation.isPending || !title.trim() || !body.trim()) && styles.disabledButton, pressed && styles.pressed]}>
                {sendMutation.isPending ? <ActivityIndicator color="#07142F" /> : <Text style={styles.primaryButtonText}>Send notification</Text>}
              </Pressable>
              {sendMessage ? <Text style={[styles.feedbackText, { color: sendMessage.startsWith("Could") ? colors.error : colors.muted }]}>{sendMessage}</Text> : null}
            </View>

            <View style={styles.inboxHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Received notifications</Text>
                <Text style={[styles.cardSubtitle, { color: colors.muted }]}>Your latest alerts appear here.</Text>
              </View>
              <StatusPill label={`${inbox.length} saved`} tone="neutral" />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.emptyIcon}><IconSymbol name="bell.fill" size={24} color="#25C7C9" /></View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Your inbox is quiet</Text>
            <Text style={[styles.cardSubtitle, { color: colors.muted }]}>Send a notification from another registered device to see it here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.notificationRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.notificationIcon}><IconSymbol name="bell.fill" size={17} color="#25C7C9" /></View>
            <View style={styles.flex}>
              <View style={styles.notificationTopline}><Text style={[styles.notificationTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.notificationTime, { color: colors.muted }]}>{formatTime(item.createdAt)}</Text></View>
              <Text style={[styles.notificationBody, { color: colors.muted }]}>{item.body}</Text>
              <Text style={[styles.notificationSender, { color: "#0F9F8C" }]}>From {item.senderUsername}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
            <IconSymbol name="gearshape.fill" size={16} color={colors.muted} />
            <Text style={[styles.resetButtonText, { color: colors.muted }]}>Reset this device registration</Text>
          </Pressable>
        }
      />
    </ScreenContainer>
  );
}

const styles = {
  flex: { flex: 1 },
  registrationContent: { paddingTop: 24, paddingBottom: 28 },
  dashboardContent: { paddingTop: 22, paddingBottom: 32 },
  brandRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, marginBottom: 30 },
  logoMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#0B1533", alignItems: "center" as const, justifyContent: "center" as const },
  eyebrow: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.5, color: "#0F9F8C" },
  brandName: { fontSize: 15, fontWeight: "700" as const, marginTop: 2 },
  heroCopy: { marginBottom: 24 },
  heroTitle: { fontSize: 35, lineHeight: 41, fontWeight: "800" as const, letterSpacing: -1 },
  heroBody: { fontSize: 16, lineHeight: 24, marginTop: 11, maxWidth: 340 },
  deviceCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, marginBottom: 25 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E8FBFA", alignItems: "center" as const, justifyContent: "center" as const },
  cardLabel: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.1 },
  cardTitle: { fontSize: 16, fontWeight: "700" as const, marginTop: 3 },
  cardSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  inputLabel: { fontSize: 13, fontWeight: "700" as const, marginBottom: 8 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 14 },
  locationCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 11, padding: 13, borderRadius: 18, borderWidth: 1, marginBottom: 12 },
  locationIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center" as const, justifyContent: "center" as const },
  smallButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "#DDF8F4" },
  smallButtonText: { color: "#087F7D", fontWeight: "800" as const, fontSize: 12 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#FF9933", alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 18, marginTop: 5 },
  primaryButtonText: { color: "#07142F", fontSize: 15, fontWeight: "800" as const },
  disabledButton: { opacity: 0.42 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  policyNote: { flexDirection: "row" as const, gap: 8, marginTop: 18, alignItems: "flex-start" as const },
  policyText: { fontSize: 12, lineHeight: 18, flex: 1 },
  errorText: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  statusPill: { flexDirection: "row" as const, gap: 6, alignItems: "center" as const, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusPill_success: { backgroundColor: "#DDF8F4" },
  statusPill_warning: { backgroundColor: "#FFF3E8" },
  statusPill_error: { backgroundColor: "#FDECEC" },
  statusPill_neutral: { backgroundColor: "#EEF2F6" },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  statusDot_success: { backgroundColor: "#0F9F8C" },
  statusDot_warning: { backgroundColor: "#D97706" },
  statusDot_error: { backgroundColor: "#D14343" },
  statusDot_neutral: { backgroundColor: "#718096" },
  statusPillText: { fontSize: 10, fontWeight: "800" as const },
  statusPillText_success: { color: "#087F7D" },
  statusPillText_warning: { color: "#B45309" },
  statusPillText_error: { color: "#B91C1C" },
  statusPillText_neutral: { color: "#536273" },
  dashboardHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, marginBottom: 20 },
  dashboardTitle: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: "#0B1533", alignItems: "center" as const, justifyContent: "center" as const },
  avatarText: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" as const },
  profileStrip: { flexDirection: "row" as const, alignItems: "center" as const, padding: 15, borderRadius: 19, borderWidth: 1, marginBottom: 17, gap: 10 },
  composerCard: { padding: 16, borderRadius: 22, borderWidth: 1, marginBottom: 25 },
  sectionHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 14 },
  composerInput: { marginBottom: 10, minHeight: 46 },
  messageInput: { minHeight: 88, textAlignVertical: "top" as const },
  recipientList: { gap: 8, paddingBottom: 14 },
  recipientChip: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minWidth: 102 },
  recipientName: { fontSize: 12, fontWeight: "800" as const },
  recipientModel: { fontSize: 10, marginTop: 2, maxWidth: 130 },
  feedbackText: { fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: "center" as const },
  inboxHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, marginBottom: 12 },
  sectionTitle: { fontSize: 19, fontWeight: "800" as const },
  emptyState: { alignItems: "center" as const, padding: 22, borderWidth: 1, borderRadius: 19, marginBottom: 10 },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: "#E8FBFA", alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 10 },
  notificationRow: { flexDirection: "row" as const, gap: 11, padding: 14, borderRadius: 17, borderWidth: 1, marginBottom: 9 },
  notificationIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#E8FBFA", alignItems: "center" as const, justifyContent: "center" as const },
  notificationTopline: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, gap: 8 },
  notificationTitle: { fontSize: 14, fontWeight: "800" as const, flex: 1 },
  notificationTime: { fontSize: 10 },
  notificationBody: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  notificationSender: { fontSize: 11, fontWeight: "700" as const, marginTop: 5 },
  resetButton: { flexDirection: "row" as const, gap: 7, justifyContent: "center" as const, alignItems: "center" as const, paddingVertical: 20 },
  resetButtonText: { fontSize: 12, fontWeight: "700" as const },
} satisfies Record<string, object>;
