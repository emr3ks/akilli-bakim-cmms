import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, spacing, typography } from '../theme';

interface QRCodeViewProps {
  value: string;
  size: number;
}

interface QRCodeBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface QRCodeBoundaryState {
  failed: boolean;
}

class QRCodeBoundary extends React.Component<QRCodeBoundaryProps, QRCodeBoundaryState> {
  state: QRCodeBoundaryState = { failed: false };

  static getDerivedStateFromError(): QRCodeBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function QRCodeView({ value, size }: QRCodeViewProps) {
  const [matrixError, setMatrixError] = useState(false);
  const fallback = (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Text style={styles.fallbackTitle}>QR görüntülenemiyor</Text>
      <Text style={styles.fallbackValue}>{value}</Text>
    </View>
  );

  if (matrixError) return fallback;

  return (
    <QRCodeBoundary fallback={fallback}>
      <QRCode
        value={value}
        size={size}
        quietZone={4}
        color={colors.ink}
        backgroundColor={colors.white}
        onError={() => setMatrixError(true)}
      />
    </QRCodeBoundary>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md },
  fallbackTitle: { ...typography.label, color: colors.warning, textAlign: 'center' },
  fallbackValue: { ...typography.caption, color: colors.ink, textAlign: 'center' },
});
