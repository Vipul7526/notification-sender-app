import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  createInboxEntries,
  createNotification,
  getDeviceByInstallationId,
  listActiveDevices,
  listInbox,
  registerDevice,
  updateDevicePushToken,
} from "./db";
import { sendExpoPushMessages } from "./notification-delivery";
import { isIndiaCountry, isSpecialDeviceModel, validateUsername } from "../shared/notification-policy";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  notifications: router({
    register: publicProcedure
      .input(
        z.object({
          username: z.string().min(2).max(30),
          installationId: z.string().min(8).max(128),
          model: z.string().min(1).max(128),
          brand: z.string().min(1).max(64),
          countryCode: z.string().min(2).max(8),
          countryName: z.string().min(2).max(128),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        }),
      )
      .mutation(async ({ input }) => {
        if (!validateUsername(input.username)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use 2–30 letters, numbers, spaces, dots, dashes, or underscores." });
        }
        if (!isIndiaCountry(input.countryCode, input.countryName)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Registration is available only while you are in India." });
        }

        const record = await registerDevice({
          ...input,
          isSpecial: isSpecialDeviceModel(input.model),
          isActive: true,
        });

        return {
          username: record?.username ?? input.username.trim(),
          installationId: record?.installationId ?? input.installationId,
          model: record?.model ?? input.model,
          brand: record?.brand ?? input.brand,
          countryCode: record?.countryCode ?? input.countryCode,
          countryName: record?.countryName ?? input.countryName,
          isSpecial: record?.isSpecial ?? isSpecialDeviceModel(input.model),
        };
      }),

    savePushToken: publicProcedure
      .input(z.object({ installationId: z.string().min(8).max(128), expoPushToken: z.string().min(1).max(512) }))
      .mutation(async ({ input }) => {
        const device = await getDeviceByInstallationId(input.installationId);
        if (!device) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Register this device before enabling notifications." });
        }
        await updateDevicePushToken(input.installationId, input.expoPushToken);
        return { success: true } as const;
      }),

    recipients: publicProcedure.query(async () => {
      const devices = await listActiveDevices();
      return devices.map((device) => ({
        installationId: device.installationId,
        username: device.username,
        model: device.model,
        isSpecial: device.isSpecial,
      }));
    }),

    inbox: publicProcedure
      .input(z.object({ installationId: z.string().min(8).max(128) }))
      .query(async ({ input }) => {
        const entries = await listInbox(input.installationId);
        return entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          body: entry.body,
          senderUsername: entry.senderUsername,
          createdAt: entry.createdAt.toISOString(),
        }));
      }),

    send: publicProcedure
      .input(
        z.object({
          senderInstallationId: z.string().min(8).max(128),
          title: z.string().trim().min(1).max(120),
          body: z.string().trim().min(1).max(2000),
          recipientInstallationId: z.string().min(8).max(128).nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const sender = await getDeviceByInstallationId(input.senderInstallationId);
        if (!sender) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Register this device before sending notifications." });
        }

        const activeDevices = await listActiveDevices();
        const recipients = input.recipientInstallationId
          ? activeDevices.filter((device) => device.installationId === input.recipientInstallationId)
          : activeDevices.filter((device) => device.installationId !== input.senderInstallationId);

        if (input.recipientInstallationId && recipients.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That recipient is no longer registered." });
        }

        const stored = await createNotification({
          senderInstallationId: sender.installationId,
          senderUsername: sender.username,
          recipientInstallationId: input.recipientInstallationId ?? null,
          title: input.title,
          body: input.body,
        });

        await createInboxEntries(
          recipients.map((recipient) => ({
            notificationId: stored.id,
            recipientInstallationId: recipient.installationId,
            senderUsername: sender.username,
            title: input.title,
            body: input.body,
            deliveryStatus: "queued" as const,
          })),
        );

        const delivery = await sendExpoPushMessages(
          recipients.flatMap((recipient) =>
            recipient.expoPushToken
              ? [{
                  to: recipient.expoPushToken,
                  title: input.title,
                  body: input.body,
                  sound: "default" as const,
                  data: { senderUsername: sender.username, notificationId: stored.id },
                }]
              : [],
          ),
        );

        return {
          success: true,
          recipientCount: recipients.length,
          deliveredCount: delivery.sent,
          pendingCount: recipients.length - delivery.sent,
        } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
