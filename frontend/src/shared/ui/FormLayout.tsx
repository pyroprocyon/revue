import type { ReactNode } from 'react';
import { PageLayout } from './PageLayout';

type FormLayoutProps = {
  top: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/** Keep fields and submit feedback together in the document, including with the keyboard open. */
export function FormLayout({ top, footer, children }: Readonly<FormLayoutProps>) {
  return (
    <PageLayout top={top}>
      <section className="mx-auto w-full max-w-[28rem] py-4 sm:py-10 lg:py-14">
        <div className="rounded-card bg-surface px-compact-gutter py-4 shadow-card sm:p-8">{children}</div>
        {footer && <div className="mt-2 flex flex-wrap justify-center">{footer}</div>}
      </section>
    </PageLayout>
  );
}
