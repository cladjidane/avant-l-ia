import type { Category, Span } from '../detect/types';

// Titres de colonnes qui annoncent une donnée personnelle : toute la
// colonne est masquée, même un nom seul que les règles ne reconnaîtraient pas.
export const COLUMN_HINTS: Array<[RegExp, Category]> = [
  [/^(nom|prénom|prenom|nom et prénom|nom complet|client|cliente|contact|interlocuteur|responsable|gérant|gerant|salarié|salarie|employé|employe|patient|patiente|élève|eleve|adhérent|adherent|bénéficiaire|beneficiaire|destinataire|signataire)s?\b/i, 'PERSONNE'],
  [/^(société|societe|entreprise|raison sociale|fournisseur|employeur)s?\b/i, 'ENTREPRISE'],
  [/^(adresse|rue|domicile)s?\b/i, 'ADRESSE'],
  [/^(ville|commune|localité|localite)s?\b/i, 'LIEU'],
];


// Fichier .csv : même principe, chaque cellule sous un titre « Nom »,
// « Client », « Adresse »... est masquée en entier.
export function csvColumnSpans(text: string): Span[] {
  const lines: Array<{ start: number; line: string }> = [];
  let pos = 0;
  for (const line of text.split('\n')) {
    lines.push({ start: pos, line: line.replace(/\r$/, '') });
    pos += line.length + 1;
  }
  const header = lines.find((l) => l.line.trim());
  if (!header) return [];
  const sep = (header.line.match(/;/g)?.length ?? 0) >= (header.line.match(/,/g)?.length ?? 0) ? ';' : ',';
  const cells = (line: string): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let i = 0;
    while (i <= line.length) {
      let start = i;
      let end: number;
      if (line[i] === '"') {
        start = i + 1;
        let j = start;
        while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) j += line[j] === '"' ? 2 : 1;
        end = j;
        i = line.indexOf(sep, j);
      } else {
        const next = line.indexOf(sep, i);
        end = next < 0 ? line.length : next;
        i = next;
      }
      out.push([start, end]);
      if (i < 0) break;
      i++;
    }
    return out;
  };
  const hints = cells(header.line).map(([a, b]) => {
    const title = header.line.slice(a, b).trim();
    return COLUMN_HINTS.find(([re]) => re.test(title))?.[1];
  });
  if (!hints.some(Boolean)) return [];
  const spans: Span[] = [];
  for (const { start, line } of lines) {
    if (start <= header.start) continue;
    cells(line).forEach(([a, b], col) => {
      const category = hints[col];
      if (!category) return;
      while (a < b && /\s/.test(line[a])) a++;
      while (b > a && /\s/.test(line[b - 1])) b--;
      if (b - a >= 2) spans.push({ start: start + a, end: start + b, category, source: 'rule' });
    });
  }
  return spans;
}
