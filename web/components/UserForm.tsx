'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createUser } from '@/app/actions';
import { ROLES } from '@/lib/types';
import { Field, FormMessage, useAction } from './form';

const schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});
type Values = z.infer<typeof schema>;

export function UserForm() {
  const t = useTranslations('users');
  const roles = useTranslations('roles');
  const errors = useTranslations('errors');
  const { result, pending, run } = useAction();
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', role: 'STAFF' },
  });

  const submit = handleSubmit(async (values) => {
    if (await run(() => createUser(values))) reset();
  });

  return (
    <form
      onSubmit={submit}
      className="panel grid gap-3 p-4 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-start"
      noValidate
    >
      <Field label={t('email')} error={formState.errors.email && errors('EMAIL_INVALID')}>
        {(props) => <input {...props} {...register('email')} type="email" autoComplete="off" />}
      </Field>
      <Field
        label={t('password')}
        error={formState.errors.password && errors('PASSWORD_TOO_SHORT', { min: 8 })}
      >
        {(props) => (
          <input {...props} {...register('password')} type="password" autoComplete="new-password" />
        )}
      </Field>
      <Field label={t('role')}>
        {(props) => (
          <select {...props} {...register('role')}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roles(role)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <button type="submit" className="btn-primary sm:mt-6" disabled={pending}>
        {pending ? t('adding') : t('add')}
      </button>
      <div className="sm:col-span-4">
        <FormMessage result={result} success={t('created')} />
      </div>
    </form>
  );
}
