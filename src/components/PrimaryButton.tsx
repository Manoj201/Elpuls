import { Button, type ButtonProps } from './Button';

/** Filled brand button. Use `size="large"` (default) for a screen's one main action, `size="compact"` inside cards. */
export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} variant="primary" />;
}
