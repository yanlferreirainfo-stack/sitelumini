import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, safeEqual } from '@/lib/crypto';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { accessEmail, maskSecret } from '@/lib/delivery/messages';

describe('crypto', () => {
  const key = randomBytes(32).toString('base64');
  it('cifra e decifra (AES-256-GCM)', () => {
    const enc = encryptSecret('senhaSecreta1', key);
    expect(enc).not.toContain('senhaSecreta1');
    expect(decryptSecret(enc, key)).toBe('senhaSecreta1');
  });
  it('detecta adulteração e chave errada', () => {
    const enc = encryptSecret('abc', key);
    const parts = enc.split('.');
    parts[3] = Buffer.from('xyz').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString('base64'))).toThrow();
  });
  it('compara segredos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('telefone', () => {
  it('normaliza para E.164 sem +', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('5511999998888');
    expect(normalizePhone('+55 21 3333-4444')).toBe('552133334444');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it('formata para exibição', () => {
    expect(formatPhone('5511999998888')).toBe('+55 (11) 99999-8888');
  });
});

describe('mensagens', () => {
  it('escapa HTML no e-mail', () => {
    const m = accessEmail({ customerName: '<b>Zé</b>', username: 'u', password: 'p&1', expiresAt: null, productName: null, serverUrl: null });
    expect(m.html).not.toContain('<b>Zé</b>');
    expect(m.html).toContain('p&#38;1');
  });
  it('mascara senha em logs', () => {
    expect(maskSecret('Ab3dEf9h')).toBe('Ab******');
  });
});
