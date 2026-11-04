import { Injectable, Logger } from '@nestjs/common';
import { AddressLookup, type AddressResult } from '../application/address-lookup';

export const VIACEP_TIMEOUT_MS = 3000;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** https://viacep.com.br: free, no key. `{ "erro": true }` means unknown CEP; timeouts and 5xx mean unavailable. */
@Injectable()
export class ViaCepClient extends AddressLookup {
  private readonly logger = new Logger(ViaCepClient.name);

  constructor(private readonly baseUrl = 'https://viacep.com.br/ws') {
    super();
  }

  async lookup(cep: string): Promise<AddressResult> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      return { found: false };
    }

    try {
      const response = await fetch(`${this.baseUrl}/${digits}/json/`, {
        signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`ViaCEP answered ${response.status} for ${digits}`);
        return { found: false };
      }
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null || 'erro' in body) {
        return { found: false };
      }
      return {
        found: true,
        address: {
          street: 'logradouro' in body ? text(body.logradouro) : '',
          district: 'bairro' in body ? text(body.bairro) : '',
          city: 'localidade' in body ? text(body.localidade) : '',
          state: 'uf' in body ? text(body.uf) : '',
        },
      };
    } catch (error) {
      this.logger.warn(`ViaCEP unavailable for ${digits}: ${String(error)}`);
      return { found: false };
    }
  }
}
