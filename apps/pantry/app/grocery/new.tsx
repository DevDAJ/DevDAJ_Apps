import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack } from "tamagui";

import { AppButton, AppTextInput, Card, ScreenTitle, SectionLabel } from "../../components/ui";
import { buildGroceryItems } from "../../lib/grocery";
import { useHouseholdStore, useRows } from "../../lib/householdStore";
import { colors, fontSizes, spacing } from "../../lib/theme";

export default function NewGroceryListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const recipes = useRows("recipe");
  const pantry = useRows("pantry_item");
  const upsert = useHouseholdStore((store) => store.upsert);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);

  const sortedRecipes = useMemo(
    () => [...recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
  );
  const chosen = sortedRecipes.filter((recipe) => selected.includes(recipe.id));
  const autoTitle = chosen.map((recipe) => recipe.title).join(", ");
  const items = useMemo(() => buildGroceryItems(chosen, pantry), [chosen, pantry]);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const create = () => {
    if (selected.length === 0) return;
    const listId = Crypto.randomUUID();
    const createdAt = new Date().toISOString();
    upsert("grocery_list", listId, {
      title: title.trim() || autoTitle || "Grocery list",
      recipeIds: selected,
      createdAt,
      completedAt: null,
    });
    for (const item of items) {
      upsert("grocery_item", Crypto.randomUUID(), { listId, ...item, checked: false });
    }
    router.replace(`/grocery/${listId}`);
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
      <ScreenTitle>New list</ScreenTitle>
      <Card>
        <SectionLabel>List title, optional</SectionLabel>
        <AppTextInput
          accessibilityLabel="Grocery list title"
          marginTop={spacing.sm}
          onChangeText={(value) => {
            setTitle(value);
            setTitleEdited(true);
          }}
          placeholder={autoTitle || "Grocery list"}
          value={titleEdited ? title : ""}
        />
      </Card>
      <Card>
        <SectionLabel>Pick recipes</SectionLabel>
        {sortedRecipes.length === 0 ? (
          <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.sm}>
            Add a recipe first to build a grocery list.
          </Text>
        ) : (
          sortedRecipes.map((recipe) => {
            const checked = selected.includes(recipe.id);
            return (
              <Button
                accessibilityLabel={`${checked ? "Unselect" : "Select"} ${recipe.title}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                alignItems="center"
                backgroundColor="transparent"
                borderWidth={0}
                borderBottomColor={colors.border}
                borderBottomWidth={1}
                flexDirection="row"
                gap={spacing.md}
                justifyContent="flex-start"
                key={recipe.id}
                minHeight={0}
                onPress={() => toggle(recipe.id)}
                paddingHorizontal={0}
                paddingVertical={spacing.sm}
                pressStyle={{ opacity: 0.75 }}
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? colors.brand : colors.textMuted}
                />
                <Text color={colors.text} flexShrink={1} fontSize={fontSizes.sm}>
                  {recipe.title}
                </Text>
              </Button>
            );
          })
        )}
      </Card>
      <Card>
        <SectionLabel>On your list</SectionLabel>
        {items.length === 0 ? (
          <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.sm}>
            You already have everything.
          </Text>
        ) : (
          items.map((item, index) => (
            <XStack
              borderBottomColor={colors.border}
              borderBottomWidth={1}
              gap={spacing.md}
              justifyContent="space-between"
              key={`${item.name}-${item.unit ?? ""}-${index}`}
              paddingVertical={spacing.sm}
            >
              <Text color={colors.text} flexShrink={1} fontSize={fontSizes.sm}>
                {item.name}
              </Text>
              <Text color={colors.textMuted} fontSize={fontSizes.sm}>
                {item.quantity === null ? "" : item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </Text>
            </XStack>
          ))
        )}
      </Card>
      <AppButton
        accessibilityLabel="Create grocery list"
        disabled={selected.length === 0}
        onPress={create}
      >
        Create list
      </AppButton>
    </ScrollView>
  );
}
