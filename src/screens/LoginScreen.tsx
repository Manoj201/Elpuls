import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconEye, IconEyeOff } from '@tabler/icons-react-native';
import { authErrorKey, isReturningUser, linkGuestToEmail, sendPasswordReset, signInWithEmail } from '../lib/auth';
import { theme } from '../theme';
import { LabeledInput } from '../components/LabeledInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';

interface LoginScreenProps {
  onSignedIn: (uid: string) => Promise<void>;
  onSkip: () => void;
}

/** `start`: one decision (get started or sign in). `signin` / `signup`: the email form for that action. */
type View_ = 'start' | 'signin' | 'signup';

const TERMS_URL = 'https://elpuls.ravenbees.com/terms';
const PRIVACY_URL = 'https://elpuls.ravenbees.com/privacy';

export function LoginScreen({ onSignedIn, onSkip }: LoginScreenProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View_>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Someone who signed out on this phone most likely wants to sign back in.
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    isReturningUser().then(setReturning);
  }, []);

  // One gentle fade-in on first show, skipped when the phone asks for less motion.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) fade.setValue(1);
        else Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      })
      .catch(() => fade.setValue(1));
  }, [fade]);

  function openView(next: View_) {
    setView(next);
    setError(null);
    setErrorKey(null);
    setInfo(null);
  }

  async function handleForgotPassword() {
    setError(null);
    setErrorKey(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('login.enterEmailForReset'));
      return;
    }
    try {
      await sendPasswordReset(email);
      setInfo(t('login.resetSent', { email: email.trim() }));
    } catch (err) {
      const key = authErrorKey(err);
      setErrorKey(key);
      setError(t(key));
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError(t('login.missingFields'));
      return;
    }

    setError(null);
    setErrorKey(null);
    setInfo(null);
    setLoading(true);

    try {
      const uid = view === 'signup' ? await linkGuestToEmail(email, password) : await signInWithEmail(email, password);
      await onSignedIn(uid);
    } catch (err) {
      console.log('Auth failed:', err);
      const key = authErrorKey(err);
      setErrorKey(key);
      setError(t(key));
    } finally {
      setLoading(false);
    }
  }

  const legal = (
    <View style={styles.legal}>
      <Text style={styles.legalText}>{t('login.legal')}</Text>
      <View style={styles.legalLinks}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8} accessibilityRole="link">
          <Text style={styles.legalLink}>{t('login.termsLink')}</Text>
        </Pressable>
        <Text style={styles.legalText}>·</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
          <Text style={styles.legalLink}>{t('login.privacyLink')}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (view === 'start') {
    return (
      <ScrollView contentContainerStyle={styles.startContainer}>
        <Animated.View style={[styles.brandBlock, { opacity: fade }]}>
          <Image source={require('../../assets/icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
          <Text style={styles.wordmark} accessibilityRole="header">
            Elpuls
          </Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </Animated.View>

        {/* Account first: Create account is the one primary action, Sign in
            is secondary (flipped for someone who signed out on this phone). Guest access stays (App Store guideline 5.1.1 does
            not allow forcing an account for features that work without one)
            but only as a small text link at the bottom. */}
        <View style={styles.actions}>
          {returning ? (
            <>
              <Text style={styles.accountBenefit}>{t('login.welcomeBack')}</Text>
              <PrimaryButton label={t('login.signIn')} onPress={() => openView('signin')} />
              <SecondaryButton label={t('login.createFreeAccount')} onPress={() => openView('signup')} />
            </>
          ) : (
            <>
              <Text style={styles.accountBenefit}>{t('login.accountBenefit')}</Text>
              <PrimaryButton label={t('login.createFreeAccount')} onPress={() => openView('signup')} />
              <SecondaryButton label={t('login.signIn')} onPress={() => openView('signin')} />
            </>
          )}
        </View>

        <View>
          <Pressable onPress={onSkip} style={styles.textButton} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.guestLink}>{t('login.continueWithoutAccount')}</Text>
          </Pressable>
          {legal}
        </View>
      </ScrollView>
    );
  }

  const isSignup = view === 'signup';

  return (
    <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
      <Pressable
        onPress={() => openView('start')}
        style={styles.backRow}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <IconArrowLeft size={22} color={theme.colors.textSecondary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>

      <Text style={styles.formTitle} accessibilityRole="header">
        {t(isSignup ? 'login.signupTitle' : 'login.signinTitle')}
      </Text>
      <Text style={styles.formSubtitle}>{t(isSignup ? 'login.signupSubtitle' : 'login.signinSubtitle')}</Text>

      <LabeledInput
        label={t('login.emailLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
        value={email}
        onChangeText={setEmail}
      />
      <LabeledInput
        label={t('login.passwordLabel')}
        helper={isSignup ? t('login.passwordHint') : undefined}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        // Sign-in: normal password AutoFill (Keychain). Create account:
        // 'oneTimeCode' opts out of iOS "Automatic Strong Password", which
        // without associated domains shows a yellow "cover view text" box.
        textContentType={isSignup ? 'oneTimeCode' : 'password'}
        autoComplete={isSignup ? 'off' : 'password'}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        value={password}
        onChangeText={setPassword}
        accessory={
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={12}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
          >
            {showPassword ? (
              <IconEyeOff size={22} color={theme.colors.textSecondary} />
            ) : (
              <IconEye size={22} color={theme.colors.textSecondary} />
            )}
          </Pressable>
        }
      />

      {error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {errorKey === 'authErrors.emailInUse' && isSignup && (
        <Pressable onPress={() => openView('signin')} hitSlop={8} accessibilityRole="button">
          <Text style={styles.inlineLink}>{t('login.signInInstead')}</Text>
        </Pressable>
      )}
      {info && (
        <Text style={styles.info} accessibilityLiveRegion="polite">
          {info}
        </Text>
      )}

      <View style={styles.submit}>
        <PrimaryButton label={t(isSignup ? 'login.createAccount' : 'login.signIn')} onPress={handleSubmit} loading={loading} />
      </View>

      {!isSignup && (
        <Pressable onPress={handleForgotPassword} style={styles.textButton} hitSlop={8} accessibilityRole="button">
          <Text style={styles.textButtonLabel}>{t('login.forgotPassword')}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => openView(isSignup ? 'signin' : 'signup')}
        style={styles.textButton}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text style={styles.switchText}>{t(isSignup ? 'login.switchToSignin' : 'login.switchToSignup')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  startContainer: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 96, paddingBottom: 40 },
  brandBlock: { alignItems: 'center' },
  icon: { width: 96, height: 96, borderRadius: 22, marginBottom: 20 },
  wordmark: { fontFamily: theme.typography.display, fontSize: theme.type.xxl, color: theme.colors.textPrimary },
  tagline: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.lg,
    lineHeight: 24,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 300,
  },
  actions: { alignItems: 'stretch', gap: 12, marginTop: 40 },
  accountBenefit: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.md,
    lineHeight: 24,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  guestLink: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.accentPurpleDeep },
  legal: { alignItems: 'center', marginTop: 12, gap: 4 },
  legalText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  legalLink: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  formContainer: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', marginBottom: 20 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  formTitle: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  formSubtitle: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, marginTop: 8, marginBottom: 28 },
  eyeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  error: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.dangerEmber, marginBottom: 8 },
  info: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.positiveTeal, marginBottom: 8 },
  inlineLink: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.accentPurpleDeep, textDecorationLine: 'underline', marginBottom: 8 },
  submit: { marginTop: 12, marginBottom: 8 },
  switchText: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textSecondary },
});
