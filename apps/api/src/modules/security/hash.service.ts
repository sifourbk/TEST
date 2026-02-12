import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * HMAC-based hashing for sensitive identifiers.
 *
 * We never store raw driving license or vehicle registration numbers.
 */
@Injectable()
export class HashService {
  private pepper(): string {
    const p = process.env.HASH_PEPPER;
    if (!p) throw new Error('HASH_PEPPER is required');
    return p;
  }

  normalize(input: string): string {
    return input
      .trim()
      .toUpperCase()
      .replace(/[\s\-_.]/g, '');
  }

  hmacSha256(input: string): string {
    const normalized = this.normalize(input);
    return createHmac('sha256', this.pepper()).update(normalized).digest('hex');
  }
}
