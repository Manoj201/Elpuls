import { Pressable } from 'react-native';
import { IconLock } from '@tabler/icons-react-native';
import { useUiStore } from '../stores/useUiStore';
import { Card } from './Card';
import { InfoRow } from './InfoRow';

interface ProLockedCardProps {
  title: string;
  subtitle: string;
}

/** Teaser shown in place of a Pro feature's real content when the user isn't subscribed — tapping opens the paywall. */
export function ProLockedCard({ title, subtitle }: ProLockedCardProps) {
  const showPaywall = useUiStore((s) => s.showPaywall);

  return (
    <Pressable onPress={showPaywall}>
      <Card>
        <InfoRow icon={IconLock} variant="amber" title={title} subtitle={subtitle} />
      </Card>
    </Pressable>
  );
}
