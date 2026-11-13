import { Button, type ButtonProps } from './Button';

/** Outlined button for secondary actions. Use `size="compact"` inside cards. */
export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} variant="secondary" />;
}
