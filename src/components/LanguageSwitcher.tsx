import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setLanguage, type SupportedLanguage } from '../i18n';
import { OptionCard } from './OptionCard';

// Swedish first: it's the app's main language.
const ORDER: SupportedLanguage[] = ['sv', 'en'];

// Each language is written in its own language, so someone who can't read
// the current one still finds theirs.
const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  sv: 'Svenska',
  en: 'English',
};

/** Language choice as large, tappable cards with a check mark. Changes apply right away. */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language as SupportedLanguage;

  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {ORDER.map((lang) => (
        <OptionCard key={lang} label={LANGUAGE_NAMES[lang]} selected={lang === current} onPress={() => setLanguage(lang)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
});
