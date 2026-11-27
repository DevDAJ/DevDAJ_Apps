import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack } from "tamagui";

import { AppButton, AppTextInput, Card, ScreenTitle } from "../../components/ui";
import { parseCaption } from "../../lib/api";
import { useHouseholdStore } from "../../lib/householdStore";
import { colors, fontSizes, spacing } from "../../lib/theme";

export default function PasteRecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const upsert = useHouseholdStore((store) => store.upsert);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!text.trim()) {
      setMessage("Paste a recipe caption.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const parsed = await parseCaption(text.trim(), title.trim() || undefined);
      const rowId = Crypto.randomUUID();
      upsert("recipe", rowId, {
        title: title.trim() || parsed.title || "Untitled recipe",
        ingredients: parsed.ingredients.map(({ name, quantity, unit }) => ({
          name,
          quantity,
          unit,
        })),
        steps: parsed.steps,
        sourceUrl: null,
        extractionId: null,
      });
      router.replace(`/recipe/${rowId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not parse that caption.");
    } finally {
      setBusy(false);
    }
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
      <ScreenTitle>Paste caption</ScreenTitle>
      <Card>
        <Text
          color={colors.textSecondary}
          fontSize={fontSizes.sm}
          lineHeight={20}
          marginBottom={spacing.md}
        >
          Paste a recipe caption or description. Parsing is free and does not use your weekly import
          allowance.
        </Text>
        <AppTextInput
          accessibilityLabel="Recipe caption"
          autoCapitalize="sentences"
          editable={!busy}
          minHeight={180}
          multiline
          onChangeText={setText}
          placeholder="Paste the caption here..."
          textAlignVertical="top"
          value={text}
        />
        <AppTextInput
          accessibilityLabel="Recipe title, optional"
          editable={!busy}
          marginTop={spacing.md}
          onChangeText={setTitle}
          placeholder="Title (optional)"
          value={title}
        />
        {message ? (
          <Text
            color={colors.danger}
            fontSize={fontSizes.sm}
            lineHeight={20}
            marginTop={spacing.md}
          >
            {message}
          </Text>
        ) : null}
        {busy ? (
          <XStack alignItems="center" gap={spacing.sm} minHeight={48} marginTop={spacing.md}>
            <ActivityIndicator color={colors.brand} />
            <Text color={colors.textSecondary} fontSize={fontSizes.sm}>
              Reading the caption...
            </Text>
          </XStack>
        ) : (
          <AppButton onPress={() => void submit()}>Parse recipe</AppButton>
        )}
      </Card>
    </ScrollView>
  );
}
