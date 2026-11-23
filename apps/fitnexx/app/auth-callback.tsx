import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { redirectTo, useAuth } from "../components/auth/AuthProvider";
import { AppButton, AppTextInput, ScreenTitle } from "../components/shared/ui";
import { auth, pendingPassword } from "../lib/supabase";
import { colors, radii, spacing } from "../lib/theme";

/**
 * Landing screen for links from auth emails (`fitnexx://auth-callback?code=...`):
 * sign-up confirmation and guest → account upgrades. Upgrades then set a password here.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const { updatePassword } = useAuth();
  const [stage, setStage] = useState<"working" | "password" | "error">("working");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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
        // OAuth finished inside the auth browser can also deep-link here; that code is already used.
        if (!(await auth.getSession())) {
          setMessage(error instanceof Error ? error.message : "Sign-in failed.");
          setStage("error");
          return;
        }
      }
      if (await pendingPassword.isSet()) setStage("password");
      else router.replace("/");
    })();
  }, [params, router]);

  const savePassword = async () => {
    if (password.length < 8) {
      setMessage("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await updatePassword(password);
      await pendingPassword.clear();
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {stage === "working" ? <ActivityIndicator color={colors.brand} /> : null}
      {stage === "password" ? (
        <View style={styles.form}>
          <ScreenTitle style={styles.title}>Set a password</ScreenTitle>
          <Text style={styles.copy}>
            Your email is confirmed and your guest data is now part of your account. Choose a
            password for signing in on other devices and DevDAJ apps.
          </Text>
          <AppTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!busy}
            onChangeText={setPassword}
            placeholder="New password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <AppButton disabled={busy} onPress={savePassword} style={styles.button}>
            {busy ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.buttonText}>Save password</Text>
            )}
          </AppButton>
        </View>
      ) : null}
      {stage === "error" ? (
        <View style={styles.form}>
          <ScreenTitle style={styles.title}>Link didn't work</ScreenTitle>
          <Text style={styles.error}>{message}</Text>
          <AppButton onPress={() => router.replace("/auth")} style={styles.button}>
            <Text style={styles.buttonText}>Back to sign in</Text>
          </AppButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center" },
  form: { padding: spacing.xl, gap: 14 },
  title: { fontSize: 30 },
  copy: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  input: { minHeight: 52 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  button: { borderRadius: radii.md, minHeight: 50 },
  buttonText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
});
