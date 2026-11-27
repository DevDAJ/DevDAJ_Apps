import type { ComponentProps, ReactNode } from "react";
import { Button, H2, Input, Text, XStack, YStack } from "tamagui";

import { colors, fontSizes, radii, spacing } from "../lib/theme";

type ScreenProps = ComponentProps<typeof YStack>;

export function Screen({ style, ...props }: ScreenProps) {
  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingHorizontal={spacing.screen}
      style={style}
      {...props}
    />
  );
}

type ScreenTitleProps = ComponentProps<typeof H2>;

export function ScreenTitle({ style, ...props }: ScreenTitleProps) {
  return (
    <H2
      accessibilityRole="header"
      color={colors.text}
      fontSize={fontSizes.xl}
      fontWeight="800"
      style={style}
      {...props}
    />
  );
}

type CardProps = ComponentProps<typeof YStack>;

export function Card({ style, ...props }: CardProps) {
  return (
    <YStack
      backgroundColor={colors.surface}
      borderColor={colors.border}
      borderRadius={radii.lg}
      borderWidth={1}
      padding={spacing.lg}
      style={style}
      {...props}
    />
  );
}

type SectionLabelProps = ComponentProps<typeof Text>;

export function SectionLabel({ style, ...props }: SectionLabelProps) {
  return (
    <Text
      color={colors.textMuted}
      fontSize={fontSizes.xs}
      fontWeight="700"
      letterSpacing={0.8}
      textTransform="uppercase"
      style={style}
      {...props}
    />
  );
}

type ButtonProps = Omit<ComponentProps<typeof Button>, "variant">;
type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<
  AppButtonVariant,
  { background: string; border: string; color: string; pressed: string }
> = {
  primary: {
    background: colors.brand,
    border: colors.brand,
    color: colors.onBrand,
    pressed: colors.brandPressed,
  },
  secondary: {
    background: colors.surfaceRaised,
    border: colors.borderStrong,
    color: colors.text,
    pressed: colors.surfacePressed,
  },
  ghost: {
    background: colors.transparent,
    border: colors.transparent,
    color: colors.text,
    pressed: colors.surfaceRaised,
  },
  danger: {
    background: colors.dangerSolid,
    border: colors.dangerSolid,
    color: colors.text,
    pressed: colors.dangerSolid,
  },
};

export function AppButton({
  children,
  variant = "primary",
  disabled,
  style,
  accessibilityLabel,
  ...props
}: ButtonProps & { children: ReactNode; variant?: AppButtonVariant }) {
  const variantStyle = buttonVariants[variant];
  return (
    <Button
      accessibilityLabel={
        accessibilityLabel ?? (typeof children === "string" ? children : undefined)
      }
      accessibilityRole="button"
      backgroundColor={variantStyle.background}
      borderColor={variantStyle.border}
      borderRadius={radii.md}
      borderWidth={1}
      color={variantStyle.color}
      disabled={disabled}
      disabledStyle={{ opacity: 0.5 }}
      minHeight={48}
      opacity={disabled ? 0.5 : 1}
      paddingHorizontal={spacing.lg}
      pressStyle={{ backgroundColor: variantStyle.pressed }}
      style={style}
      {...props}
    >
      {typeof children === "string" ? (
        <Text color={variantStyle.color} fontSize={fontSizes.sm} fontWeight="700">
          {children}
        </Text>
      ) : (
        children
      )}
    </Button>
  );
}

type InputProps = ComponentProps<typeof Input>;

export function AppTextInput({ style, accessibilityLabel, placeholder, ...props }: InputProps) {
  return (
    <Input
      accessibilityLabel={accessibilityLabel ?? placeholder}
      backgroundColor={colors.surface}
      borderColor={colors.border}
      borderRadius={radii.md}
      borderWidth={1}
      color={colors.text}
      fontSize={fontSizes.md}
      minHeight={48}
      paddingHorizontal={spacing.md}
      paddingVertical={spacing.sm}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.brand}
      style={style}
      {...props}
    />
  );
}

export { Text, XStack, YStack };
