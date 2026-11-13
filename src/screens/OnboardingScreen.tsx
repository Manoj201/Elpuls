import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCountryStore } from '../stores/useCountryStore';
import { useUserStore, type HeatingType } from '../stores/useUserStore';
import { guessZoneFromPostcode } from '../lib/postcodeZone';
import { theme } from '../theme';
import { Chip } from '../components/Chip';
import { OptionCard } from '../components/OptionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { LabeledInput } from '../components/LabeledInput';
import { InfoRow } from '../components/InfoRow';
import { IconReceipt } from '@tabler/icons-react-native';
import { BillScanScreen } from './BillScanScreen';

interface OnboardingScreenProps {
  uid: string;
  onDone: () => void;
}

const HEATING_VALUES: NonNullable<HeatingType>[] = ['district', 'electric', 'heat_pump', 'other'];

const STEP_COUNT = 6;

/** Accepts Swedish decimal commas ("24,5") as well as dots. */
function parsePositiveFloat(value: string): number | null {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function OnboardingScreen({ uid, onDone }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const config = useCountryStore((s) => s.config);
  const setActiveZone = useCountryStore((s) => s.setZone);
  const setOnboardingInfo = useUserStore((s) => s.setOnboardingInfo);

  const [step, setStep] = useState(0);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [postcodeInput, setPostcodeInput] = useState('');
  const [zoneTouchedManually, setZoneTouchedManually] = useState(false);
  const [heatingType, setHeatingType] = useState<HeatingType>(null);
  const [hasSolar, setHasSolar] = useState<boolean | null>(null);
  const [hasEv, setHasEv] = useState<boolean | null>(null);
  const [gridFeeFixedInput, setGridFeeFixedInput] = useState('');
  const [gridFeeVariableInput, setGridFeeVariableInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [billScanOpen, setBillScanOpen] = useState(false);

  const canContinue =
    (step === 0 && ageConfirmed) ||
    (step === 1 && zone !== null) ||
    (step === 2 && heatingType !== null) ||
    (step === 3 && hasSolar !== null) ||
    (step === 4 && hasEv !== null) ||
    step === 5; // grid fee is optional/skippable

  function handlePostcodeChange(value: string) {
    setPostcodeInput(value);
    if (zoneTouchedManually) return;
    const guessed = guessZoneFromPostcode(value);
    if (guessed) setZone(guessed);
  }

  function handleZoneChipPress(z: string) {
    setZoneTouchedManually(true);
    setZone(z);
  }

  async function handleContinue() {
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }

    setSaving(true);
    const gridFeeFixedSekPerMonth = parsePositiveFloat(gridFeeFixedInput);
    const gridFeeVariableOre = parsePositiveFloat(gridFeeVariableInput);
    const info = {
      zone: zone!,
      heatingType,
      hasEv: hasEv!,
      hasSolar: hasSolar!,
      gridFeeFixedSekPerMonth,
      gridFeeVariableSekPerKwh: gridFeeVariableOre === null ? null : gridFeeVariableOre / 100,
    };

    try {
      // setDoc waits for the server to confirm the write — if Firestore can't
      // be reached it never settles, so cap it instead of hanging forever.
      await Promise.race([
        setDoc(doc(db, 'users', uid), { ...info, ageConfirmedAt: serverTimestamp(), onboardedAt: serverTimestamp() }, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out saving profile (15s)')), 15000)),
      ]);
    } catch (err) {
      console.error('Onboarding save failed:', err);
      setSaving(false);
      Alert.alert(t('common.saveErrorTitle'), err instanceof Error ? err.message : String(err));
      return;
    }
    setOnboardingInfo(info);
    setActiveZone(info.zone);
    onDone();
  }

  // The bill scan saves the grid fee and retailer markup itself. Copy the
  // saved grid fee back into this step's field, so finishing onboarding
  // doesn't overwrite it with an empty value.
  if (billScanOpen) {
    return (
      <BillScanScreen
        uid={uid}
        onBack={() => {
          const saved = useUserStore.getState().gridFeeVariableSekPerKwh;
          if (saved !== null) setGridFeeVariableInput(String(Number((saved * 100).toFixed(2))).replace('.', ','));
          setBillScanOpen(false);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEP_COUNT) * 100}%` }]} />
      </View>

      <ScrollView style={styles.stepScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {step === 0 && (
        <Step title={t('onboarding.ageTitle')} subtitle={t('onboarding.ageSubtitle')}>
          <OptionCard
            label={t('onboarding.ageConfirmLabel')}
            selected={ageConfirmed}
            onPress={() => setAgeConfirmed(!ageConfirmed)}
          />
        </Step>
      )}

      {step === 1 && (
        <Step title={t('onboarding.zoneTitle')} subtitle={t('onboarding.zoneSubtitle')}>
          <TextInput
            style={styles.postcodeInput}
            placeholder={t('onboarding.postcodePlaceholder')}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="number-pad"
            maxLength={6}
            value={postcodeInput}
            onChangeText={handlePostcodeChange}
          />
          {zone && !zoneTouchedManually && postcodeInput.replace(/\D/g, '').length >= 2 && (
            <Text style={styles.postcodeGuessHint}>{t('onboarding.postcodeGuessed', { zone })}</Text>
          )}

          <View style={styles.zoneRow}>
            {config.zones.map((z) => (
              <Chip key={z} label={z} selected={z === zone} onPress={() => handleZoneChipPress(z)} />
            ))}
          </View>

          {zone && <Text style={styles.zoneInfoText}>{t(`onboarding.zoneInfo.${zone}`)}</Text>}
        </Step>
      )}

      {step === 2 && (
        <Step title={t('onboarding.heatingTitle')} subtitle={t('onboarding.heatingSubtitle')}>
          {HEATING_VALUES.map((value) => (
            <OptionCard
              key={value}
              label={t(`onboarding.heating.${value}`)}
              selected={heatingType === value}
              onPress={() => setHeatingType(value)}
            />
          ))}
        </Step>
      )}

      {step === 3 && (
        <Step title={t('onboarding.solarTitle')} subtitle={t('onboarding.solarSubtitle')}>
          <OptionCard label={t('common.yes')} selected={hasSolar === true} onPress={() => setHasSolar(true)} />
          <OptionCard label={t('common.no')} selected={hasSolar === false} onPress={() => setHasSolar(false)} />
        </Step>
      )}

      {step === 4 && (
        <Step title={t('onboarding.evTitle')} subtitle={t('onboarding.evSubtitle')}>
          <OptionCard label={t('common.yes')} selected={hasEv === true} onPress={() => setHasEv(true)} />
          <OptionCard label={t('common.no')} selected={hasEv === false} onPress={() => setHasEv(false)} />
        </Step>
      )}

      {step === 5 && (
        <Step title={t('onboarding.gridFeeTitle')} subtitle={t('onboarding.gridFeeSubtitle')}>
          <View style={styles.scanCard}>
            <InfoRow icon={IconReceipt} variant="teal" title={t('onboarding.scanBillTitle')} subtitle={t('onboarding.scanBillText')} />
            <SecondaryButton size="compact" label={t('onboarding.scanBillButton')} onPress={() => setBillScanOpen(true)} />
          </View>
          <Text style={styles.orText}>{t('onboarding.orTypeIt')}</Text>
          <LabeledInput
            label={t('fields.gridFeeVariableLabel')}
            unit={t('fields.unitOrePerKwh')}
            helper={t('onboarding.gridFeeVariableHelper')}
            placeholder={t('fields.exampleGridFeeVariable')}
            keyboardType="decimal-pad"
            value={gridFeeVariableInput}
            onChangeText={setGridFeeVariableInput}
          />
          <LabeledInput
            label={t('fields.gridFeeFixedLabel')}
            unit={t('fields.unitKrPerMonth')}
            placeholder={t('fields.exampleGridFeeFixed')}
            keyboardType="decimal-pad"
            value={gridFeeFixedInput}
            onChangeText={setGridFeeFixedInput}
          />
          <Pressable onPress={handleContinue} style={styles.skipButton} hitSlop={8} accessibilityRole="button">
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </Pressable>
        </Step>
      )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <View style={styles.backButton}>
            <SecondaryButton label={t('common.back')} onPress={() => setStep(step - 1)} disabled={saving} />
          </View>
        )}
        <View style={styles.nextButton}>
          <PrimaryButton
            label={step < STEP_COUNT - 1 ? t('common.continue') : t('common.finish')}
            onPress={handleContinue}
            disabled={!canContinue}
            loading={saving}
          />
        </View>
      </View>
    </View>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSubtitle}>{subtitle}</Text>
      <View style={styles.stepOptions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  stepScroll: { flex: 1 },
  progressTrack: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.borderMuted,
    marginBottom: 32,
  },
  progressFill: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentAmber,
  },
  step: { flex: 1 },
  stepTitle: { fontFamily: theme.typography.display, fontSize: theme.type.xl, lineHeight: 30, color: theme.colors.textPrimary },
  stepSubtitle: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.md,
    lineHeight: 24,
    color: theme.colors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
  },
  stepOptions: { gap: 12 },
  scanCard: {
    gap: 14,
    padding: 16,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: `${theme.colors.positiveTeal}33`,
    backgroundColor: theme.colors.positiveTealSoft,
  },
  orText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 4 },
  postcodeInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    fontFamily: theme.typography.body,
    fontSize: theme.type.md,
    color: theme.colors.textPrimary,
  },
  postcodeGuessHint: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    lineHeight: 20,
    color: theme.colors.accentAmberDeep,
  },
  zoneRow: { flexDirection: 'row', gap: 8 },
  zoneInfoText: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  skipButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipText: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.md,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 16, paddingBottom: 12 },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
});
