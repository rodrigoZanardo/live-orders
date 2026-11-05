'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { register as signUp } from '@/app/actions';
import { Field, FormMessage, useAction } from './form';
import { useAddressLookup } from './useAddressLookup';

// Mirrors the API rules so the form explains them early; the API is still the authority.
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().min(1),
  password: z.string().min(8),
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/),
  street: z.string().trim().min(1),
  number: z.string().trim().min(1),
  complement: z.string(),
  district: z.string(),
  city: z.string().trim().min(1),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
});
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const t = useTranslations('signup');
  const o = useTranslations('order');
  const v = useTranslations('order.validation');
  const { result, pending, run } = useAction();
  const { register, handleSubmit, setValue, getValues, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      cep: '',
      street: '',
      number: '',
      complement: '',
      district: '',
      city: '',
      state: '',
    },
  });
  const errors = formState.errors;
  const cepLookup = useAddressLookup((address) => {
    setValue('street', address.street, { shouldValidate: true });
    setValue('district', address.district);
    setValue('city', address.city, { shouldValidate: true });
    setValue('state', address.state, { shouldValidate: true });
  });

  const submit = handleSubmit((values) => {
    const { name, email, password, complement, ...address } = values;
    return run(() =>
      signUp({
        name,
        email,
        password,
        address: { ...address, complement: complement.trim() || undefined },
      }),
    );
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={t('name')} error={errors.name && v('customer')}>
        {(props) => <input {...props} {...register('name')} autoComplete="name" />}
      </Field>
      <Field label={t('email')} error={errors.email && v('required')}>
        {(props) => <input {...props} {...register('email')} type="email" autoComplete="email" />}
      </Field>
      <Field
        label={t('password')}
        hint={errors.password ? undefined : t('passwordHint')}
        error={errors.password && t('passwordHint')}
      >
        {(props) => (
          <input {...props} {...register('password')} type="password" autoComplete="new-password" />
        )}
      </Field>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="label">{t('address')}</legend>
        <Field
          label={o('cep')}
          error={errors.cep && v('cep')}
          hint={cepLookup.message ?? undefined}
          className="sm:col-span-3"
        >
          {(props) => (
            <input
              {...props}
              {...register('cep')}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="01001-000"
            />
          )}
        </Field>
        <div className="flex items-end sm:col-span-3">
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => cepLookup.lookup(getValues('cep'))}
            disabled={cepLookup.lookingUp}
          >
            {cepLookup.lookingUp ? o('lookingUp') : o('lookup')}
          </button>
        </div>
        <Field label={o('street')} error={errors.street && v('required')} className="sm:col-span-6">
          {(props) => <input {...props} {...register('street')} />}
        </Field>
        <Field label={o('number')} error={errors.number && v('required')} className="sm:col-span-2">
          {(props) => <input {...props} {...register('number')} />}
        </Field>
        <Field label={t('complement')} className="sm:col-span-4">
          {(props) => <input {...props} {...register('complement')} maxLength={60} />}
        </Field>
        <Field label={o('district')} className="sm:col-span-6">
          {(props) => <input {...props} {...register('district')} />}
        </Field>
        <Field label={o('city')} error={errors.city && v('required')} className="sm:col-span-4">
          {(props) => <input {...props} {...register('city')} />}
        </Field>
        <Field label={o('state')} error={errors.state && v('required')} className="sm:col-span-2">
          {(props) => <input {...props} {...register('state')} maxLength={2} />}
        </Field>
      </fieldset>

      <FormMessage result={result} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
