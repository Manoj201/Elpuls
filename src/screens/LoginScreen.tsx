import { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
// @firebase/auth directly, not firebase/auth — see src/lib/firebase.ts.
import { EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword } from '@firebase/auth';
import { IconBolt, IconCalculator, IconCloud } from '@tabler/icons-react-native';
import { auth } from '../lib/firebase';
import { ensureAnonymousSignIn } from '../lib/auth';
import { theme } from '../theme';
import { Chip } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { PrimaryButton } from '../components/PrimaryButton';

interface LoginScreenProps {
  onSignedIn: (uid: string) => void;
  onSkip: () => void;
}

type Mode = 'signup' | 'signin';

const TRUST_ROWS: { icon: typeof IconBolt; titleKey: string; subtitleKey: string }[] = [
  { icon: IconBolt, titleKey: 'login.trust.priceTitle', subtitleKey: 'login.trust.priceSubtitle' },
  { icon: IconCloud, titleKey: 'login.trust.aiTitle', subtitleKey: 'login.trust.aiSubtitle' },
  { icon: IconCalculator, titleKey: 'login.trust.costCheckTitle', subtitleKey: 'login.trust.costCheckSubtitle' },
];

export function LoginScreen({ onSignedIn, onSkip }: LoginScreenProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Entrance animation for the marketing/trust content only — the form
  // below stays static so it doesn't delay or distract from actually
  // signing in.
  const introAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const introStyle = {
    opacity: introAnim,
    transform: [
      {
        translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
      },
    ],
  };

  async function handleSubmit() {
    if (!email || !password) {
      setError(t('login.missingFields'));
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        await ensureAnonymousSignIn();
        const credential = EmailAuthProvider.credential(email, password);
        const result = await linkWithCredential(auth.currentUser!, credential);
        onSignedIn(result.user.uid);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        onSignedIn(result.user.uid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Animated.View style={[styles.introSection, introStyle]}>
          <Image source={require('../../assets/icon.png')} style={styles.iconMark} />
          <Text style={styles.wordmark}>Elpuls</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
          <Text style={styles.description}>{t('login.description')}</Text>

          <View style={styles.trustList}>
            {TRUST_ROWS.map(({ icon, titleKey, subtitleKey }, i) => (
              <View key={titleKey} style={i > 0 ? styles.trustRowDivider : undefined}>
                <InfoRow icon={icon} variant="amber" title={t(titleKey)} subtitle={t(subtitleKey)} />
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.modeToggle}>
          <Chip
            label={t('login.createAccount')}
            selected={mode === 'signup'}
            onPress={() => setMode('signup')}
            style={styles.modeChip}
          />
          <Chip
            label={t('login.signIn')}
            selected={mode === 'signin'}
            onPress={() => setMode('signin')}
            style={styles.modeChip}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder={t('login.emailPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('login.passwordPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={theme.colors.accentPurple} style={styles.loading} />
        ) : (
          <PrimaryButton label={mode === 'signup' ? t('login.createAccount') : t('login.signIn')} onPress={handleSubmit} />
        )}

        <Pressable onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>{t('login.continueWithoutAccount')}</Text>
        </Pressable>

        <Text style={styles.legal}>{t('login.legal')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingVertical: 40,
  },
  card: { width: '100%', maxWidth: 360, alignItems: 'center' },
  introSection: { alignItems: 'center', alignSelf: 'stretch' },
  iconMark: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
    marginBottom: 14,
  },
  wordmark: { fontFamily: theme.typography.display, fontSize: 22, color: theme.colors.textPrimary },
  tagline: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  description: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 19,
  },
  trustList: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  trustRowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
    marginTop: 14,
    paddingTop: 14,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  error: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.dangerEmber, marginBottom: 10 },
  loading: { marginVertical: 14 },
  skipButton: { marginTop: 20 },
  skipText: { fontFamily: theme.typography.bodyMedium, fontSize: 14, color: theme.colors.textPrimary },
  legal: {
    fontFamily: theme.typography.body,
    fontSize: 10.5,
    color: theme.colors.textFaint,
    marginTop: 24,
    textAlign: 'center',
  },
});
