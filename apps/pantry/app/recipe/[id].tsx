import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack } from "tamagui";

import { AppButton, AppTextInput, Card, ScreenTitle, SectionLabel } from "../../components/ui";
import { useHouseholdStore, useRows } from "../../lib/householdStore";
import { colors, fontSizes, spacing } from "../../lib/theme";
import type { Ingredient } from "../../lib/types";

interface DraftIngredient {
  key: string;
  name: string;
  quantity: string;
  unit: string;
}

function draftFrom(ingredients: Ingredient[]): DraftIngredient[] {
  return ingredients.map((ingredient) => ({
    key: Crypto.randomUUID(),
    name: ingredient.name,
    quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
    unit: ingredient.unit ?? "",
  }));
}

function RecipeEditor({
  id,
  title: initialTitle,
  ingredients: initialIngredients,
  steps: initialSteps,
  sourceUrl,
  extractionId,
}: {
  id: string;
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  sourceUrl: string | null;
  extractionId: string | null;
}) {
  const router = useRouter();
  const upsert = useHouseholdStore((store) => store.upsert);
  const remove = useHouseholdStore((store) => store.remove);
  const [title, setTitle] = useState(initialTitle);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(() =>
    draftFrom(initialIngredients),
  );
  const [steps, setSteps] = useState(initialSteps.join("\n"));
  const [message, setMessage] = useState("");

  const isNew = id === "new";

  const changeIngredient = (key: string, patch: Partial<DraftIngredient>) => {
    setIngredients((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };

  const save = () => {
    setMessage("");
    if (!title.trim()) {
      setMessage("Enter a recipe title.");
      return;
    }
    const parsed: Ingredient[] = [];
    for (const item of ingredients) {
      if (!item.name.trim()) continue;
      const quantity = item.quantity.trim() === "" ? null : Number(item.quantity);
      if (quantity !== null && !Number.isFinite(quantity)) {
        setMessage("Enter a valid quantity.");
        return;
      }
      parsed.push({
        name: item.name.trim(),
        quantity,
        unit: item.unit.trim() || null,
      });
    }
    const rowId = isNew ? Crypto.randomUUID() : id;
    upsert("recipe", rowId, {
      title: title.trim(),
      ingredients: parsed,
      steps: steps
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean),
      sourceUrl,
      extractionId,
    });
    if (isNew) router.replace(`/recipe/${rowId}`);
    else router.back();
  };

  const deleteRecipe = () => {
    Alert.alert("Delete recipe?", "This removes the recipe from every member's household.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove("recipe", id);
          router.back();
        },
      },
    ]);
  };

  return (
    <EditorView
      title={title}
      setTitle={setTitle}
      ingredients={ingredients}
      changeIngredient={changeIngredient}
      addIngredient={() =>
        setIngredients((current) => [
          ...current,
          { key: Crypto.randomUUID(), name: "", quantity: "", unit: "" },
        ])
      }
      removeIngredient={(key) =>
        setIngredients((current) => current.filter((item) => item.key !== key))
      }
      steps={steps}
      setSteps={setSteps}
      message={message}
      onSave={save}
      onDelete={isNew ? undefined : deleteRecipe}
    />
  );
}

function EditorView({
  title,
  setTitle,
  ingredients,
  changeIngredient,
  addIngredient,
  removeIngredient,
  steps,
  setSteps,
  message,
  onSave,
  onDelete,
}: {
  title: string;
  setTitle: (value: string) => void;
  ingredients: DraftIngredient[];
  changeIngredient: (key: string, patch: Partial<DraftIngredient>) => void;
  addIngredient: () => void;
  removeIngredient: (key: string) => void;
  steps: string;
  setSteps: (value: string) => void;
  message: string;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
        accessibilityLabel="Back to recipes"
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
      <ScreenTitle fontSize={fontSizes.lg}>{title.trim() || "New recipe"}</ScreenTitle>

      <Card>
        <SectionLabel>Title</SectionLabel>
        <AppTextInput
          accessibilityLabel="Recipe title"
          marginTop={spacing.sm}
          onChangeText={setTitle}
          placeholder="Recipe title"
          value={title}
        />
      </Card>

      <Card>
        <SectionLabel>Ingredients</SectionLabel>
        {ingredients.map((item, index) => (
          <XStack alignItems="center" gap={spacing.sm} key={item.key} marginTop={spacing.sm}>
            <AppTextInput
              accessibilityLabel={`Ingredient ${index + 1} name`}
              flex={2}
              minWidth={0}
              onChangeText={(value) => changeIngredient(item.key, { name: value })}
              placeholder="Name"
              value={item.name}
            />
            <AppTextInput
              accessibilityLabel={`Ingredient ${index + 1} quantity`}
              flex={1}
              keyboardType="decimal-pad"
              minWidth={0}
              onChangeText={(value) => changeIngredient(item.key, { quantity: value })}
              placeholder="Qty"
              value={item.quantity}
            />
            <AppTextInput
              accessibilityLabel={`Ingredient ${index + 1} unit`}
              flex={1}
              minWidth={0}
              onChangeText={(value) => changeIngredient(item.key, { unit: value })}
              placeholder="Unit"
              value={item.unit}
            />
            <Button
              accessibilityLabel={`Remove ingredient ${index + 1}`}
              accessibilityRole="button"
              alignItems="center"
              backgroundColor="transparent"
              borderWidth={0}
              height={48}
              justifyContent="center"
              minHeight={0}
              onPress={() => removeIngredient(item.key)}
              padding={0}
              pressStyle={{ opacity: 0.7 }}
              width={32}
            >
              <Text color={colors.danger} fontSize={fontSizes.sm} fontWeight="700">
                X
              </Text>
            </Button>
          </XStack>
        ))}
        <Button
          accessibilityLabel="Add ingredient"
          accessibilityRole="button"
          backgroundColor="transparent"
          borderWidth={0}
          minHeight={0}
          onPress={addIngredient}
          paddingVertical={spacing.md}
          pressStyle={{ opacity: 0.7 }}
        >
          <Text color={colors.brand} fontSize={fontSizes.sm} fontWeight="600">
            + Add ingredient
          </Text>
        </Button>
      </Card>

      <Card>
        <SectionLabel>Steps, one per line</SectionLabel>
        <AppTextInput
          accessibilityLabel="Recipe steps, one per line"
          minHeight={160}
          multiline
          onChangeText={setSteps}
          placeholder={"Mix everything.\nCook until done."}
          textAlignVertical="top"
          value={steps}
        />
      </Card>

      {message ? (
        <Text color={colors.danger} fontSize={fontSizes.sm}>
          {message}
        </Text>
      ) : null}
      <AppButton accessibilityLabel="Save recipe" onPress={onSave}>
        Save recipe
      </AppButton>
      {onDelete ? (
        <AppButton accessibilityLabel="Delete recipe" onPress={onDelete} variant="danger">
          Delete recipe
        </AppButton>
      ) : null}
    </ScrollView>
  );
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rowId = id ?? "new";
  const recipes = useRows("recipe");
  const recipe = recipes.find((item) => item.id === rowId);

  return (
    <RecipeEditor
      key={rowId}
      id={rowId}
      title={recipe?.title ?? ""}
      ingredients={recipe?.ingredients ?? []}
      steps={recipe?.steps ?? []}
      sourceUrl={recipe?.sourceUrl ?? null}
      extractionId={recipe?.extractionId ?? null}
    />
  );
}
