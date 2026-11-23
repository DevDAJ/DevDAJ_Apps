import { requireOptionalNativeModule } from "expo";
import { openDatabaseAsync } from "expo-sqlite";
import { type AppData, createAppData, type NativeAppData } from "./core";

export * from "./core";
export * from "./shared";
export type { SQLiteDatabase } from "expo-sqlite";

/** Shared on-device data for this app. See README.md. */
export const appData: AppData = createAppData({
  native: requireOptionalNativeModule<NativeAppData>("DevdajAppData"),
  platform: process.env.EXPO_OS,
  open: (name, directory, newConnection) =>
    openDatabaseAsync(name, { useNewConnection: newConnection }, directory),
});
