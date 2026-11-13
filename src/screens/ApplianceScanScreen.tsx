import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { IconArrowLeft, IconCamera, IconPhoto } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { pickImage, scanAppliancePhoto, type ApplianceScanResult } from '../lib/scan';
import { useApplianceStore, type RegisteredAppliance } from '../stores/useApplianceStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { AiNote } from '../components/AiNote';
import { Chip } from '../components/Chip';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';

type Step = 'capture' | 'scanning' | 'confirm' | 'failed';

interface ApplianceScanScreenProps {
  uid: string;
  onBack: () => void;
  /** When set, the screen edits this appliance in place instead of registering a new one. */
  editAppliance?: RegisteredAppliance | null;
}

export function ApplianceScanScreen({ uid, onBack, editAppliance }: ApplianceScanScreenProps) {
  const { t } = useTranslation();
  const updateAppliance = useApplianceStore((s) => s.updateAppliance);
  const [step, setStep] = useState<Step>(editAppliance ? 'confirm' : 'capture');
  const [result, setResult] = useState<ApplianceScanResult | null>(null);
  const [labelInput, setLabelInput] = useState(editAppliance?.label ?? '');
  const [wattsInput, setWattsInput] = useState(editAppliance ? String(editAppliance.watts) : '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleCapture(source: 'camera' | 'library') {
    const image = await pickImage(source);
    if (!image) return;

    setStep('scanning');
    try {
      const scanResult = await scanAppliancePhoto(image.base64, image.mimeType);
      setResult(scanResult);
      setLabelInput(scanResult.applianceType);
      setWattsInput(scanResult.wattsDetected !== null ? String(scanResult.wattsDetected) : '');
      setStep('confirm');
    } catch (err) {
      console.log('Appliance scan failed:', err);
      setStep('failed');
    }
  }

  function handleEnterManually() {
    setResult(null);
    setLabelInput('');
    setWattsInput('');
    setStep('confirm');
  }

  async function handleSave() {
    setSaveError(null);
    const watts = parseFloat(wattsInput);
    if (!labelInput.trim() || !Number.isFinite(watts) || watts <= 0) {
      setSaveError(t('applianceScan.validationError'));
      return;
    }

    setSaving(true);
    try {
      if (editAppliance) {
        await updateAppliance(uid, editAppliance.id, { label: labelInput.trim(), watts });
      } else {
        await addDoc(collection(db, 'users', uid, 'appliances'), {
          label: labelInput.trim(),
          watts,
          source: result?.source ?? 'manual',
          confirmedByUser: true,
          notifyEnabled: false,
          createdAt: serverTimestamp(),
        });
      }
      onBack();
    } catch (err) {
      console.log('Failed to save appliance:', err);
      setSaveError(t('applianceScan.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (step === 'scanning') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accentAmber} />
        <Text style={styles.scanningLabel}>{t('applianceScan.scanning')}</Text>
      </View>
    );
  }

  if (step === 'confirm') {
    const isManual = result === null;
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t(editAppliance ? 'applianceScan.editTitle' : 'applianceScan.confirmTitle')}</Text>
        {!isManual && (
          <>
            <Chip
              label={t(result.source === 'label' ? 'applianceScan.sourceLabel' : 'applianceScan.sourceEstimate')}
              variant={result.confidence === 'high' ? 'teal' : 'amber'}
            />
            <AiNote kind="scan" />
          </>
        )}

        <Text style={styles.fieldLabel}>{t('applianceScan.labelField')}</Text>
        <TextInput style={styles.input} value={labelInput} onChangeText={setLabelInput} placeholder={t('applianceScan.labelPlaceholder')} placeholderTextColor={theme.colors.textFaint} />

        <Text style={styles.fieldLabel}>{t('applianceScan.wattsField')}</Text>
        <TextInput
          style={styles.input}
          value={wattsInput}
          onChangeText={setWattsInput}
          keyboardType="numeric"
          placeholder={t('applianceScan.wattsPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
        />

        {saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}

        <View style={styles.saveButtonWrapper}>
          <PrimaryButton label={t('common.finish')} onPress={handleSave} loading={saving} />
        </View>
      </ScrollView>
    );
  }

  if (step === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.failedText}>{t('applianceScan.failed')}</Text>
        <View style={styles.failedButtonWrapper}>
          <SecondaryButton label={t('applianceScan.enterManually')} onPress={handleEnterManually} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backRow} accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={20} color={theme.colors.textSecondary} />
      </Pressable>
      <Text style={styles.title}>{t('applianceScan.title')}</Text>
      <Text style={styles.subtitle}>{t('applianceScan.subtitle')}</Text>

      <Pressable onPress={() => handleCapture('camera')}>
        <Card style={styles.captureCard}>
          <IconCamera size={22} color={theme.colors.textSecondary} />
          <Text style={styles.captureLabel}>{t('applianceScan.takePhoto')}</Text>
        </Card>
      </Pressable>

      <Pressable onPress={() => handleCapture('library')}>
        <Card style={styles.captureCard}>
          <IconPhoto size={22} color={theme.colors.textSecondary} />
          <Text style={styles.captureLabel}>{t('applianceScan.chooseFromLibrary')}</Text>
        </Card>
      </Pressable>

      <Pressable onPress={handleEnterManually} style={styles.manualLink}>
        <Text style={styles.manualLinkText}>{t('applianceScan.enterManually')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  backRow: { marginBottom: 12, alignSelf: 'flex-start' },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted, marginTop: 4, marginBottom: 24 },
  captureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  captureLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  manualLink: { marginTop: 12, alignSelf: 'center' },
  manualLinkText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  scanningLabel: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  fieldLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textPrimary,
  },
  saveButtonWrapper: { marginTop: 28 },
  saveErrorText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.dangerEmber, marginTop: 20 },
  failedText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, textAlign: 'center' },
  failedButtonWrapper: { minWidth: 200 },
});
