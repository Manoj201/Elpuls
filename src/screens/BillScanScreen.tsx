import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { IconArrowLeft, IconCamera, IconChevronRight, IconFileText } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { pickImage, scanElectricityBill, type BillScanResult } from '../lib/scan';
import type { BillDetails } from '../stores/useUserStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { findCurrentPrice } from '../lib/priceUtils';
import { calculateLandedPrice } from '../lib/landedCost';
import { RealPriceBars } from '../components/RealPriceBars';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { AiNote } from '../components/AiNote';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { LabeledInput } from '../components/LabeledInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';

type Step = 'capture' | 'scanning' | 'confirm' | 'failed' | 'result';

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
  return sekPerKwh === null ? '' : formatInput(sekPerKwh * 100);
}

const VAT = 1.25;
type FeePer = 'year' | 'month';

/** Stored fee (kr/month incl. VAT) → what the bill prints: excl. VAT, per year or month. */
function feeToInput(monthlyInclVat: number | null, per: FeePer): string {
  if (monthlyInclVat === null) return '';
  const exclVat = monthlyInclVat / VAT;
  return formatInput(per === 'year' ? exclVat * 12 : exclVat);
}

/** Typed fee (excl. VAT, per year or month) → stored kr/month incl. VAT. */
function inputToFee(value: string, per: FeePer): number | null {
  const n = parseOre(value);
  if (n === null) return null;
  return Math.round((per === 'year' ? n / 12 : n) * VAT * 100) / 100;
}

function formatInput(value: number | null): string {
  return value === null ? '' : String(Number(value.toFixed(2))).replace('.', ',');
}

