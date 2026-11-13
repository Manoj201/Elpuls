import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { IconArrowLeft, IconCamera, IconChevronRight, IconFileText } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { pickImage, scanElectricityBill, type BillScanResult } from '../lib/scan';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { AiNote } from '../components/AiNote';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { LabeledInput } from '../components/LabeledInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';

type Step = 'capture' | 'scanning' | 'confirm' | 'failed';

interface BillScanScreenProps {
  uid: string;
  onBack: () => void;
  /** Open straight on the manual-entry form (e.g. "Enter it myself" from the Home setup card). */
  startManual?: boolean;
}

/** Accepts Swedish decimal commas ("24,5") as well as dots. Returns null for empty or non-positive input. */
function parseOre(value: string): number | null {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatOre(sekPerKwh: number | null): string {
  return sekPerKwh === null ? '' : String(Number((sekPerKwh * 100).toFixed(2))).replace('.', ',');
}

export function BillScanScreen({ uid, onBack, startManual = false }: BillScanScreenProps) {
  const { t } = useTranslation();
  const gridFeeFixedSekPerMonth = useUserStore((s) => s.gridFeeFixedSekPerMonth);
  const currentGridFee = useUserStore((s) => s.gridFeeVariableSekPerKwh);
  const currentMarkup = useUserStore((s) => s.retailerMarkupSekPerKwh);
  const setGridFee = useUserStore((s) => s.setGridFee);
  const setRetailerMarkup = useUserStore((s) => s.setRetailerMarkup);

  const [step, setStep] = useState<Step>(startManual ? 'confirm' : 'capture');
  const [result, setResult] = useState<BillScanResult | null>(null);
  const [gridFeeInput, setGridFeeInput] = useState(startManual ? formatOre(currentGridFee) : '');
  const [retailerMarkupInput, setRetailerMarkupInput] = useState(startManual ? formatOre(currentMarkup) : '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function runScan(fileBase64: string, mimeType: string) {
    setStep('scanning');
    try {
      const scanResult = await scanElectricityBill(fileBase64, mimeType);
      setResult(scanResult);
      setGridFeeInput(scanResult.gridFeeVariableOrePerKwh !== null ? String(scanResult.gridFeeVariableOrePerKwh).replace('.', ',') : '');
      setRetailerMarkupInput(scanResult.retailerMarkupOrePerKwh !== null ? String(scanResult.retailerMarkupOrePerKwh).replace('.', ',') : '');
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
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (picked.canceled || !picked.assets[0]) return;

    const base64 = await new File(picked.assets[0].uri).base64();
    await runScan(base64, 'application/pdf');
  }

  function handleEnterManually() {
    setResult(null);
    setGridFeeInput(formatOre(currentGridFee));
    setRetailerMarkupInput(formatOre(currentMarkup));
    setStep('confirm');
  }

  async function handleSave() {
    const gridFeeOre = parseOre(gridFeeInput);
    const retailerMarkupOre = parseOre(retailerMarkupInput);
    const gridFeeVariableSekPerKwh = gridFeeOre === null ? null : gridFeeOre / 100;
    const retailerMarkupSekPerKwh = retailerMarkupOre === null ? null : retailerMarkupOre / 100;

    setSaving(true);
    setSaveError(null);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setGridFee(gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh);
      setRetailerMarkup(retailerMarkupSekPerKwh);
      onBack();
    } catch (err) {
      console.log('Saving bill values failed:', err);
      setSaveError(t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function BackButton({ onPress }: { onPress: () => void }) {
    return (
      <Pressable onPress={onPress} hitSlop={12} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={22} color={theme.colors.textSecondary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>
    );
  }

  if (step === 'scanning') {
    return (
      <View style={styles.centered} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={theme.colors.accentAmber} />
        <Text style={styles.scanningLabel}>{t('billScan.scanning')}</Text>
      </View>
    );
  }

  if (step === 'confirm') {
    const isManual = result === null;
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={startManual && isManual ? onBack : () => setStep('capture')} />
        <Text style={styles.title} accessibilityRole="header">
          {t(isManual ? 'billScan.manualTitle' : 'billScan.confirmTitle')}
        </Text>
        <Text style={styles.subtitle}>{t(isManual ? 'billScan.manualSubtitle' : 'billScan.confirmSubtitle')}</Text>

        {!isManual && (
          <View style={styles.scanMeta}>
            <Chip
              label={t(result.confidence === 'high' ? 'billScan.confidenceHigh' : 'billScan.confidenceLow')}
              variant={result.confidence === 'high' ? 'teal' : 'amber'}
            />
            <AiNote kind="scan" />
          </View>
        )}

        <LabeledInput
          label={t('fields.gridFeeVariableLabel')}
          unit={t('fields.unitOrePerKwh')}
          helper={t('billScan.gridFeeHelper')}
          placeholder={t('fields.exampleGridFeeVariable')}
          keyboardType="decimal-pad"
          value={gridFeeInput}
          onChangeText={setGridFeeInput}
        />
        <LabeledInput
          label={t('billScan.retailerMarkupField')}
          unit={t('fields.unitOrePerKwh')}
          helper={t('billScan.retailerMarkupHelper')}
          placeholder={t('billScan.retailerMarkupPlaceholder')}
          keyboardType="decimal-pad"
          value={retailerMarkupInput}
          onChangeText={setRetailerMarkupInput}
        />

        {saveError && <Text style={styles.error}>{saveError}</Text>}
        <View style={styles.saveButtonWrapper}>
          <PrimaryButton label={t('billScan.save')} onPress={handleSave} loading={saving} />
        </View>
      </ScrollView>
    );
  }

  if (step === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.failedText}>{t('billScan.failed')}</Text>
        <View style={styles.failedButtonWrapper}>
          <PrimaryButton label={t('billScan.tryAgain')} onPress={() => setStep('capture')} />
          <SecondaryButton label={t('applianceScan.enterManually')} onPress={handleEnterManually} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={onBack} />
      <Text style={styles.title} accessibilityRole="header">
        {t('billScan.title')}
      </Text>
      <Text style={styles.subtitle}>{t('billScan.subtitle')}</Text>

      <Pressable onPress={handleTakePhoto} accessibilityRole="button" accessibilityLabel={t('billScan.takePhoto')}>
        <Card style={styles.captureCard}>
          <IconCamera size={24} color={theme.colors.accentPurpleDeep} />
          <Text style={styles.captureLabel}>{t('billScan.takePhoto')}</Text>
          <IconChevronRight size={20} color={theme.colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable onPress={handlePickPdf} accessibilityRole="button" accessibilityLabel={t('billScan.choosePdf')}>
        <Card style={styles.captureCard}>
          <IconFileText size={24} color={theme.colors.accentPurpleDeep} />
          <Text style={styles.captureLabel}>{t('billScan.choosePdf')}</Text>
          <IconChevronRight size={20} color={theme.colors.textMuted} />
        </Card>
      </Pressable>

      <Text style={styles.privacyNote}>{t('billScan.privacyNote')}</Text>

      <Pressable onPress={handleEnterManually} style={styles.manualLink} hitSlop={8} accessibilityRole="button">
        <Text style={styles.manualLinkText}>{t('applianceScan.enterManually')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, alignSelf: 'flex-start', minHeight: 44 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, marginTop: 6, marginBottom: 24 },
  scanMeta: { marginBottom: 20 },
  captureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, minHeight: 56 },
  captureLabel: { flex: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  privacyNote: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4 },
  manualLink: { marginTop: 20, alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  manualLinkText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  scanningLabel: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textSecondary },
  error: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.dangerEmber, marginTop: 4 },
  saveButtonWrapper: { marginTop: 20 },
  failedText: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, textAlign: 'center' },
  failedButtonWrapper: { alignSelf: 'stretch', gap: 12 },
});
