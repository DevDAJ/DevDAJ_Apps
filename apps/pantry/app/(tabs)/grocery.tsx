import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text } from "tamagui";

import { AppButton, Card, ScreenTitle } from "../../components/ui";
import { useRows } from "../../lib/householdStore";
import { colors, fontSizes, radii, spacing } from "../../lib/theme";

export default function GroceryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lists = useRows("grocery_list");
  const items = useRows("grocery_item");
  const sorted = useMemo(
    () =>
      [...lists].sort((a, b) => {
        if (Boolean(a.completedAt) !== Boolean(b.completedAt)) {
          return a.completedAt ? 1 : -1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [lists],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingHorizontal: spacing.screen,
        paddingBottom: 100,
        paddingTop: insets.top + spacing.lg,
        gap: spacing.md,
      }}
    >
      <ScreenTitle>Grocery</ScreenTitle>
      <AppButton accessibilityLabel="New grocery list" onPress={() => router.push("/grocery/new")}>
        New list
      </AppButton>
      {sorted.length === 0 ? (
        <Card>
          <Text color={colors.textSecondary} fontSize={fontSizes.sm} lineHeight={20}>
            No lists yet. Pick a few recipes to build one.
          </Text>
        </Card>
      ) : (
        sorted.map((list) => {
          const listItems = items.filter((item) => item.listId === list.id);
          const checked = listItems.filter((item) => item.checked).length;
          return (
            <Button
              accessibilityLabel={`Open ${list.title}`}
              accessibilityRole="button"
              backgroundColor="transparent"
              borderWidth={0}
              borderRadius={radii.lg}
              key={list.id}
              minHeight={0}
              onPress={() => router.push(`/grocery/${list.id}`)}
              padding={0}
              pressStyle={{ opacity: 0.8 }}
            >
              <Card flex={1}>
                <Text color={colors.text} fontSize={fontSizes.md} fontWeight="700">
                  {list.title}
                </Text>
                <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.xs}>
                  {list.completedAt ? "Done, " : ""}
                  {checked} of {listItems.length} checked
                </Text>
              </Card>
            </Button>
          );
        })
      )}
    </ScrollView>
  );
}
