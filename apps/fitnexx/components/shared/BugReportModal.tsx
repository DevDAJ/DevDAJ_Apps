import * as Crypto from "expo-crypto";
import { useState } from "react";
import { Alert, Modal, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { requireSupabase } from "../../lib/supabase";
import {
  captureBugReportSubmitted,
  telemetryDistinctId,
  type BugReportContext,
} from "../../lib/telemetry";
import { colors, spacing } from "../../lib/theme";
import { AppButton, AppTextInput } from "./ui";

/**
 * Bug report sheet shared by Settings and the global error screen. `context`
 * carries diagnostics (error id, message, stack, scan ids) into the bug_report
 * row and, when the user opted in, into PostHog for correlation.
 */
export function BugReportModal({
  visible,
  onClose,
  context,
}: {
  visible: boolean;
  onClose: () => void;
  context?: BugReportContext;
}) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = description.trim();
    if (trimmed.length < 10 || trimmed.length > 8000) {
      Alert.alert("Describe the bug", "Please describe the bug (10 to 8,000 characters).");
      return;
    }
    setSending(true);
    try {
      const id = Crypto.randomUUID();
      const { error } = await requireSupabase()
        .from("bug_report")
        .insert({
          id,
          description: trimmed,
          platform: "mobile",
          browser: null,
          os: `${Platform.OS} ${String(Platform.Version)}`,
          url: null,
          context: context ?? null,
          telemetry_distinct_id: telemetryDistinctId(),
          error_event_id: context?.errorEventId ?? null,
        });
      if (error) throw error;
      captureBugReportSubmitted({ bugReportId: id, context });
      setDescription("");
      onClose();
      Alert.alert("Thanks", "Your report is in. We'll take a look.");
    } catch (err) {
      Alert.alert("Could not send", err instanceof Error ? err.message : "Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: insets.bottom + 20,
            gap: spacing.md,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Report a Bug</Text>
          <AppTextInput
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholder="What happened, and what did you expect instead?"
            value={description}
            onChangeText={setDescription}
            maxLength={8000}
            style={{ minHeight: 120 }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <AppButton variant="secondary" onPress={onClose} disabled={sending} style={{ flex: 1 }}>
              Cancel
            </AppButton>
            <AppButton onPress={submit} disabled={sending} style={{ flex: 2 }}>
              {sending ? "Sending…" : "Send report"}
            </AppButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}
