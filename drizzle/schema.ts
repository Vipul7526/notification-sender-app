import {
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const deviceRegistrations = mysqlTable(
  "deviceRegistrations",
  {
    id: int("id").autoincrement().primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    installationId: varchar("installationId", { length: 128 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    brand: varchar("brand", { length: 64 }).notNull(),
    countryCode: varchar("countryCode", { length: 8 }).notNull(),
    countryName: varchar("countryName", { length: 128 }).notNull(),
    latitude: double("latitude").notNull(),
    longitude: double("longitude").notNull(),
    isSpecial: boolean("isSpecial").default(false).notNull(),
    expoPushToken: text("expoPushToken"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    installationUnique: uniqueIndex("deviceRegistrations_installationId_unique").on(table.installationId),
    usernameIndex: index("deviceRegistrations_username_idx").on(table.username),
  }),
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    senderInstallationId: varchar("senderInstallationId", { length: 128 }).notNull(),
    senderUsername: varchar("senderUsername", { length: 64 }).notNull(),
    recipientInstallationId: varchar("recipientInstallationId", { length: 128 }),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    senderIndex: index("notifications_sender_idx").on(table.senderInstallationId),
    recipientIndex: index("notifications_recipient_idx").on(table.recipientInstallationId),
  }),
);

export const notificationInboxes = mysqlTable(
  "notificationInboxes",
  {
    id: int("id").autoincrement().primaryKey(),
    notificationId: int("notificationId").notNull(),
    recipientInstallationId: varchar("recipientInstallationId", { length: 128 }).notNull(),
    senderUsername: varchar("senderUsername", { length: 64 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["queued", "delivered", "failed"]).default("queued").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    recipientIndex: index("notificationInboxes_recipient_idx").on(table.recipientInstallationId),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DeviceRegistration = typeof deviceRegistrations.$inferSelect;
export type InsertDeviceRegistration = typeof deviceRegistrations.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NotificationInbox = typeof notificationInboxes.$inferSelect;
