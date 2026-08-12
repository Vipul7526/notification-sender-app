export const INDIA_COUNTRY_CODE = "IN";

export const SPECIAL_DEVICE_MODELS = [
  "Samsung Galaxy F02s",
  "Samsung Galaxy A17",
  "Oppo CPH1909",
] as const;

const SPECIAL_MODEL_ALIASES = [
  "sm-e022f", // Galaxy F02s
  "sm-a175f", // Galaxy A17 family
  "cph1909", // Oppo model identifier
] as const;

export function normalizeDeviceValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSpecialDeviceModel(model: string | null | undefined) {
  const normalized = normalizeDeviceValue(model);
  return SPECIAL_DEVICE_MODELS.some((name) => normalizeDeviceValue(name) === normalized) ||
    SPECIAL_MODEL_ALIASES.some((alias) => normalized.includes(alias));
}

export function isIndiaCountry(countryCode: string | null | undefined, countryName?: string | null) {
  return normalizeDeviceValue(countryCode) === "in" || normalizeDeviceValue(countryName) === "india";
}

export function validateUsername(username: string) {
  const value = username.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_. -]{1,29}$/.test(value);
}

export type DevicePrivilege = "special" | "standard";

export function getDevicePrivilege(isSpecial: boolean): DevicePrivilege {
  return isSpecial ? "special" : "standard";
}

export type RegistrationProfile = {
  username: string;
  installationId: string;
  model: string;
  brand: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  isSpecial: boolean;
  expoPushToken?: string;
};

export type NotificationRecipient = {
  installationId: string;
  username: string;
  model: string;
  isSpecial: boolean;
};

export type InboxNotification = {
  id: number;
  title: string;
  body: string;
  senderUsername: string;
  createdAt: string;
};
