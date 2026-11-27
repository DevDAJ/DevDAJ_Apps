import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";

import { useAuth } from "../../components/auth/AuthProvider";
import { useHouseholdStore } from "../../lib/householdStore";
import { colors, radii, spacing } from "../../lib/theme";

function TabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <YStack alignItems="center" opacity={focused ? 1 : 0.72}>
      <Ionicons name={name} size={22} color={focused ? colors.brand : colors.textMuted} />
    </YStack>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const households = useHouseholdStore((store) => store.households);
  const activeId = useHouseholdStore((store) => store.activeId);

  if (!loading && !session) return <Redirect href="/auth" />;
  if (!loading && households.length > 0 && !activeId) return <Redirect href="/household" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderTopWidth: 1,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: spacing.sm,
          paddingHorizontal: spacing.xs,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.24,
          shadowRadius: 18,
          elevation: 12,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Recipes",
          tabBarIcon: ({ focused }) => <TabIcon name="book-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: "Pantry",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="file-tray-stacked-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: "Grocery",
          tabBarIcon: ({ focused }) => <TabIcon name="cart-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: "Household",
          tabBarIcon: ({ focused }) => <TabIcon name="people-outline" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
