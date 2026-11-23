import { useState } from "react";
import { Text } from "react-native";
import { colors } from "../../lib/theme";
import { BugReportModal } from "../shared/BugReportModal";
import { AppButton, Card, SectionLabel } from "../shared/ui";

export function BugReportCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <SectionLabel style={{ marginBottom: 4 }}>Support</SectionLabel>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          Found something broken? Tell us and we&apos;ll take a look.
        </Text>
        <AppButton variant="secondary" onPress={() => setOpen(true)}>
          Report a Bug
        </AppButton>
      </Card>

      <BugReportModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
