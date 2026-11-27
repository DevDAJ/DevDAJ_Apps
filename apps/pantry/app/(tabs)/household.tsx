import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, XStack, YStack } from "tamagui";

import { useAuth } from "../../components/auth/AuthProvider";
import { AppButton, AppTextInput, Card, ScreenTitle, SectionLabel } from "../../components/ui";
import {
  createHousehold,
  createInvite,
  joinHousehold,
  leaveHousehold,
  listMembers,
  type Invite,
  type Member,
} from "../../lib/api";
import { useHouseholdStore } from "../../lib/householdStore";
import { colors, fontSizes, radii, spacing } from "../../lib/theme";

export default function HouseholdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const households = useHouseholdStore((store) => store.households);
  const activeId = useHouseholdStore((store) => store.activeId);
  const syncing = useHouseholdStore((store) => store.syncing);
  const lastError = useHouseholdStore((store) => store.lastError);
  const loadHouseholds = useHouseholdStore((store) => store.loadHouseholds);
  const setActive = useHouseholdStore((store) => store.setActive);
  const [form, setForm] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(() => {
    if (!activeId) {
      setMembers([]);
      return;
    }
    void listMembers(activeId)
      .then(setMembers)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Could not load members.");
      });
  }, [activeId]);

  useEffect(() => {
    loadMembers();
    setInvite(null);
  }, [loadMembers]);

  const create = async () => {
    if (!name.trim()) {
      setMessage("Enter a household name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const household = await createHousehold(name.trim());
      setName("");
      setForm("none");
      await loadHouseholds();
      await setActive(household.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the household.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim()) {
      setMessage("Enter an invite code.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const household = await joinHousehold(code.trim());
      setCode("");
      setForm("none");
      await loadHouseholds();
      await setActive(household.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not join the household.");
    } finally {
      setBusy(false);
    }
  };

  const makeInvite = async () => {
    if (!activeId) return;
    setBusy(true);
    setMessage("");
    try {
      setInvite(await createInvite(activeId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create an invite code.");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (!activeId) return;
    const leavingId = activeId;
    Alert.alert("Leave household?", "Your local copy of this household stays on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          void leaveHousehold(leavingId)
            .then(() => loadHouseholds())
            .catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : "Could not leave the household.");
            });
        },
      },
    ]);
  };

  const signOutUser = async () => {
    try {
      await signOut();
      router.replace("/auth");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    }
  };

  const status = syncing ? "Syncing..." : lastError ? `Sync error: ${lastError}` : "Synced";

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
      <ScreenTitle>Household</ScreenTitle>
      <Text
        accessibilityLabel={`Sync status: ${status}`}
        color={colors.textMuted}
        fontSize={fontSizes.sm}
      >
        {status}
      </Text>
      {message ? (
        <Text color={colors.danger} fontSize={fontSizes.sm} lineHeight={20}>
          {message}
        </Text>
      ) : null}

      {households.length === 0 ? (
        <>
          <Card>
            <SectionLabel>Create a household</SectionLabel>
            <AppTextInput
              accessibilityLabel="Household name"
              marginBottom={spacing.md}
              marginTop={spacing.sm}
              onChangeText={setName}
              placeholder="Family name"
              value={name}
            />
            {form === "create" ? (
              <AppButton disabled={busy} onPress={() => void create()}>
                Create household
              </AppButton>
            ) : (
              <AppButton onPress={() => setForm("create")}>Start one</AppButton>
            )}
          </Card>
          <Card>
            <SectionLabel>Join a household</SectionLabel>
            <AppTextInput
              accessibilityLabel="Invite code"
              autoCapitalize="characters"
              marginBottom={spacing.md}
              marginTop={spacing.sm}
              onChangeText={setCode}
              placeholder="Invite code"
              value={code}
            />
            {form === "join" ? (
              <AppButton disabled={busy} onPress={() => void join()}>
                Join household
              </AppButton>
            ) : (
              <AppButton onPress={() => setForm("join")}>Use an invite code</AppButton>
            )}
          </Card>
          <AppButton
            accessibilityLabel="Sign out"
            onPress={() => void signOutUser()}
            variant="ghost"
          >
            Sign out
          </AppButton>
        </>
      ) : (
        <>
          <Card>
            <SectionLabel>Your households</SectionLabel>
            <XStack flexWrap="wrap" gap={spacing.sm} marginTop={spacing.md}>
              {households.map((household) => {
                const active = household.id === activeId;
                return (
                  <Button
                    accessibilityLabel={`Switch to ${household.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    backgroundColor={active ? colors.brandMuted : colors.surfaceRaised}
                    borderColor={active ? colors.brand : colors.border}
                    borderRadius={radii.full}
                    borderWidth={1}
                    key={household.id}
                    minHeight={0}
                    onPress={() => void setActive(household.id)}
                    paddingHorizontal={spacing.md}
                    paddingVertical={spacing.sm}
                    pressStyle={{ opacity: 0.8 }}
                  >
                    <Text
                      color={active ? colors.text : colors.textSecondary}
                      fontSize={fontSizes.sm}
                    >
                      {household.name}
                    </Text>
                  </Button>
                );
              })}
            </XStack>
          </Card>

          <Card>
            <SectionLabel>Members</SectionLabel>
            {members.length === 0 ? (
              <Text color={colors.textMuted} fontSize={fontSizes.sm}>
                No members found.
              </Text>
            ) : (
              members.map((member) => (
                <YStack
                  borderBottomColor={colors.border}
                  borderBottomWidth={1}
                  key={member.userId}
                  paddingVertical={spacing.sm}
                >
                  <Text color={colors.text} fontSize={fontSizes.sm}>
                    {member.email ?? "Member"}
                  </Text>
                </YStack>
              ))
            )}
            <AppButton
              accessibilityLabel="Create invite code"
              disabled={busy}
              marginTop={spacing.md}
              onPress={() => void makeInvite()}
            >
              Invite
            </AppButton>
            {invite ? (
              <YStack alignItems="center" marginTop={spacing.md}>
                <Text
                  accessibilityLabel={`Invite code ${invite.code}`}
                  color={colors.brand}
                  fontSize={fontSizes.lg}
                  fontWeight="800"
                  letterSpacing={2}
                  selectable
                >
                  {invite.code}
                </Text>
                <Text color={colors.textMuted} fontSize={fontSizes.xs} marginTop={spacing.xs}>
                  Expires {new Date(invite.expiresAt).toLocaleString()}
                </Text>
              </YStack>
            ) : null}
          </Card>

          {form === "join" ? (
            <Card>
              <SectionLabel>Join another household</SectionLabel>
              <AppTextInput
                accessibilityLabel="Invite code"
                autoCapitalize="characters"
                marginBottom={spacing.md}
                marginTop={spacing.sm}
                onChangeText={setCode}
                placeholder="Invite code"
                value={code}
              />
              <AppButton disabled={busy} onPress={() => void join()}>
                Join household
              </AppButton>
            </Card>
          ) : (
            <AppButton onPress={() => setForm("join")}>Join another household</AppButton>
          )}

          {form === "create" ? (
            <Card>
              <SectionLabel>Create another household</SectionLabel>
              <AppTextInput
                accessibilityLabel="Household name"
                marginBottom={spacing.md}
                marginTop={spacing.sm}
                onChangeText={setName}
                placeholder="Household name"
                value={name}
              />
              <AppButton disabled={busy} onPress={() => void create()}>
                Create household
              </AppButton>
            </Card>
          ) : (
            <AppButton onPress={() => setForm("create")}>Create another household</AppButton>
          )}

          <AppButton accessibilityLabel="Leave household" onPress={leave} variant="danger">
            Leave household
          </AppButton>
          <AppButton
            accessibilityLabel="Sign out"
            onPress={() => void signOutUser()}
            variant="ghost"
          >
            Sign out
          </AppButton>
        </>
      )}
    </ScrollView>
  );
}
