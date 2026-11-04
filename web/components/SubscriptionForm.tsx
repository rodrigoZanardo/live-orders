'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createSubscription, deleteSubscription } from '@/app/actions';
import { Field, FormMessage, useAction } from './form';

export function SubscriptionForm() {
  const t = useTranslations('webhooks');
  const { result, pending, run } = useAction();
  const [url, setUrl] = useState('');
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreated(null);
    const outcome = await run(() => createSubscription(url));
    if (outcome?.secret && outcome.url) {
      setCreated({ url: outcome.url, secret: outcome.secret });
      setUrl('');
    }
  };

  return (
    <form onSubmit={submit} className="panel space-y-3 p-4" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t('url')} className="flex-1">
          {(props) => (
            <input
              {...props}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hooks"
              required
            />
          )}
        </Field>
        <button type="submit" className="btn-primary" disabled={pending || !url.trim()}>
          {pending ? t('adding') : t('add')}
        </button>
      </div>
      <FormMessage result={result} />
      {created && (
        <div role="status" className="rounded-md bg-warning-subtle p-3 text-sm">
          <p className="font-semibold text-warning">{t('secret', { url: created.url })}</p>
          <code className="mt-1 block break-all font-mono text-ink select-all">
            {created.secret}
          </code>
        </div>
      )}
    </form>
  );
}

export function DeleteSubscriptionButton({ id, url }: { id: string; url: string }) {
  const t = useTranslations('webhooks');
  const { result, pending, run } = useAction();
  return (
    <div>
      <button
        type="button"
        className="btn-danger py-1 text-xs"
        disabled={pending}
        aria-label={t('removeLabel', { url })}
        onClick={() => {
          if (window.confirm(t('confirmRemove'))) void run(() => deleteSubscription(id));
        }}
      >
        {t('remove')}
      </button>
      <FormMessage result={result} />
    </div>
  );
}
