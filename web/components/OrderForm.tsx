'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { createOrder } from '@/app/actions';
import { Field, FormMessage, useAction } from './form';
import { useAddressLookup } from './useAddressLookup';

// Mirrors the domain limits so the form explains them early; the API is still the authority.
const schema = z
  .object({
    customerName: z.string().trim().min(1).max(80),
    items: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(32),
          name: z.string().trim().min(1).max(80),
          quantity: z.coerce.number<number>().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(30),
    withDelivery: z.boolean(),
    cep: z.string(),
    street: z.string(),
    number: z.string(),
    district: z.string(),
    city: z.string(),
    state: z.string().max(2),
  })
  .superRefine((values, context) => {
    if (!values.withDelivery) return;
    if (!/^\d{5}-?\d{3}$/.test(values.cep.trim())) {
      context.addIssue({ code: 'custom', path: ['cep'], message: 'cep' });
    }
    for (const field of ['street', 'number', 'city', 'state'] as const) {
      if (!values[field].trim())
        context.addIssue({ code: 'custom', path: [field], message: 'required' });
    }
  });

type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  customerName: '',
  items: [{ sku: '', name: '', quantity: 1 }],
  withDelivery: false,
  cep: '',
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
};

export function OrderForm() {
  const t = useTranslations('order');
  const v = useTranslations('order.validation');
  const { result, pending, run } = useAction();
  const [created, setCreated] = useState<number | null>(null);
  const { register, control, handleSubmit, watch, setValue, getValues, reset, formState } =
    useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: EMPTY,
    });
  const items = useFieldArray({ control, name: 'items' });
  const errors = formState.errors;
  const withDelivery = watch('withDelivery');

  const cepLookup = useAddressLookup((address) => {
    setValue('street', address.street, { shouldValidate: true });
    setValue('district', address.district);
    setValue('city', address.city, { shouldValidate: true });
    setValue('state', address.state, { shouldValidate: true });
  });

  const submit = handleSubmit(async (values) => {
    setCreated(null);
    const outcome = await run(() =>
      createOrder({
        customerName: values.customerName,
        items: values.items,
        delivery: values.withDelivery
          ? {
              cep: values.cep,
              street: values.street,
              number: values.number,
              district: values.district,
              city: values.city,
              state: values.state,
            }
          : undefined,
      }),
    );
    if (outcome?.number) {
      setCreated(outcome.number);
      reset(EMPTY);
    }
  });

  return (
    <form onSubmit={submit} className="panel max-w-3xl space-y-6 p-4 sm:p-6" noValidate>
      <Field label={t('customer')} error={errors.customerName && v('customer')}>
        {(props) => <input {...props} {...register('customerName')} autoComplete="off" />}
      </Field>

      <fieldset className="space-y-3">
        <legend className="label">{t('items')}</legend>
        {items.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[8rem_1fr_5rem_auto]"
          >
            <Field label={t('sku')} error={errors.items?.[index]?.sku && v('sku')}>
              {(props) => <input {...props} {...register(`items.${index}.sku`)} />}
            </Field>
            <Field
              label={t('itemName')}
              error={errors.items?.[index]?.name && v('itemName')}
              className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
            >
              {(props) => <input {...props} {...register(`items.${index}.name`)} />}
            </Field>
            <Field label={t('quantity')} error={errors.items?.[index]?.quantity && v('quantity')}>
              {(props) => (
                <input
                  {...props}
                  {...register(`items.${index}.quantity`)}
                  type="number"
                  min={1}
                  max={99}
                />
              )}
            </Field>
            <button
              type="button"
              className="btn-secondary col-span-2 self-end sm:col-span-1"
              onClick={() => items.remove(index)}
              disabled={items.fields.length === 1}
              aria-label={t('removeItem', { index: index + 1 })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => items.append({ sku: '', name: '', quantity: 1 })}
          disabled={items.fields.length >= 30}
        >
          + {t('addItem')}
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...register('withDelivery')} className="size-4 accent-brand" />
          {t('withDelivery')}
        </label>
        {withDelivery && (
          <div className="grid gap-3 sm:grid-cols-6">
            <Field
              label={t('cep')}
              error={errors.cep && v('cep')}
              hint={cepLookup.message ?? undefined}
              className="sm:col-span-2"
            >
              {(props) => (
                <input
                  {...props}
                  {...register('cep')}
                  inputMode="numeric"
                  placeholder="01001-000"
                />
              )}
            </Field>
            <div className="flex items-end sm:col-span-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => cepLookup.lookup(getValues('cep'))}
                disabled={cepLookup.lookingUp}
              >
                {cepLookup.lookingUp ? t('lookingUp') : t('lookup')}
              </button>
            </div>
            <Field
              label={t('street')}
              error={errors.street && v('required')}
              className="sm:col-span-4"
            >
              {(props) => <input {...props} {...register('street')} />}
            </Field>
            <Field
              label={t('number')}
              error={errors.number && v('required')}
              className="sm:col-span-2"
            >
              {(props) => <input {...props} {...register('number')} />}
            </Field>
            <Field label={t('district')} className="sm:col-span-2">
              {(props) => <input {...props} {...register('district')} />}
            </Field>
            <Field label={t('city')} error={errors.city && v('required')} className="sm:col-span-3">
              {(props) => <input {...props} {...register('city')} />}
            </Field>
            <Field label={t('state')} error={errors.state && v('required')}>
              {(props) => <input {...props} {...register('state')} maxLength={2} />}
            </Field>
          </div>
        )}
      </fieldset>

      <FormMessage
        result={result}
        success={created ? t('created', { number: created }) : undefined}
      />
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
