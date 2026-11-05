import { RegisterCustomerUseCase } from '../src/application/auth.use-cases';
import { AppError } from '../src/domain/errors';
import { Order } from '../src/domain/order';
import { User, type CustomerProfile } from '../src/domain/user';
import {
  CUSTOMER_PROFILE as PROFILE,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryUserRepository,
} from './fakes';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return undefined;
}

const customer = (profile: CustomerProfile) =>
  User.create({ id: 'c1', email: 'ana@example.com', passwordHash: 'h', role: 'CUSTOMER', profile });

describe('customer profile', () => {
  it('normalizes the name and address like an order delivery', () => {
    expect(customer(PROFILE).profile).toEqual({
      name: 'Ana Souza',
      address: {
        cep: '01001000',
        street: 'Praça da Sé',
        number: '100',
        complement: 'apto 12',
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      },
    });
  });

  it('refuses an empty name, a bad CEP and an address without street, number, city or state', () => {
    expect(codeOf(() => customer({ ...PROFILE, name: '  ' }))).toBe('CUSTOMER_NAME_INVALID');
    const address = (changes: Partial<CustomerProfile['address']>) =>
      customer({ ...PROFILE, address: { ...PROFILE.address, ...changes } });
    expect(codeOf(() => address({ cep: '123' }))).toBe('CEP_INVALID');
    for (const field of ['street', 'number', 'city'] as const) {
      expect(codeOf(() => address({ [field]: ' ' }))).toBe('ADDRESS_INCOMPLETE');
    }
    expect(codeOf(() => address({ state: 'S' }))).toBe('ADDRESS_INCOMPLETE');
  });
});

describe('RegisterCustomerUseCase', () => {
  let users: InMemoryUserRepository;
  let register: RegisterCustomerUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    register = new RegisterCustomerUseCase(users, new FakePasswordHasher(), new FakeTokenService());
  });

  it('creates a CUSTOMER with the profile and signs them in', async () => {
    const { token, user } = await register.execute({
      email: 'Ana@Example.com',
      password: 'long-enough',
      profile: PROFILE,
    });
    expect(user).toMatchObject({ email: 'ana@example.com', role: 'CUSTOMER' });
    expect(await new FakeTokenService().verify(token)).toEqual(user);
    expect((await users.findById(user.id))?.profile?.name).toBe('Ana Souza');
  });

  it('refuses a short password and a taken email', async () => {
    await expect(
      register.execute({ email: 'ana@example.com', password: 'short', profile: PROFILE }),
    ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    await register.execute({ email: 'ana@example.com', password: 'long-enough', profile: PROFILE });
    await expect(
      register.execute({ email: 'ANA@example.com', password: 'long-enough', profile: PROFILE }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});

describe('Order.canBeCancelledBy', () => {
  const order = Order.create({
    id: 'o1',
    number: 1,
    customerName: 'Ana',
    channel: 'COUNTER',
    items: [{ sku: 'A', name: 'A', quantity: 1 }],
    customerId: 'c1',
    now: new Date(),
  });

  it('lets only the owner cancel, and only while RECEIVED', () => {
    expect(order.canBeCancelledBy('c1')).toBe(true);
    expect(order.canBeCancelledBy('c2')).toBe(false);
    order.moveTo('PREPARING', 1, new Date());
    expect(order.canBeCancelledBy('c1')).toBe(false);
  });
});
