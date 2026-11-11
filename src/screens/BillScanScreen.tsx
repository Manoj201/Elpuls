import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { IconArrowLeft, IconCamera, IconFileText } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { pickImage, scanElectricityBill, type BillScanResult } from '../lib/scan';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';

type Step = 'capture' | 'scanning' | 'confirm' | 'failed';

interface BillScanScreenProps {
  uid: string;
  onBack: () => void;
}

export function BillScanScreen({ uid, onBack }: BillScanScreenProps) {
  const { t } = useTranslation();
  const gridFeeFixedSekPerMonth = useUserStore((s) => s.gridFeeFixedSekPerMonth);
  const setGridFee = useUserStore((s) => s.setGridFee);
  const setRetailerMarkup = useUserStore((s) => s.setRetailerMarkup);

  const [step, setStep] = useState<Step>('capture');
  const [result, setResult] = useState<BillScanResult | null>(null);
  const [gridFeeInput, setGridFeeInput] = useState('');
  const [retailerMarkupInput, setRetailerMarkupInput] = useState('');
  const [saving, setSaving] = useState(false);

  async function runScan(fileBase64: string, mimeType: string) {
    setStep('scanning');
    try {
      const scanResult = await scanElectricityBill(fileBase64, mimeType);
      setResult(scanResult);
      setGridFeeInput(scanResult.gridFeeVariableOrePerKwh !== null ? String(scanResult.gridFeeVariableOrePerKwh) : '');
      setRetailerMarkupInput(scanResult.retailerMarkupOrePerKwh !== null ? String(scanResult.retailerMarkupOrePerKwh) : '');
      setStep('confirm');
    } catch (err) {
      console.log('Bill scan failed:', err);
      setStep('failed');
    }
  }

  async function handleTakePhoto() {
    const image = await pickImage('camera');
    if (!image) return;
    await runScan(image.base64, image.mimeType);
  }

  async function handlePickPdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets[0]) return;

    const base64 = await new File(result.assets[0].uri).base64();
    await runScan(base64, 'application/pdf');
  }

  function handleEnterManually() {
    setResult(null);
    setGridFeeInput('');
    setRetailerMarkupInput('');
    setStep('confirm');
  }

  async function handleSave() {
    const gridFeeOre = parseFloat(gridFeeInput);
    const retailerMarkupOre = parseFloat(retailerMarkupInput);
    const gridFeeVariableSekPerKwh = Number.isFinite(gridFeeOre) && gridFeeOre > 0 ? gridFeeOre / 100 : null;
    const retailerMarkupSekPerKwh = Number.isFinite(retailerMarkupOre) && retailerMarkupOre > 0 ? retailerMarkupOre / 100 : null;

    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setGridFee(gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh);
      setRetailerMarkup(retailerMarkupSekPerKwh);
      onBack();
    } finally {
      setSaving(false);
    }
  }

  if (step === 'scanning') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accentAmber} />
        <Text style={styles.scanningLabel}>{t('billScan.scanning')}</Text>
      </View>
    );
  }

  if (step === 'confirm') {
    const isManual = result === null;
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('billScan.confirmTitle')}</Text>
        {!isManual && (
          <Chip label={t(result.confidence === 'high' ? 'billScan.confidenceHigh' : 'billScan.confidenceLow')} variant={result.confidence === 'high' ? 'teal' : 'amber'} />
        )}

        <Text style={styles.fieldLabel}>{t('onboarding.gridFeeVariablePlaceholder')}</Text>
        <TextInput
          style={styles.input}
          value={gridFeeInput}
          onChangeText={setGridFeeInput}
          keyboardType="numeric"
          placeholder={t('onboarding.gridFeeVariablePlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
        />

        <Text style={styles.fieldLabel}>{t('billScan.retailerMarkupField')}</Text>
        <TextInput
          style={styles.input}
          value={retailerMarkupInput}
          onChangeText={setRetailerMarkupInput}
          keyboardType="numeric"
          placeholder={t('billScan.retailerMarkupPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
        />

        <View style={styles.saveButtonWrapper}>
          <PrimaryButton label={saving ? t('settings.saving') : t('common.finish')} onPress={handleSave} disabled={saving} />
        </View>
      </ScrollView>
    );
  }

  if (step === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.failedText}>{t('billScan.failed')}</Text>
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
      <Text style={styles.title}>{t('billScan.title')}</Text>
      <Text style={styles.subtitle}>{t('billScan.subtitle')}</Text>

      <Pressable onPress={handleTakePhoto}>
        <Card style={styles.captureCard}>
          <IconCamera size={22} color={theme.colors.textSecondary} />
          <Text style={styles.captureLabel}>{t('billScan.takePhoto')}</Text>
        </Card>
      </Pressable>

      <Pressable onPress={handlePickPdf}>
        <Card style={styles.captureCard}>
          <IconFileText size={22} color={theme.colors.textSecondary} />
          <Text style={styles.captureLabel}>{t('billScan.choosePdf')}</Text>
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
  title: { fontFamily: theme.typography.display, fontSize: 24, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginTop: 4, marginBottom: 24 },
  captureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  captureLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 15, color: theme.colors.textPrimary },
  manualLink: { marginTop: 12, alignSelf: 'center' },
  manualLinkText: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textSecondary },
  scanningLabel: { fontFamily: theme.typography.body, fontSize: 15, color: theme.colors.textSecondary },
  fieldLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
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
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  saveButtonWrapper: { marginTop: 28 },
  failedText: { fontFamily: theme.typography.body, fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center' },
  failedButtonWrapper: { minWidth: 200 },
});
