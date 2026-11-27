import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";

import { useAuth } from "../components/auth/AuthProvider";
import { AppButton, AppTextInput, ScreenTitle } from "../components/ui";
import { colors, radii, spacing } from "../lib/theme";

export default function AuthScreen() {
  const router = useRouter();
  const { configured, signIn, signUp, signInWithOAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setMessage("");
    if (!email.trim() || password.length < 8) {
      setMessage("Enter an email and a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
        router.replace("/");
      } else if (await signUp(email.trim(), password)) {
        setMessage("Check your email to confirm your account.");
      } else {
        router.replace("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: "google" | "apple") => {
    setMessage("");
    setBusy(true);
    try {
      if (await signInWithOAuth(provider)) router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <YStack paddingHorizontal={spacing.screen} paddingTop={56} alignItems="flex-start">
        <Button
          accessibilityLabel="Back to Pantry Helper"
          accessibilityRole="button"
          backgroundColor="transparent"
          borderWidth={0}
          minHeight={0}
          onPress={() => router.replace("/")}
          padding={8}
          pressStyle={{ opacity: 0.7 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Button>
      </YStack>
      <YStack flex={1} justifyContent="center" padding={spacing.xl} gap={14}>
        <ScreenTitle fontSize={30}>{mode === "signIn" ? "Sign in" : "Create account"}</ScreenTitle>
        <Text color={colors.textSecondary} fontSize={15} lineHeight={22} marginBottom={8}>
          One DevDAJ account works across all our apps. Sign in to keep your households, recipes and
          grocery lists in sync between members.
        </Text>
        <XStack gap={12}>
          {(
            [
              ["apple", "logo-apple", "Apple"],
              ["google", "logo-google", "Google"],
            ] as const
          ).map(([provider, icon, label]) => (
            <Button
              accessibilityLabel={`Continue with ${label}`}
              accessibilityRole="button"
              backgroundColor={colors.surface}
              borderColor={colors.border}
              borderRadius={radii.md}
              borderWidth={1}
              disabled={busy || !configured}
              flex={1}
              flexDirection="row"
              alignItems="center"
              justifyContent="center"
              gap={8}
              key={provider}
              minHeight={50}
              onPress={() => void social(provider)}
              opacity={busy || !configured ? 0.5 : 1}
            >
              <Ionicons name={icon} size={18} color={colors.text} />
              <Text color={colors.text} fontSize={15} fontWeight="600">
                {label}
              </Text>
            </Button>
          ))}
        </XStack>
        <XStack alignItems="center" gap={10}>
          <YStack flex={1} height={1} backgroundColor={colors.border} />
          <Text color={colors.textSecondary} fontSize={13}>
            or use email
          </Text>
          <YStack flex={1} height={1} backgroundColor={colors.border} />
        </XStack>
        <AppTextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          editable={!busy}
          keyboardType="email-address"
          minHeight={52}
          onChangeText={setEmail}
          placeholder="Email"
          value={email}
        />
        <AppTextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          editable={!busy}
          minHeight={52}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          value={password}
        />
        {!configured ? (
          <Text color={colors.danger} fontSize={13} lineHeight={18}>
            Supabase is not configured in this environment.
          </Text>
        ) : null}
        {message ? (
          <Text color={colors.danger} fontSize={13} lineHeight={18}>
            {message}
          </Text>
        ) : null}
        <AppButton
          accessibilityLabel={mode === "signIn" ? "Sign in" : "Create account"}
          disabled={busy || !configured}
          onPress={() => void submit()}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text color={colors.onBrand} fontSize={16} fontWeight="700">
              {mode === "signIn" ? "Sign in" : "Create account"}
            </Text>
          )}
        </AppButton>
        <Button
          accessibilityLabel={mode === "signIn" ? "Need an account? Sign up" : "Sign in instead"}
          accessibilityRole="button"
          backgroundColor="transparent"
          borderWidth={0}
          disabled={busy}
          minHeight={0}
          onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
          padding={8}
          pressStyle={{ opacity: 0.7 }}
        >
          <Text color={colors.brand} fontSize={14} textAlign="center">
            {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Text>
        </Button>
      </YStack>
    </KeyboardAvoidingView>
  );
}
