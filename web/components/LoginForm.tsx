'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { login } from '@/app/actions';
import { Field, FormMessage, useAction } from './form';

const schema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
type Values = z.infer<typeof schema>;

export function LoginForm({ demo }: { demo?: { email: string; password: string } }) {
  const t = useTranslations('login');
  const required = useTranslations('order.validation')('required');
  const { result, pending, run } = useAction();
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: demo ?? { email: '', password: '' },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => run(() => login(values)))}
      className="space-y-4"
      noValidate
    >
      <Field label={t('email')} error={formState.errors.email && required}>
        {(props) => (
          <input {...props} {...register('email')} type="email" autoComplete="username" />
        )}
      </Field>
      <Field label={t('password')} error={formState.errors.password && required}>
        {(props) => (
          <input
            {...props}
            {...register('password')}
            type="password"
            autoComplete="current-password"
          />
        )}
      </Field>
      <FormMessage result={result} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
      {demo && <p className="text-center text-xs text-muted">{t('demo', demo)}</p>}
    </form>
  );
}
