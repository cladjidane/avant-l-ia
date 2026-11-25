// Vérifications des numéros français et bancaires (clés de contrôle).

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

// Clé de Luhn, utilisée par les SIREN et SIRET.
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function sirenValid(value: string): boolean {
  const d = digitsOnly(value);
  return d.length === 9 && luhnValid(d);
}

export function siretValid(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 14) return false;
  if (luhnValid(d)) return true;
  // Exception connue : les établissements de La Poste (SIREN 356000000).
  if (d.startsWith('356000000')) {
    const sum = d.split('').reduce((acc, c) => acc + Number(c), 0);
    return sum % 5 === 0;
  }
  return false;
}

// Reste de la division par 97 d'un grand nombre écrit en chiffres.
function mod97(digits: string): number {
  let rest = 0;
  for (const c of digits) rest = (rest * 10 + Number(c)) % 97;
  return rest;
}

// IBAN : on déplace les quatre premiers caractères à la fin, on remplace
// les lettres par des nombres (A = 10), et le reste par 97 doit valoir 1.
export function ibanValid(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('FR') && iban.length !== 27) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const numeric = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return mod97(numeric) === 1;
}

// Numéro de sécurité sociale (NIR) sur 15 caractères avec sa clé.
export function nirValid(value: string): boolean {
  const raw = value.replace(/\s/g, '').toUpperCase();
  if (!/^[1278]\d{4}(\d{2}|2A|2B)\d{6}\d{2}$/.test(raw)) return false;
  const body = raw.slice(0, 13).replace('2A', '19').replace('2B', '18');
  const key = Number(raw.slice(13));
  return 97 - mod97(body) === key;
}

// Numéro de TVA intracommunautaire français : FR + clé + SIREN.
export function vatValid(value: string): boolean {
  const raw = value.replace(/\s/g, '').toUpperCase();
  const match = /^FR([0-9A-HJ-NP-Z]{2})(\d{9})$/.exec(raw);
  if (!match) return false;
  const [, key, siren] = match;
  if (!/^\d{2}$/.test(key)) return true; // ancien format à lettres, pas de calcul simple
  return (12 + 3 * (Number(siren) % 97)) % 97 === Number(key);
}

export function dateValid(day: number, month: number, year?: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year !== undefined && (year < 1900 || year > 2100)) return false;
  return true;
}
