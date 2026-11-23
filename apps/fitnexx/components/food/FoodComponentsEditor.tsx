import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { calculateItemMacros } from "../../lib/foodAnalysisCore";
import { colors } from "../../lib/theme";
import type { FoodAnalysisItem } from "../../lib/types";

type Props = {
  components: FoodAnalysisItem[];
  gramsById: Record<string, number>;
  onChangeGrams: (id: string, grams: number) => void;
  onRemove: (id: string) => void;
};

/** Weights are the only editable value: macros are recalculated locally from per-gram data. */
export function FoodComponentsEditor({ components, gramsById, onChangeGrams, onRemove }: Props) {
  return (
    <View style={{ gap: 10 }}>
      {components.map((component) => {
        const grams = gramsById[component.id] ?? component.grams;
        const macros = calculateItemMacros(component.perGram, grams);
        return (
          <View
            key={component.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
                  {component.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {[component.preparation, component.portionDescription]
                    .filter(Boolean)
                    .join(" · ") || "Estimated portion"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onRemove(component.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>
                  Remove
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>Weight</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={String(grams)}
                onChangeText={(value) => {
                  const parsed = Number.parseFloat(value);
                  if (Number.isFinite(parsed) && parsed > 0) onChangeGrams(component.id, parsed);
                }}
                style={{
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  fontSize: 15,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  textAlign: "center",
                  width: 80,
                }}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>g</Text>
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {macros.calories} kcal · P{macros.protein} C{macros.carbs} F{macros.fat} · fiber{" "}
              {macros.fiber}g
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>
              {component.source === "usda" ? "USDA" : "AI"} estimate · {component.per100.calories}{" "}
              kcal per 100g
              {!component.consistency.ok ? " · macros adjusted" : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
