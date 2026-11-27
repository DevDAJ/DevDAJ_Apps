import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider } from "tamagui";

import { AuthProvider, useAuth } from "../components/auth/AuthProvider";
import { useHouseholdStore } from "../lib/householdStore";
import { colors } from "../lib/theme";
import config from "../tamagui.config";

function HouseholdSync() {
  const { session, loading } = useAuth();
  const signedIn = Boolean(session && !loading);
  const userId = session?.user.id;
  const activeId = useHouseholdStore((store) => store.activeId);
  const loadHouseholds = useHouseholdStore((store) => store.loadHouseholds);
  const clear = useHouseholdStore((store) => store.clear);
  const sync = useHouseholdStore((store) => store.sync);

  useEffect(() => {
    if (signedIn) {
      void loadHouseholds();
    } else {
      clear();
    }
  }, [signedIn, userId, loadHouseholds, clear]);

  useEffect(() => {
    if (!signedIn || !activeId) return;
    void sync();
  }, [signedIn, activeId, sync]);

  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    const timer = setInterval(() => void sync(), 30_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [signedIn, sync]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TamaguiProvider config={config} defaultTheme="dark">
        <AuthProvider>
          <HouseholdSync />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </AuthProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}
