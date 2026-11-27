import * as Crypto from "expo-crypto";
import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack } from "tamagui";

import { AppButton, AppTextInput, Card, ScreenTitle, SectionLabel } from "../../components/ui";
import { useHouseholdStore, useRows } from "../../lib/householdStore";
import { colors, fontSizes, radii, spacing } from "../../lib/theme";
import type { PantryCategory } from "../../lib/types";

const SECTIONS: { category: PantryCategory; label: string }[] = [
  { category: "pantry", label: "Pantry items" },
  { category: "spices", label: "Dry spices & aromatics" },
  { category: "cold", label: "Cold storage" },
  { category: "meat", label: "Meats" },
];

export default function PantryScreen() {
  const insets = useSafeAreaInsets();
  const items = useRows("pantry_item");
  const upsert = useHouseholdStore((store) => store.upsert);
  const remove = useHouseholdStore((store) => store.remove);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PantryCategory>("pantry");
  const [message, setMessage] = useState("");

  const grouped = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        items: items
          .filter((item) => item.category === section.category)
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
    [items],
  );

  const add = () => {
    const trimmed = name.trim();
    setMessage("");
    if (!trimmed) {
      setMessage("Enter an item name.");
      return;
    }
    const duplicate = items.some(
      (item) =>
        item.category === category && item.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setMessage("That item is already in this section.");
      return;
    }
    upsert("pantry_item", Crypto.randomUUID(), { name: trimmed, category });
    setName("");
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
      <ScreenTitle>Pantry</ScreenTitle>
      <Card>
        <SectionLabel>Add an item</SectionLabel>
        <AppTextInput
          accessibilityLabel="Pantry item name"
          marginTop={spacing.sm}
          onChangeText={setName}
          placeholder="Item name"
          value={name}
        />
        <XStack flexWrap="wrap" gap={spacing.sm} marginTop={spacing.md}>
          {SECTIONS.map((section) => {
            const active = category === section.category;
            return (
              <Button
                accessibilityLabel={`Section ${section.label}`}
                accessibilityRole="button"
                backgroundColor={active ? colors.brandMuted : colors.surfaceRaised}
                borderColor={active ? colors.brand : colors.border}
                borderRadius={radii.full}
                borderWidth={1}
                key={section.category}
                minHeight={0}
                onPress={() => setCategory(section.category)}
                paddingHorizontal={spacing.md}
                paddingVertical={spacing.sm}
                pressStyle={{ opacity: 0.8 }}
              >
                <Text color={active ? colors.text : colors.textSecondary} fontSize={fontSizes.xs}>
                  {section.label}
                </Text>
              </Button>
            );
          })}
        </XStack>
        {message ? (
          <Text color={colors.danger} fontSize={fontSizes.sm} marginTop={spacing.sm}>
            {message}
          </Text>
        ) : null}
        <AppButton accessibilityLabel="Add pantry item" marginTop={spacing.md} onPress={add}>
          Add item
        </AppButton>
      </Card>

      {grouped.map((section) => (
        <Card key={section.category}>
          <SectionLabel>{section.label}</SectionLabel>
          {section.items.length === 0 ? (
            <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.sm}>
              Nothing here yet.
            </Text>
          ) : (
            section.items.map((item) => (
              <XStack
                alignItems="center"
                borderBottomColor={colors.border}
                borderBottomWidth={1}
                justifyContent="space-between"
                key={item.id}
                paddingVertical={spacing.sm}
              >
                <Text color={colors.text} flexShrink={1} fontSize={fontSizes.sm}>
                  {item.name}
                </Text>
                <Button
                  accessibilityLabel={`Delete ${item.name}`}
                  accessibilityRole="button"
                  backgroundColor="transparent"
                  borderWidth={0}
                  minHeight={0}
                  onPress={() => remove("pantry_item", item.id)}
                  paddingHorizontal={spacing.sm}
                  paddingVertical={spacing.xs}
                  pressStyle={{ opacity: 0.7 }}
                >
                  <Text color={colors.danger} fontSize={fontSizes.xs} fontWeight="600">
                    Delete
                  </Text>
                </Button>
              </XStack>
            ))
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
