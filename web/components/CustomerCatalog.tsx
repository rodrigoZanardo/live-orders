'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { createOrder } from '@/app/actions';
import { filterProducts, maxQuantity, orderItems, setQuantity, type Cart } from '@/lib/catalog';
import type { Role, ShopProduct } from '@/lib/types';
import { Field, FormMessage, useAction } from './form';

/**
 * Parts counter: search first, a dense parts list, and the order as a counter ticket. No prices (no payment).
 * Staff see exact quantities; everyone else sees availability only (the server never sends the number).
 * Anyone can fill the ticket; only staff can place the order, and the API checks every limit again.
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
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [name, setName] = useState('');
  const [created, setCreated] = useState<number | null>(null);

  const canOrder = role === 'STAFF' || role === 'ADMIN';
  const shown = filterProducts(products, search);
  const items = orderItems(products, cart);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const nameLength = name.trim().length;
  const disabled = !canOrder || pending || items.length === 0 || nameLength < 1 || nameLength > 80;
  const change = (product: ShopProduct, quantity: number) => {
    setCreated(null);
    setCart((current) => setQuantity(current, product, quantity));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter in the name field submits the form too; it must not bypass the disabled button
    if (disabled) return;
    setCreated(null);
    const outcome = await run(() => createOrder({ customerName: name.trim(), items }));
    if (outcome?.number) {
      setCreated(outcome.number);
      setName('');
      setCart({});
    }
  };

  return (
    <>
      {/* the search is the hero: at a parts counter the first thing is "which part?" */}
      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <h1 className="font-display text-4xl leading-none font-extrabold sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-prose text-muted">{t('subtitle')}</p>
          <label htmlFor="part-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <div className="relative mt-6">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="part-search"
              type="search"
              autoComplete="off"
              className="input h-14 pl-13 text-lg"
              placeholder={t('search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <p aria-live="polite" className="mt-2 text-sm text-muted">
            {t('results', { count: shown.length })}
          </p>
        </div>
      </section>

      {/* room under the list for the phone bar below, so it never covers the last row */}
      <div
        className={`mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_22rem] lg:items-start lg:pb-8 ${units > 0 ? 'pb-24' : ''}`}
      >
        <section aria-label={t('parts')}>
          {products.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('empty')}</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('noMatch')}</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {shown.map((product) => (
                <PartRow
                  key={product.sku}
                  product={product}
                  quantity={cart[product.sku] ?? 0}
                  onChange={(quantity) => change(product, quantity)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside
          id="ticket"
          aria-labelledby="ticket-heading"
          className="scroll-mt-20 lg:sticky lg:top-20"
        >
          <form onSubmit={submit} className="ticket space-y-4 px-5 pt-7 pb-5" noValidate>
            <h2
              id="ticket-heading"
              className="flex items-baseline justify-between font-display text-2xl font-extrabold"
            >
              {t('cart')}
              <span className="font-sans text-sm font-semibold text-muted">
                {t('units', { count: units })}
              </span>
            </h2>

            {items.length === 0 ? (
              <p className="border-y border-dashed border-ink/25 py-6 text-sm text-muted">
                {t('cartEmpty')}
              </p>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/25 border-y border-dashed border-ink/25">
                {items.map((item) => {
                  const product = products.find((p) => p.sku === item.sku);
                  if (!product) return null;
                  return (
                    <li key={item.sku} className="ticket-enter flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted">
                          {item.sku} ·{' '}
                          <button
                            type="button"
                            className="underline hover:text-danger"
                            onClick={() => change(product, 0)}
                          >
                            {t('remove')}
                          </button>
                        </p>
                      </div>
                      <Stepper
                        product={product}
                        quantity={item.quantity}
                        onChange={(quantity) => change(product, quantity)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            {canOrder ? (
              <>
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
                <button
                  type="submit"
                  className="btn-primary h-12 w-full text-base"
                  disabled={disabled}
                >
                  {pending ? t('submitting') : t('submit')}
                </button>
              </>
            ) : (
              <p className="text-sm">
                {role === null ? (
                  <>
                    {t('signIn')}{' '}
                    <Link href="/login" className="font-semibold text-brand underline">
                      {t('signInLink')}
                    </Link>
                  </>
                ) : (
                  t('staffOnly')
                )}
              </p>
            )}
          </form>
        </aside>
      </div>

      {/* phones: the ticket sits below the list, so a bar jumps to it */}
      {units > 0 && (
        <a href="#ticket" className="btn-primary fixed inset-x-4 bottom-4 z-10 h-12 lg:hidden">
          {t('viewCart', { count: units })}
        </a>
      )}
    </>
  );
}

function PartRow({
  product,
  quantity,
  onChange,
}: {
  product: ShopProduct;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const t = useTranslations('catalog');
  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_1fr_auto_10rem]">
      <span className="part-tag">{product.sku}</span>
      <h3 className="text-lg font-semibold">{product.name}</h3>
      <p
        className={`col-start-2 flex items-center gap-2 text-sm sm:col-start-auto ${product.inStock ? 'text-success' : 'text-danger'}`}
      >
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {!product.inStock
          ? t('outOfStock')
          : product.quantity === undefined
            ? t('inStock')
            : t('available', { count: product.quantity })}
      </p>
      <div className="col-span-2 sm:col-span-1">
        {quantity > 0 ? (
          <Stepper product={product} quantity={quantity} onChange={onChange} wide />
        ) : (
          <button
            type="button"
            className={product.inStock ? 'btn-primary w-full' : 'btn-secondary w-full'}
            disabled={!product.inStock}
            onClick={() => onChange(1)}
          >
            {product.inStock ? t('add') : t('outOfStock')}
          </button>
        )}
      </div>
    </li>
  );
}

function Stepper({
  product,
  quantity,
  onChange,
  wide = false,
}: {
  product: ShopProduct;
  quantity: number;
  onChange: (quantity: number) => void;
  wide?: boolean;
}) {
  const t = useTranslations('catalog');
  return (
    <div
      role="group"
      aria-label={t('quantityOf', { name: product.name })}
      className={`flex items-center rounded-md border border-line bg-panel ${wide ? 'w-full justify-between' : ''}`}
    >
      <button
        type="button"
        className="btn px-3"
        aria-label={t('decrease')}
        onClick={() => onChange(quantity - 1)}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={maxQuantity(product)}
        aria-label={t('quantityOf', { name: product.name })}
        className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums"
        value={quantity}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button
        type="button"
        className="btn px-3"
        aria-label={t('increase')}
        disabled={quantity >= maxQuantity(product)}
        onClick={() => onChange(quantity + 1)}
      >
        +
      </button>
    </div>
  );
}
