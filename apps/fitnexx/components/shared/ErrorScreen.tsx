import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { captureAppError } from "../../lib/telemetry";
import { colors, spacing } from "../../lib/theme";
import { BugReportModal } from "./BugReportModal";
import { AppButton } from "./ui";

/**
 * Global crash screen, rendered by the root ErrorBoundary. Uses plain React
 * Native primitives so it still renders when providers failed to mount.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry?: () => void }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [errorEventId, setErrorEventId] = useState<string | null>(null);

  useEffect(() => {
    setErrorEventId(
      captureAppError(error, { source: "error-screen", component: "RootErrorBoundary" }),
    );
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        padding: spacing.screen,
        gap: spacing.md,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
        Something went wrong
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
        The app hit an unexpected error. Retrying usually fixes it. If it keeps happening, send us a
        report and we&apos;ll investigate.
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }} selectable>
        {error.message}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {retry ? (
          <AppButton onPress={retry} style={{ flex: 1 }}>
            Try again
          </AppButton>
        ) : null}
        <AppButton variant="secondary" onPress={() => setReportOpen(true)} style={{ flex: 1 }}>
          Report a bug
        </AppButton>
      </View>
      <BugReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        context={{
          source: "error-screen",
          errorEventId,
          errorMessage: error.message,
          errorStack: error.stack,
        }}
      />
    </View>
  );
}
