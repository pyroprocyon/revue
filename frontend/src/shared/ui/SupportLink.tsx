import type { ReactNode } from 'react';
import { textLink } from './buttonStyles';

const SUPPORT_EMAIL = 'revuetayo@gmail.com';

export function SupportLink({ children = SUPPORT_EMAIL, className = '' }: { children?: ReactNode; className?: string }) {
  return <a href={`mailto:${SUPPORT_EMAIL}`} className={`${textLink} wrap-anywhere ${className}`}>{children}</a>;
}
