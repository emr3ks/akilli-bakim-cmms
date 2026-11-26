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

const WEB_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function openWebFilePicker(
  source: 'camera' | 'library',
  onSelected: (photo: SelectedPhoto) => void,
  onError: (message: string) => void,
) {
  if (typeof document === 'undefined') {
    onError('Web dosya seçici başlatılamadı.');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = WEB_MIME_TYPES.join(',');
  input.dataset.testid = 'cmms-photo-file-input';
  input.style.display = 'none';
  if (source === 'camera') input.setAttribute('capture', 'environment');
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (!WEB_MIME_TYPES.includes(file.type)) {
      onError('Yalnızca JPEG, PNG veya WebP görseller seçilebilir.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError('Fotoğraf 2 MB sınırından büyük. Lütfen daha küçük bir görsel seçin.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => onError('Görsel verisi okunamadı.');
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (!base64) {
        onError('Görsel verisi okunamadı.');
        return;
      }
      onSelected({
        uri: URL.createObjectURL(file),
        base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }, { once: true });

  input.click();
}

export function PhotoPicker({ value, onChange, label = 'Fotoğraf / görsel', disabled = false }: PhotoPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const choose = async (source: 'camera' | 'library') => {
    setError(null);
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        openWebFilePicker(
          source,
          (selection) => {
            setError(null);
            onChange(selection);
          },
          setError,
        );
        return;
      }

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Fotoğraf için kamera izni verilmedi.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
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
      if (selection.base64.length > 2_800_000) {
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
