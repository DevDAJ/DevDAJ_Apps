import { useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack } from "tamagui";

import { AppButton, AppTextInput, Card, ScreenTitle } from "../../components/ui";
import { ApiRequestError, getImportUsage, importRecipe, type ImportUsage } from "../../lib/api";
import { useHouseholdStore } from "../../lib/householdStore";
import { colors, fontSizes, spacing } from "../../lib/theme";

export default function ImportRecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeId = useHouseholdStore((store) => store.activeId);
  const upsert = useHouseholdStore((store) => store.upsert);
  const [url, setUrl] = useState("");
  const [usage, setUsage] = useState<ImportUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    void getImportUsage(activeId)
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeId]);

  const submit = async () => {
    if (!activeId || !url.trim()) {
      setMessage("Paste a YouTube or TikTok link.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await importRecipe(activeId, url.trim());
      const rowId = Crypto.randomUUID();
      upsert("recipe", rowId, {
        title: result.title ?? result.recipe.title ?? "Imported recipe",
        ingredients: result.recipe.ingredients.map(({ name, quantity, unit }) => ({
          name,
          quantity,
          unit,
        })),
        steps: result.recipe.steps,
        sourceUrl: result.url,
        extractionId: result.extractionId,
      });
      setUsage(result.usage);
      router.replace(`/recipe/${rowId}`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 429) {
        const resetDate = new Date(
          error.resetsAt ?? usage?.resetsAt ?? Date.now(),
        ).toLocaleDateString();
        setMessage(`${error.message} Resets ${resetDate}.`);
      } else {
        setMessage(error instanceof Error ? error.message : "Could not import that link.");
      }
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
      <ScreenTitle>Import link</ScreenTitle>
      <Card>
        <Text color={colors.textSecondary} fontSize={fontSizes.sm} marginBottom={spacing.sm}>
          Recipe from YouTube or TikTok
        </Text>
        <AppTextInput
          accessibilityLabel="Video link"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setUrl}
          placeholder="https://..."
          value={url}
        />
        {usage ? (
          <Text color={colors.textMuted} fontSize={fontSizes.sm} marginTop={spacing.md}>
            {usage.remaining} of {usage.limit} imports left this week
          </Text>
        ) : null}
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
              Reading the recipe...
            </Text>
          </XStack>
        ) : (
          <AppButton disabled={busy} onPress={() => void submit()}>
            Import recipe
          </AppButton>
        )}
      </Card>
    </ScrollView>
  );
}
