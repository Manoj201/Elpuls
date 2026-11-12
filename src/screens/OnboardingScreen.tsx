import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

interface OnboardingScreenProps {
  uid: string;
  onDone: () => void;
}

const HEATING_VALUES: NonNullable<HeatingType>[] = ['district', 'electric', 'heat_pump', 'other'];

const STEP_COUNT = 5;

function parsePositiveFloat(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function OnboardingScreen({ uid, onDone }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const config = useCountryStore((s) => s.config);
  const setActiveZone = useCountryStore((s) => s.setZone);
  const setOnboardingInfo = useUserStore((s) => s.setOnboardingInfo);

  const [step, setStep] = useState(0);
  const [zone, setZone] = useState<string | null>(null);
  const [postcodeInput, setPostcodeInput] = useState('');
  const [zoneTouchedManually, setZoneTouchedManually] = useState(false);
  const [heatingType, setHeatingType] = useState<HeatingType>(null);
  const [hasSolar, setHasSolar] = useState<boolean | null>(null);
  const [hasEv, setHasEv] = useState<boolean | null>(null);
  const [gridFeeFixedInput, setGridFeeFixedInput] = useState('');
  const [gridFeeVariableInput, setGridFeeVariableInput] = useState('');
  const [saving, setSaving] = useState(false);

  const canContinue =
    (step === 0 && zone !== null) ||
    (step === 1 && heatingType !== null) ||
    (step === 2 && hasSolar !== null) ||
    (step === 3 && hasEv !== null) ||
    step === 4; // grid fee is optional/skippable

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
        setDoc(doc(db, 'users', uid), { ...info, onboardedAt: serverTimestamp() }, { merge: true }),
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

  return (
    <View style={styles.container}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEP_COUNT) * 100}%` }]} />
      </View>

      {step === 0 && (
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

      {step === 1 && (
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

      {step === 2 && (
        <Step title={t('onboarding.solarTitle')} subtitle={t('onboarding.solarSubtitle')}>
          <OptionCard label={t('common.yes')} selected={hasSolar === true} onPress={() => setHasSolar(true)} />
          <OptionCard label={t('common.no')} selected={hasSolar === false} onPress={() => setHasSolar(false)} />
        </Step>
      )}

      {step === 3 && (
        <Step title={t('onboarding.evTitle')} subtitle={t('onboarding.evSubtitle')}>
          <OptionCard label={t('common.yes')} selected={hasEv === true} onPress={() => setHasEv(true)} />
          <OptionCard label={t('common.no')} selected={hasEv === false} onPress={() => setHasEv(false)} />
        </Step>
      )}

      {step === 4 && (
        <Step title={t('onboarding.gridFeeTitle')} subtitle={t('onboarding.gridFeeSubtitle')}>
          <TextInput
            style={styles.gridFeeInput}
            placeholder={t('onboarding.gridFeeFixedPlaceholder')}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="numeric"
            value={gridFeeFixedInput}
            onChangeText={setGridFeeFixedInput}
          />
          <TextInput
            style={styles.gridFeeInput}
            placeholder={t('onboarding.gridFeeVariablePlaceholder')}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="numeric"
            value={gridFeeVariableInput}
            onChangeText={setGridFeeVariableInput}
          />
          <Pressable onPress={handleContinue}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </Pressable>
        </Step>
      )}

      <View style={styles.footer}>
        <PrimaryButton
          label={step < STEP_COUNT - 1 ? t('common.continue') : t('common.finish')}
          onPress={handleContinue}
          disabled={!canContinue || saving}
        />
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
  progressTrack: {
    height: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.borderMuted,
    marginBottom: 32,
  },
  progressFill: {
    height: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentAmber,
  },
  step: { flex: 1 },
  stepTitle: { fontFamily: theme.typography.display, fontSize: 18, color: theme.colors.textPrimary },
  stepSubtitle: {
    fontFamily: theme.typography.body,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 4,
    marginBottom: 24,
  },
  stepOptions: { gap: 10 },
  postcodeInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  postcodeGuessHint: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.accentAmberDeep,
  },
  zoneRow: { flexDirection: 'row', gap: 8 },
  zoneInfoText: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  gridFeeInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  skipText: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  footer: { paddingTop: 16, paddingBottom: 12 },
});
