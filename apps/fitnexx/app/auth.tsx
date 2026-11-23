import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../components/auth/AuthProvider";
import { pendingPassword } from "../lib/supabase";
import { AppButton, AppTextInput, ScreenTitle } from "../components/shared/ui";
import { colors, radii, spacing } from "../lib/theme";

export default function AuthScreen() {
  const router = useRouter();
  const {
    configured,
    signIn,
    signUp,
    signInWithOAuth,
    guestEnabled,
    isGuest,
    signInAsGuest,
    upgradeGuestWithEmail,
    linkGuestWithOAuth,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Guests land on "create account", which upgrades them in place and keeps their data.
  const [mode, setMode] = useState<"signIn" | "signUp">(isGuest ? "signUp" : "signIn");
  const upgrading = isGuest && mode === "signUp";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setMessage("");
    if (upgrading) {
      if (!email.trim()) {
        setMessage("Enter your email.");
        return;
      }
    } else if (!email.trim() || password.length < 8) {
      setMessage("Enter an email and a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (upgrading) {
        await upgradeGuestWithEmail(email.trim());
        await pendingPassword.mark();
        setMessage(
          "Check your email to confirm it. The link brings you back here to set a password.",
        );
      } else if (mode === "signIn") {
        await signIn(email.trim(), password);
        router.back();
      } else if (await signUp(email.trim(), password)) {
        setMessage("Check your email to confirm your account.");
      } else {
        router.back();
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
      const done = upgrading ? await linkGuestWithOAuth(provider) : await signInWithOAuth(provider);
      if (done) router.back();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setMessage("");
    setBusy(true);
    try {
      await signInAsGuest();
      router.back();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not continue as a guest.");
    } finally {
      setBusy(false);
    }
  };

  const title = upgrading ? "Save your account" : mode === "signIn" ? "Sign in" : "Create account";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.form}>
        <ScreenTitle style={styles.title}>{title}</ScreenTitle>
        <Text style={styles.copy}>
          {upgrading
            ? "You're using Fitnexx as a guest. Link Apple, Google or an email to keep everything and unlock Pro."
            : "One DevDAJ account works across all our apps. Your workout and nutrition history stays on this device."}
        </Text>
        <View style={styles.socialRow}>
          {(
            [
              ["apple", "logo-apple", "Apple"],
              ["google", "logo-google", "Google"],
            ] as const
          ).map(([provider, icon, label]) => (
            <TouchableOpacity
              accessibilityLabel={`Continue with ${label}`}
              accessibilityRole="button"
              disabled={busy || !configured}
              key={provider}
              onPress={() => void social(provider)}
              style={[styles.socialButton, (busy || !configured) && styles.disabled]}
            >
              <Ionicons name={icon} size={18} color={colors.text} />
              <Text style={styles.socialText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or use email</Text>
          <View style={styles.dividerLine} />
        </View>
        <AppTextInput
          autoCapitalize="none"
          autoComplete="email"
          editable={!busy}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />
        {upgrading ? null : (
          <AppTextInput
            autoCapitalize="none"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            editable={!busy}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
        )}
        {!configured ? (
          <Text style={styles.error}>Supabase is not configured in the mobile environment.</Text>
        ) : null}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <AppButton disabled={busy || !configured} onPress={submit} style={styles.primaryButton}>
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryText}>
              {upgrading
                ? "Send confirmation email"
                : mode === "signIn"
                  ? "Sign in"
                  : "Create account"}
            </Text>
          )}
        </AppButton>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          <Text style={styles.switchText}>
            {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Text>
        </TouchableOpacity>
        {guestEnabled && !isGuest ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || !configured}
            onPress={() => void guest()}
          >
            <Text style={styles.guestText}>Continue as guest</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.screen,
    paddingTop: 56,
    alignItems: "flex-end",
  },
  iconButton: { padding: 8 },
  form: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: 14 },
  title: { fontSize: 30 },
  copy: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
  },
  socialRow: { flexDirection: "row", gap: 12 },
  socialButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  socialText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.textSecondary, fontSize: 13 },
  primaryButton: {
    borderRadius: radii.md,
    minHeight: 50,
  },
  primaryText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  guestText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    padding: 8,
    textDecorationLine: "underline",
  },
  switchText: {
    color: colors.brand,
    fontSize: 14,
    textAlign: "center",
    padding: 8,
  },
});