export function BillScanScreen({ uid, onBack, startManual = false }: BillScanScreenProps) {
  const { t } = useTranslation();
  const user = useUserStore();
  const setBillDetails = useUserStore((s) => s.setBillDetails);

  const [step, setStep] = useState<Step>(startManual ? 'confirm' : 'capture');
  const [result, setResult] = useState<BillScanResult | null>(null);
  const [gridFeeInput, setGridFeeInput] = useState(startManual ? formatOre(user.gridFeeVariableSekPerKwh) : '');
  // Fixed fees are typed as the bill prints them: excl. VAT, per year (most bills) or month.
  const [gridFixedPer, setGridFixedPer] = useState<FeePer>('year');
  const [retailerFixedPer, setRetailerFixedPer] = useState<FeePer>('year');
  const [gridFixedInput, setGridFixedInput] = useState(startManual ? feeToInput(user.gridFeeFixedSekPerMonth, 'year') : '');
  const [retailerMarkupInput, setRetailerMarkupInput] = useState(startManual ? formatOre(user.retailerMarkupSekPerKwh) : '');
  const [retailerFixedInput, setRetailerFixedInput] = useState(startManual ? feeToInput(user.retailerFixedSekPerMonth, 'year') : '');
  const [usageInput, setUsageInput] = useState(formatInput(user.estimatedMonthlyKwh));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [realPrice, setRealPrice] = useState<{ spotOre: number; paidOre: number; hasMarkup: boolean } | null>(null);

  // Which side(s) of the bill the confirm step shows and saves. Typing it
  // in yourself shows both; a scan shows only what that bill covers, so a
  // grid bill never wipes the markup from an earlier supplier bill.
  const showGrid = result === null || result.billType !== 'retailer';
  const showRetailer = result === null || result.billType !== 'grid';

  async function runScan(fileBase64: string, mimeType: string) {
    setStep('scanning');
    try {
      const scanResult = await scanElectricityBill(fileBase64, mimeType);
      // Older servers don't send billType; treat that as a combined bill.
      const normalized: BillScanResult = { ...scanResult, billType: scanResult.billType ?? 'combined' };
      setResult(normalized);
      setGridFeeInput(formatInput(normalized.gridFeeVariableOrePerKwh));
      setGridFixedInput(feeToInput(normalized.gridFeeFixedSekPerMonth ?? null, gridFixedPer));
      setRetailerMarkupInput(formatInput(normalized.retailerMarkupOrePerKwh));
      setRetailerFixedInput(feeToInput(normalized.retailerFixedSekPerMonth ?? null, retailerFixedPer));
      // Usage per month from the bill's kWh and period; otherwise keep what's saved.
      const monthly =
        normalized.consumptionKwh && normalized.periodDays && normalized.periodDays >= 7
          ? Math.round(((normalized.consumptionKwh / normalized.periodDays) * 30.4) / 10) * 10
          : null;
      setUsageInput(formatInput(monthly ?? user.estimatedMonthlyKwh));
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
    setGridFeeInput(formatOre(user.gridFeeVariableSekPerKwh));
    setGridFixedInput(feeToInput(user.gridFeeFixedSekPerMonth, gridFixedPer));
    setRetailerMarkupInput(formatOre(user.retailerMarkupSekPerKwh));
    setRetailerFixedInput(feeToInput(user.retailerFixedSekPerMonth, retailerFixedPer));
    setUsageInput(formatInput(user.estimatedMonthlyKwh));
    setStep('confirm');
  }

  async function handleSave() {
    const changes: Partial<BillDetails> = {};
    if (showGrid) {
      const ore = parseOre(gridFeeInput);
      changes.gridFeeVariableSekPerKwh = ore === null ? null : ore / 100;
      changes.gridFeeFixedSekPerMonth = inputToFee(gridFixedInput, gridFixedPer);
      if (result?.gridCompanyName) changes.gridCompanyName = result.gridCompanyName;
    }
    if (showRetailer) {
      const ore = parseOre(retailerMarkupInput);
      changes.retailerMarkupSekPerKwh = ore === null ? null : ore / 100;
      changes.retailerFixedSekPerMonth = inputToFee(retailerFixedInput, retailerFixedPer);
      if (result?.retailerName) changes.retailerName = result.retailerName;
    }

    const estimatedMonthlyKwh = parseOre(usageInput);

    setSaving(true);
    setSaveError(null);
    try {
      await setDoc(doc(db, 'users', uid), { ...changes, estimatedMonthlyKwh, updatedAt: serverTimestamp() }, { merge: true });
      setBillDetails(changes);
      useUserStore.getState().setEstimatedMonthlyKwh(estimatedMonthlyKwh);
      const shown = await currentRealPrice();
      if (shown) {
        setRealPrice(shown);
        setStep('result');
      } else {
        onBack();
      }
    } catch (err) {
      console.log('Saving bill values failed:', err);
      setSaveError(t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  /**
   * The user's own price right now vs. the spot price, for the result step
   * after saving. Null when the grid fee is still missing or no price is
   * loaded (then the screen just closes).
   */
  async function currentRealPrice() {
    const { gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh } = useUserStore.getState();
    if (gridFeeVariableSekPerKwh === null) return null;
    try {
      if (usePriceStore.getState().todayPrices.length === 0) {
        const zone = useUserStore.getState().zone ?? useCountryStore.getState().zone;
        await usePriceStore.getState().fetchPrices(zone);
      }
    } catch {
      return null;
    }
    const spot = findCurrentPrice(usePriceStore.getState().todayPrices, new Date());
    if (!spot) return null;
    return {
      spotOre: spot.price * 100,
      paidOre: calculateLandedPrice(spot.price, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh) * 100,
      hasMarkup: retailerMarkupSekPerKwh !== null,
    };
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

  if (step === 'result' && realPrice) {
    const spot = Math.round(realPrice.spotOre);
    const paid = Math.round(realPrice.paidOre);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('billScan.resultTitle')}
        </Text>
        <Text style={styles.subtitle}>{t('billScan.resultSubtitle')}</Text>
        <Card style={styles.resultCard}>
          <RealPriceBars
            spotLabel={t('realPrice.spotLabel')}
            spotValue={t('realPrice.ore', { value: spot })}
            paidLabel={t('realPrice.paidLabelYou')}
            paidValue={t('realPrice.ore', { value: paid })}
            spotShare={paid > 0 ? spot / paid : 1}
            accessibilityLabel={t('realPrice.a11y', { spot, paid })}
          />
        </Card>
        <Text style={styles.resultNote}>
          {t(realPrice.hasMarkup ? 'billScan.resultDifference' : 'billScan.resultDifferenceNoMarkup')}
        </Text>
        <View style={styles.saveButtonWrapper}>
          <PrimaryButton
            label={t('billScan.resultDone')}
            onPress={() => {
              useUserStore.getState().setPriceView('landed');
              onBack();
            }}
          />
        </View>
      </ScrollView>
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

        {!isManual && (
          <Text style={styles.billTypeNote}>{t(`billScan.billType.${result.billType}`)}</Text>
        )}

        {showRetailer && (
          <View style={styles.group}>
            <Text style={styles.groupTitle} accessibilityRole="header">
              {t('billScan.retailerGroup')}
              {result?.retailerName ? <Text style={styles.groupCompany}>{` · ${result.retailerName}`}</Text> : null}
            </Text>
            <LabeledInput
              label={t('billScan.retailerMarkupField')}
              unit={t('fields.unitOrePerKwh')}
              helper={t('billScan.retailerMarkupHelper')}
              placeholder={t('billScan.retailerMarkupPlaceholder')}
              keyboardType="decimal-pad"
              value={retailerMarkupInput}
              onChangeText={setRetailerMarkupInput}
            />
            <FixedFeeInput
              label={t('billScan.retailerFixedField')}
              where={t('billScan.retailerFixedWhere')}
              placeholder={retailerFixedPer === 'year' ? '528' : '44'}
              value={retailerFixedInput}
              per={retailerFixedPer}
              onChangeValue={setRetailerFixedInput}
              onChangePer={(next) => {
                setRetailerFixedInput(feeToInput(inputToFee(retailerFixedInput, retailerFixedPer), next));
                setRetailerFixedPer(next);
              }}
            />
          </View>
        )}

        {showGrid && (
          <View style={styles.group}>
            <Text style={styles.groupTitle} accessibilityRole="header">
              {t('billScan.gridGroup')}
              {result?.gridCompanyName ? <Text style={styles.groupCompany}>{` · ${result.gridCompanyName}`}</Text> : null}
            </Text>
            <LabeledInput
              label={t('fields.gridFeeVariableLabel')}
              unit={t('fields.unitOrePerKwh')}
              helper={t('billScan.gridFeeHelper')}
              placeholder={t('fields.exampleGridFeeVariable')}
              keyboardType="decimal-pad"
              value={gridFeeInput}
              onChangeText={setGridFeeInput}
            />
            <FixedFeeInput
              label={t('fields.gridFeeFixedLabel')}
              where={t('billScan.gridFixedWhere')}
              placeholder={gridFixedPer === 'year' ? '6 468' : '539'}
              value={gridFixedInput}
              per={gridFixedPer}
              onChangeValue={setGridFixedInput}
              onChangePer={(next) => {
                setGridFixedInput(feeToInput(inputToFee(gridFixedInput, gridFixedPer), next));
                setGridFixedPer(next);
              }}
            />
          </View>
        )}

        <View style={styles.group}>
          <Text style={styles.groupTitle} accessibilityRole="header">
            {t('billScan.usageGroup')}
          </Text>
          <LabeledInput
            label={t('fields.estimatedMonthlyKwhLabel')}
            unit={t('fields.unitKwhPerMonth')}
            helper={t('billScan.usageHelper')}
            placeholder={t('fields.exampleMonthlyKwh')}
            keyboardType="decimal-pad"
            value={usageInput}
            onChangeText={setUsageInput}
          />
        </View>

        {!isManual && result.billType !== 'combined' && (
          <Text style={styles.otherBillNote}>{t(`billScan.otherBill.${result.billType}`)}</Text>
        )}

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

/**
 * A fixed fee typed exactly as the bill prints it: excl. VAT, per year or per
 * month. Underneath, what it comes to per month with VAT, which is what
 * Elpuls stores and uses.
 */
function FixedFeeInput({
  label,
  where,
  placeholder,
  value,
  per,
  onChangeValue,
  onChangePer,
}: {
  label: string;
  where: string;
  placeholder: string;
  value: string;
  per: FeePer;
  onChangeValue: (value: string) => void;
  onChangePer: (per: FeePer) => void;
}) {
  const { t } = useTranslation();
  const monthly = inputToFee(value, per);
  return (
    <View style={styles.feeInput}>
      <LabeledInput
        label={t('billScan.fixedExclVat', { label })}
        unit={t(per === 'year' ? 'billScan.unitKrPerYear' : 'fields.unitKrPerMonth')}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChangeValue}
      />
      <View style={styles.perRow} accessibilityRole="radiogroup">
        <Chip label={t('billScan.perYear')} selected={per === 'year'} onPress={() => onChangePer('year')} />
        <Chip label={t('billScan.perMonth')} selected={per === 'month'} onPress={() => onChangePer('month')} />
      </View>
      <Text style={styles.feeHint}>{where}</Text>
      {monthly !== null && (
        <Text style={styles.feeWithVat}>{t('billScan.withVat', { amount: Math.round(monthly) })}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, alignSelf: 'flex-start', minHeight: 44 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, marginTop: 6, marginBottom: 24 },
  scanMeta: { marginBottom: 16 },
  resultCard: { marginBottom: 16 },
  resultNote: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary },
  billTypeNote: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary, marginBottom: 16 },
  group: { marginBottom: 8 },
  feeInput: { marginBottom: 16 },
  perRow: { flexDirection: 'row', gap: 8, marginTop: -8 },
  feeHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 8 },
  feeWithVat: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, marginTop: 4, fontVariant: ['tabular-nums'] },
  groupTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginBottom: 12 },
  groupCompany: { fontFamily: theme.typography.body, color: theme.colors.textSecondary },
  otherBillNote: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 8 },
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
