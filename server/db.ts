import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";
import {
  deviceRegistrations,
  notificationInboxes,
  notifications,
  users,
  type InsertDeviceRegistration,
  type InsertUser,
} from "../drizzle/schema";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (database) return database;
  if (!ENV.databaseUrl) return null;
  database = drizzle({ connection: { uri: ENV.databaseUrl } });
  return database;
}

export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  if (!db) return null;

  await db
    .insert(users)
    .values(user)
    .onDuplicateKeyUpdate({
      set: {
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        lastSignedIn: user.lastSignedIn,
        updatedAt: new Date(),
      },
    });

  return getUserByOpenId(user.openId);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0] ?? null;
}

type DeviceRecord = InsertDeviceRegistration & {
  id: number;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationRecord = {
  id: number;
  senderInstallationId: string;
  senderUsername: string;
  recipientInstallationId: string | null;
  title: string;
  body: string;
  createdAt: Date;
};

type InboxRecord = {
  id: number;
  notificationId: number;
  recipientInstallationId: string;
  senderUsername: string;
  title: string;
  body: string;
  deliveryStatus: "queued" | "delivered" | "failed";
  createdAt: Date;
};

const memoryDevices = new Map<string, DeviceRecord>();
const memoryNotifications: NotificationRecord[] = [];
const memoryInbox: InboxRecord[] = [];
let memoryDeviceId = 1;
let memoryNotificationId = 1;
let memoryInboxId = 1;

function withDeviceTimestamps(data: InsertDeviceRegistration, id: number): DeviceRecord {
  const now = new Date();
  return { ...data, id, createdAt: now, updatedAt: now } as DeviceRecord;
}

export async function registerDevice(data: InsertDeviceRegistration) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDevices.get(data.installationId);
    const record = withDeviceTimestamps(data, existing?.id ?? memoryDeviceId++);
    memoryDevices.set(data.installationId, record);
    return record;
  }

  await db
    .insert(deviceRegistrations)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        username: data.username,
        model: data.model,
        brand: data.brand,
        countryCode: data.countryCode,
        countryName: data.countryName,
        latitude: data.latitude,
        longitude: data.longitude,
        isSpecial: data.isSpecial,
        isActive: true,
        updatedAt: new Date(),
      },
    });

  const rows = await db
    .select()
    .from(deviceRegistrations)
    .where(eq(deviceRegistrations.installationId, data.installationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDeviceByInstallationId(installationId: string) {
  const db = await getDb();
  if (!db) return memoryDevices.get(installationId) ?? null;
  const rows = await db
    .select()
    .from(deviceRegistrations)
    .where(eq(deviceRegistrations.installationId, installationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDevicePushToken(installationId: string, expoPushToken: string) {
  const db = await getDb();
  if (!db) {
    const device = memoryDevices.get(installationId);
    if (!device) return null;
    const updated = { ...device, expoPushToken, updatedAt: new Date() };
    memoryDevices.set(installationId, updated);
    return updated;
  }

  await db
    .update(deviceRegistrations)
    .set({ expoPushToken, isActive: true, updatedAt: new Date() })
    .where(eq(deviceRegistrations.installationId, installationId));
  return getDeviceByInstallationId(installationId);
}

export async function listActiveDevices() {
  const db = await getDb();
  if (!db) return [...memoryDevices.values()].filter((device) => device.isActive);
  return db.select().from(deviceRegistrations).where(eq(deviceRegistrations.isActive, true));
}

export async function createNotification(data: Omit<NotificationRecord, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) {
    const record: NotificationRecord = { ...data, id: memoryNotificationId++, createdAt: new Date() };
    memoryNotifications.push(record);
    return record;
  }

  const result = await db.insert(notifications).values(data);
  const id = Number(result[0]?.insertId ?? 0);
  const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return rows[0] ?? { ...data, id, createdAt: new Date() };
}

export async function createInboxEntries(
  entries: Array<Omit<InboxRecord, "id" | "createdAt">>,
) {
  if (entries.length === 0) return [];
  const db = await getDb();
  if (!db) {
    const records = entries.map((entry) => ({ ...entry, id: memoryInboxId++, createdAt: new Date() }));
    memoryInbox.push(...records);
    return records;
  }

  await db.insert(notificationInboxes).values(entries);
  return entries;
}

export async function listInbox(installationId: string) {
  const db = await getDb();
  if (!db) {
    return memoryInbox
      .filter((entry) => entry.recipientInstallationId === installationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(notificationInboxes)
    .where(eq(notificationInboxes.recipientInstallationId, installationId))
    .orderBy(desc(notificationInboxes.createdAt));
}
