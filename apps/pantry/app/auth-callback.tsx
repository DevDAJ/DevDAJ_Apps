import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Text, YStack } from "tamagui";

import { redirectTo } from "../components/auth/AuthProvider";
import { AppButton, ScreenTitle } from "../components/ui";
import { auth } from "../lib/supabase";
import { colors, spacing } from "../lib/theme";

/**
 * Landing screen for email confirmation links (`pantry://auth-callback?code=...`).
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const [stage, setStage] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // A PKCE code works once; never exchange it twice even if params re-render.
    if (started.current) return;
    started.current = true;
    void (async () => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => typeof value === "string"),
      );
      try {
        await auth.completeOAuth(`${redirectTo}?${query.toString()}`);
      } catch (error) {
        // OAuth completed inside the auth browser can also deep-link here; that code is already used.
        if (!(await auth.getSession())) {
          setMessage(error instanceof Error ? error.message : "Sign-in failed.");
          setStage("error");
          return;
        }
      }
      if (await auth.getSession()) router.replace("/");
      else {
        setMessage("Sign-in failed.");
        setStage("error");
      }
    })();
  }, [params, router]);

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      alignItems="center"
      justifyContent="center"
      padding={spacing.xl}
      gap={spacing.md}
    >
      {stage === "working" ? <ActivityIndicator color={colors.brand} /> : null}
      {stage === "error" ? (
        <YStack gap={spacing.md} width="100%" maxWidth={360}>
          <ScreenTitle>Link didn't work</ScreenTitle>
          <Text color={colors.danger} fontSize={14} lineHeight={18}>
            {message}
          </Text>
          <AppButton onPress={() => router.replace("/auth")}>Back to sign in</AppButton>
        </YStack>
      ) : null}
    </YStack>
  );
}
