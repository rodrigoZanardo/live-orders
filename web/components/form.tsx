'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/app/actions';
import type { ApiFailure } from '@/lib/types';

type ControlProps = {
  id: string;
  className: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
};

/** Label, control, hint and error wired together for screen readers. The child renders the control. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({
        id,
        className: 'input',
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type Result = { error?: ApiFailure; ok?: boolean };

/**
 * Runs a server action inside a transition and keeps its result for FormMessage.
 * router.refresh only applies inside a transition (see docs/HANDOFF.md), so it runs here on success.
 */
export function useAction() {
  const [result, setResult] = useState<Result>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = <T extends ActionResult>(action: () => Promise<T>): Promise<T | null> =>
    new Promise((resolve, reject) => {
      setResult({});
      start(async () => {
        try {
          const outcome = await action();
          setResult(outcome.error ? { error: outcome.error } : { ok: true });
          if (!outcome.error) router.refresh();
          resolve(outcome.error ? null : outcome);
        } catch (error) {
          reject(error);
        }
      });
    });

  return { result, pending, run };
}

/** Translates an API error code; an unknown code falls back to the generic text, never to raw English. */
export function useErrorText() {
  const t = useTranslations('errors');
  return (error: ApiFailure) =>
    error.code && t.has(error.code) ? t(error.code, error.params) : t('UNKNOWN');
}

export function FormMessage({ result, success }: { result: Result; success?: string }) {
  const errorText = useErrorText();
  let content: ReactNode = null;
  if (result.error) {
    content = (
      <p role="alert" className="text-sm text-danger">
        {errorText(result.error)}
      </p>
    );
  } else if (result.ok && success) {
    content = <p className="text-sm text-success">{success}</p>;
  }
  // the live region stays mounted: screen readers only announce text that changes inside an existing region
  return <div aria-live="polite">{content}</div>;
}
