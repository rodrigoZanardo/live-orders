'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { createOrder } from '@/app/actions';
import { exceedsLimit, maxQuantity, orderItems } from '@/lib/catalog';
import type { Role, ShopProduct } from '@/lib/types';
import { Field, FormMessage, useAction } from './form';

/**
 * Products to pick. Staff see exact quantities; everyone else sees availability only (the server
 * never sends the number). Only staff can place the order; the API checks every limit again.
 */
export function CustomerCatalog({
  products,
  role,
}: {
  products: ShopProduct[];
  role: Role | null;
}) {
  const t = useTranslations('catalog');
  const v = useTranslations('order.validation');
  const { result, pending, run } = useAction();
  const [name, setName] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<number | null>(null);

  const canOrder = role === 'STAFF' || role === 'ADMIN';
  const stockText = (product: ShopProduct) => {
    if (!product.inStock) return t('outOfStock');
    return product.quantity === undefined
      ? t('inStock')
      : t('available', { count: product.quantity });
  };
  const items = orderItems(products, typed);
  const tooMany = products.some((product) => exceedsLimit(product, typed[product.sku]));
  const nameLength = name.trim().length;
  const disabled =
    !canOrder || pending || items.length === 0 || tooMany || nameLength < 1 || nameLength > 80;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter in a quantity field submits the form too; it must not bypass the disabled button
    if (disabled) return;
    setCreated(null);
    const outcome = await run(() => createOrder({ customerName: name.trim(), items }));
    if (outcome?.number) {
      setCreated(outcome.number);
      setName('');
      setTyped({});
    }
  };

  return (
    <form onSubmit={submit} className="panel space-y-6 p-4 sm:p-6" noValidate>
      {products.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="label">{t('products')}</legend>
          {products.map((product) => {
            return (
              <Field
                key={product.sku}
                label={product.name}
                hint={stockText(product)}
                error={
                  exceedsLimit(product, typed[product.sku])
                    ? t('upTo', { max: maxQuantity(product) })
                    : undefined
                }
              >
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={maxQuantity(product)}
                    step={1}
                    disabled={!product.inStock}
                    value={typed[product.sku] ?? ''}
                    placeholder="0"
                    onChange={(event) => {
                      const value = event.target.value;
                      setTyped((current) => ({ ...current, [product.sku]: value }));
                    }}
                  />
                )}
              </Field>
            );
          })}
        </fieldset>
      )}

      {canOrder ? (
        <>
          {products.length > 0 && items.length === 0 && (
            <p className="text-sm text-muted">{t('pick')}</p>
          )}
          <Field
            label={t('yourName')}
            hint={nameLength > 80 ? undefined : v('customer')}
            error={nameLength > 80 ? v('customer') : undefined}
          >
            {(props) => (
              <input
                {...props}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
          <FormMessage
            result={result}
            success={created ? t('created', { number: created }) : undefined}
          />
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={disabled}>
            {pending ? t('submitting') : t('submit')}
          </button>
        </>
      ) : (
        <p className="text-sm">
          {role === null ? (
            <>
              {t('signIn')}{' '}
              <Link href="/login" className="text-brand underline">
                {t('signInLink')}
              </Link>
            </>
          ) : (
            t('staffOnly')
          )}
        </p>
      )}
    </form>
  );
}
