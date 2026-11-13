import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { theme } from '../theme';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language as SupportedLanguage;

  return (
    <View style={styles.row}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <Pressable key={lang} onPress={() => setLanguage(lang)} style={styles.item}>
          <Text style={[styles.label, lang === current && styles.labelActive]}>
            {lang.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  item: { paddingVertical: 4, paddingHorizontal: 6 },
  label: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textFaint },
  labelActive: { color: theme.colors.textPrimary },
});
