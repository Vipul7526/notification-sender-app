import { describe, expect, it } from "vitest";
import {
  getDevicePrivilege,
  isIndiaCountry,
  isSpecialDeviceModel,
  validateUsername,
} from "../shared/notification-policy";

describe("notification registration policy", () => {
  it("accepts India country code and country name", () => {
    expect(isIndiaCountry("IN", "India")).toBe(true);
    expect(isIndiaCountry("in", "")).toBe(true);
    expect(isIndiaCountry("US", "United States")).toBe(false);
  });

  it("recognizes the three privileged device families", () => {
    expect(isSpecialDeviceModel("Samsung Galaxy F02s")).toBe(true);
    expect(isSpecialDeviceModel("Samsung Galaxy A17")).toBe(true);
    expect(isSpecialDeviceModel("Oppo CPH1909")).toBe(true);
    expect(isSpecialDeviceModel("SM-E022F")).toBe(true);
    expect(isSpecialDeviceModel("Pixel 8")).toBe(false);
  });

  it("validates usernames with the product rules", () => {
    expect(validateUsername("arjun.notifications")).toBe(true);
    expect(validateUsername("a")).toBe(false);
    expect(validateUsername("bad/name")).toBe(false);
    expect(validateUsername("  valid-user  ")).toBe(true);
  });

  it("maps special and standard devices to the correct privilege", () => {
    expect(getDevicePrivilege(true)).toBe("special");
    expect(getDevicePrivilege(false)).toBe("standard");
  });
});
