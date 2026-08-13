import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

describe("Firebase Android configuration", () => {
  it("matches the app package identifier", () => {
    const firebase = JSON.parse(fs.readFileSync(path.join(projectRoot, "google-services.json"), "utf8"));
    expect(firebase.project_info.project_id).toBe("notification-4325");
    expect(firebase.client[0].client_info.android_client_info.package_name).toBe("com.app.notificationsenderapp");
  });

  it("is referenced by the Expo Android config", () => {
    const configSource = fs.readFileSync(path.join(projectRoot, "app.config.ts"), "utf8");
    expect(configSource).toContain('googleServicesFile: "./google-services.json"');
    expect(configSource).toContain('androidPackage: bundleId');
    expect(configSource).toContain('appName: "Notification Sender"');
  });
});
