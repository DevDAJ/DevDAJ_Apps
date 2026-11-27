import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text } from "tamagui";

import { AppButton, Card, ScreenTitle, SectionLabel } from "../../components/ui";
import { useHouseholdStore, useRows } from "../../lib/householdStore";
import { colors, fontSizes, spacing } from "../../lib/theme";

export default function GroceryListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = id ?? "";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lists = useRows("grocery_list");
  const allItems = useRows("grocery_item");
  const upsert = useHouseholdStore((store) => store.upsert);
  const remove = useHouseholdStore((store) => store.remove);
  const list = lists.find((item) => item.id === listId);
  const items = allItems
    .filter((item) => item.listId === listId)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!list) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xl,
          gap: spacing.md,
        }}
      >
        <ScreenTitle>List not found</ScreenTitle>
        <AppButton onPress={() => router.back()}>Back</AppButton>
      </ScrollView>
    );
  }

  const setComplete = (completed: boolean) => {
    const { id: listRowId, ...listData } = list;
    upsert("grocery_list", listRowId, {
      ...listData,
      completedAt: completed ? new Date().toISOString() : null,
    });
  };

  const deleteList = () => {
    Alert.alert("Delete list?", "This removes the list and all of its items.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          for (const item of items) remove("grocery_item", item.id);
          remove("grocery_list", list.id);
          router.back();
        },
      },
    ]);
  };

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
      <Button
        accessibilityLabel="Back to grocery lists"
        accessibilityRole="button"
        alignSelf="flex-start"
        backgroundColor="transparent"
        borderWidth={0}
        minHeight={0}
        onPress={() => router.back()}
        paddingVertical={spacing.sm}
        pressStyle={{ opacity: 0.7 }}
      >
        <Text color={colors.brand} fontSize={fontSizes.sm} fontWeight="600">
          Back
        </Text>
      </Button>
      <ScreenTitle>{list.title}</ScreenTitle>
      {list.completedAt ? (
        <Text color={colors.success} fontSize={fontSizes.sm} fontWeight="700">
          Done
        </Text>
      ) : null}

      <Card>
        <SectionLabel>Items</SectionLabel>
        {items.length === 0 ? (
          <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.sm}>
            Nothing to buy.
          </Text>
        ) : (
          items.map((item) => (
            <Button
              accessibilityLabel={`${item.checked ? "Uncheck" : "Check"} ${item.name}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              alignItems="center"
              backgroundColor="transparent"
              borderWidth={0}
              borderBottomColor={colors.border}
              borderBottomWidth={1}
              flexDirection="row"
              gap={spacing.md}
              key={item.id}
              minHeight={0}
              onPress={() => {
                const { id: itemRowId, ...itemData } = item;
                upsert("grocery_item", itemRowId, { ...itemData, checked: !item.checked });
              }}
              paddingVertical={spacing.sm}
              pressStyle={{ opacity: 0.75 }}
            >
              <Ionicons
                name={item.checked ? "checkbox" : "square-outline"}
                size={22}
                color={item.checked ? colors.brand : colors.textMuted}
              />
              <Text
                color={item.checked ? colors.textMuted : colors.text}
                flexShrink={1}
                fontSize={fontSizes.sm}
                textDecorationLine={item.checked ? "line-through" : "none"}
              >
                {item.name}
              </Text>
              <Text color={colors.textMuted} fontSize={fontSizes.sm}>
                {item.quantity === null ? "" : item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </Text>
            </Button>
          ))
        )}
      </Card>

      <AppButton
        accessibilityLabel={list.completedAt ? "Reopen list" : "Mark list complete"}
        onPress={() => setComplete(!list.completedAt)}
      >
        {list.completedAt ? "Reopen" : "Mark complete"}
      </AppButton>
      <AppButton accessibilityLabel="Delete grocery list" onPress={deleteList} variant="danger">
        Delete list
      </AppButton>
    </ScrollView>
  );
}
