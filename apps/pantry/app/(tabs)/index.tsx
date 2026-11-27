import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack } from "tamagui";

import { AppButton, Card, ScreenTitle } from "../../components/ui";
import { useHouseholdStore, useRows } from "../../lib/householdStore";
import { colors, fontSizes, radii, spacing } from "../../lib/theme";

export default function RecipesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasHousehold = useHouseholdStore((store) => store.activeId !== null);
  const recipes = useRows("recipe");
  const sorted = useMemo(
    () => [...recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
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
      <ScreenTitle>Recipes</ScreenTitle>
      {!hasHousehold ? (
        <Card gap={spacing.md}>
          <Text color={colors.textSecondary} fontSize={fontSizes.sm} lineHeight={20}>
            Create or join a household to start collecting recipes.
          </Text>
          <AppButton onPress={() => router.push("/household")}>Set up a household</AppButton>
        </Card>
      ) : (
        <>
          <XStack gap={spacing.sm}>
            <Button
              accessibilityLabel="Import a recipe link"
              accessibilityRole="button"
              alignItems="center"
              backgroundColor={colors.surface}
              borderColor={colors.border}
              borderRadius={radii.md}
              borderWidth={1}
              flex={1}
              flexDirection="column"
              gap={spacing.sm}
              justifyContent="center"
              minHeight={72}
              onPress={() => router.push("/recipe/import")}
              padding={spacing.sm}
              pressStyle={{ opacity: 0.75 }}
            >
              <Ionicons name="link-outline" size={20} color={colors.brand} />
              <Text color={colors.text} fontSize={fontSizes.xs} fontWeight="600" textAlign="center">
                Import link
              </Text>
            </Button>
            <Button
              accessibilityLabel="Paste a recipe caption"
              accessibilityRole="button"
              alignItems="center"
              backgroundColor={colors.surface}
              borderColor={colors.border}
              borderRadius={radii.md}
              borderWidth={1}
              flex={1}
              flexDirection="column"
              gap={spacing.sm}
              justifyContent="center"
              minHeight={72}
              onPress={() => router.push("/recipe/paste")}
              padding={spacing.sm}
              pressStyle={{ opacity: 0.75 }}
            >
              <Ionicons name="clipboard-outline" size={20} color={colors.brand} />
              <Text color={colors.text} fontSize={fontSizes.xs} fontWeight="600" textAlign="center">
                Paste caption
              </Text>
            </Button>
            <Button
              accessibilityLabel="Write a recipe"
              accessibilityRole="button"
              alignItems="center"
              backgroundColor={colors.surface}
              borderColor={colors.border}
              borderRadius={radii.md}
              borderWidth={1}
              flex={1}
              flexDirection="column"
              gap={spacing.sm}
              justifyContent="center"
              minHeight={72}
              onPress={() => router.push("/recipe/new")}
              padding={spacing.sm}
              pressStyle={{ opacity: 0.75 }}
            >
              <Ionicons name="create-outline" size={20} color={colors.brand} />
              <Text color={colors.text} fontSize={fontSizes.xs} fontWeight="600" textAlign="center">
                Write recipe
              </Text>
            </Button>
          </XStack>

          {sorted.length === 0 ? (
            <Card>
              <Text color={colors.textSecondary} fontSize={fontSizes.sm} lineHeight={20}>
                No recipes yet. Import a link or write your first one.
              </Text>
            </Card>
          ) : (
            sorted.map((recipe) => (
              <Button
                accessibilityLabel={`Open ${recipe.title}`}
                accessibilityRole="button"
                backgroundColor="transparent"
                borderWidth={0}
                borderRadius={radii.lg}
                key={recipe.id}
                minHeight={0}
                onPress={() => router.push(`/recipe/${recipe.id}`)}
                padding={0}
                pressStyle={{ opacity: 0.8 }}
              >
                <Card flex={1}>
                  <Text color={colors.text} fontSize={fontSizes.md} fontWeight="700">
                    {recipe.title}
                  </Text>
                  <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.xs}>
                    {recipe.ingredients.length} ingredients, {recipe.steps.length} steps
                  </Text>
                </Card>
              </Button>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}
