import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";

import { clearLegacyAIKeys, getAIModels, saveAIConfiguration, type AISettings } from "../../lib/ai";
import { storage } from "../../lib/storage";
import { useAppStore } from "../../lib/store";
import { colors } from "../../lib/theme";
import { useAuth } from "../auth/AuthProvider";
import { AppButton, Card, SectionLabel } from "../shared/ui";
import { Autocomplete } from "./Autocomplete";

export function AISettingsCard() {
  const router = useRouter();
  const { configured, user, isGuest, signOut } = useAuth();
  const isPro = useAppStore((state) => state.isPro);
  const [settings, setSettings] = useState<AISettings>({ model: "" });
  const [models, setModels] = useState<Array<{ label: string; value: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void storage.getAISettings().then(setSettings);
    void clearLegacyAIKeys().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isPro) return;
    let active = true;
    setBusy(true);
    setLoadError("");
    getAIModels()
      .then((available) => {
        if (active) setModels(available.map((model) => ({ label: model.name, value: model.id })));
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load models.");
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [isPro, attempt]);

  const save = async () => {
    try {
      await saveAIConfiguration(settings);
      Alert.alert("Saved", "This model is used for AI suggestions.");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Card style={{}}>
        <SectionLabel>Account</SectionLabel>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            marginBottom: 12,
            marginTop: 4,
          }}
        >
          {isGuest
            ? "Guest session. Create an account to keep it and use Pro."
            : (user?.email ?? "An account is only required for Fitnexx Pro.")}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!configured}
          onPress={() => (user && !isGuest ? void signOut() : router.push("/auth"))}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 10,
            borderWidth: 1,
            opacity: configured ? 1 : 0.45,
            padding: 13,
          }}
        >
          <Text style={{ color: colors.brand, fontSize: 14, fontWeight: "700" }}>
            {isGuest
              ? "Create account"
              : user
                ? "Sign out"
                : configured
                  ? "Sign in or create account"
                  : "Auth not configured"}
          </Text>
        </TouchableOpacity>
      </Card>

      <Card style={{ gap: 12 }}>
        <View>
          <SectionLabel>AI Model</SectionLabel>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {isPro
              ? "Fitnexx Pro runs AI on managed models. Pick the one used for exercise suggestions."
              : "AI suggestions are a Fitnexx Pro feature."}
          </Text>
        </View>

        {isPro ? (
          busy ? (
            <ActivityIndicator color={colors.brand} />
          ) : loadError ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 13 }}>{loadError}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setAttempt((value) => value + 1)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  borderRadius: 10,
                  borderWidth: 1,
                  padding: 13,
                }}
              >
                <Text style={{ color: colors.brand, fontSize: 14, fontWeight: "700" }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Autocomplete
                label="Model"
                onChange={(model) => setSettings({ model })}
                options={models}
                placeholder="Search models"
                value={settings.model}
              />
              <AppButton disabled={!settings.model} onPress={save}>
                Save
              </AppButton>
            </>
          )
        ) : null}
      </Card>
    </View>
  );
}
