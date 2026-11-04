export type FoundAddress = { street: string; district: string; city: string; state: string };

/** `found: false` covers both an unknown CEP and a lookup service that is down or slow. */
export type AddressResult = { found: true; address: FoundAddress } | { found: false };

/** Port: completes an address from a Brazilian CEP (ViaCEP in production). */
export abstract class AddressLookup {
  abstract lookup(cep: string): Promise<AddressResult>;
}
