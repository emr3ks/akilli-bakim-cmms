import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius, spacing, typography } from '../theme';
import { Button } from '../ui';

export interface SelectedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

interface PhotoPickerProps {
  value: SelectedPhoto | null;
  onChange: (photo: SelectedPhoto | null) => void;
  label?: string;
  disabled?: boolean;
}

function toSelection(asset: ImagePicker.ImagePickerAsset): SelectedPhoto | null {
  if (!asset.base64) return null;
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
      ? asset.mimeType
      : 'image/jpeg',
  };
}

export function PhotoPicker({ value, onChange, label = 'Fotoğraf / görsel', disabled = false }: PhotoPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const choose = async (source: 'camera' | 'library') => {
    setError(null);
    setLoading(true);
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Fotoğraf için kamera izni verilmedi.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) {
        setError('Görsel verisi okunamadı. Lütfen başka bir fotoğraf seçin.');
        return;
      }

      const selection = toSelection(asset);
      if (!selection) {
        setError('Görsel verisi okunamadı. Lütfen başka bir fotoğraf seçin.');
        return;
      }
      if (selection.base64.length > 3_000_000) {
        setError('Fotoğraf çok büyük. Lütfen daha düşük çözünürlüklü bir görsel seçin.');
        return;
      }
      onChange(selection);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Fotoğraf eklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: value.uri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.previewMeta}>
            <Text style={styles.previewText}>Görsel hazır · API ile birlikte kaydedilecek</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Seçili fotoğrafı kaldır"
              disabled={disabled}
              onPress={() => onChange(null)}
              style={styles.removeButton}
            >
              <Text style={styles.removeText}>Kaldır</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            title="Kamera"
            onPress={() => void choose('camera')}
            loading={loading}
            disabled={disabled}
            compact
            style={styles.action}
          />
          <Button
            title="Galeri / dosya"
            onPress={() => void choose('library')}
            loading={loading}
            disabled={disabled}
            variant="secondary"
            compact
            style={styles.action}
          />
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, minWidth: 130 },
  previewWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  preview: { width: '100%', height: 190, backgroundColor: colors.neutralSoft },
  previewMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md },
  previewText: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  removeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeText: { ...typography.caption, color: colors.danger, fontWeight: '800' },
  error: { ...typography.caption, color: colors.danger },
});
