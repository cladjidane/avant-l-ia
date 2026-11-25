// Réglage « Façon de repérer » : rapide (règles seules) ou complète (avec le
// modèle). Le modèle est téléchargé une seule fois, avec une barre de progression.

import { MODEL_SIZE_MB } from '../config';
import type { Span } from '../detect/types';
import { detectWithModel, isModelCached, loadModel } from '../model/client';
import { el } from './helpers';

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} Mo`;
}

export function setupModelUi(): void {
  el('model-size').textContent = `${MODEL_SIZE_MB} Mo`;
  // Si le modèle est déjà sur l'ordinateur, la façon complète est choisie d'office.
  void isModelCached().then((cached) => {
    if (cached) el<HTMLInputElement>('mode-full').checked = true;
  });
}

function fullModeSelected(): boolean {
  return el<HTMLInputElement>('mode-full').checked;
}

export async function detectWithModelIfEnabled(text: string): Promise<Span[]> {
  if (!fullModeSelected()) return [];
  const box = el('model-progress');
  const label = el('model-progress-text');
  const bar = el<HTMLProgressElement>('model-progress-bar');
  box.hidden = false;
  label.textContent = 'Préparation du repérage complet...';
  bar.removeAttribute('value');
  try {
    await loadModel((loaded, total) => {
      if (total >= 5_000_000) {
        bar.max = total;
        bar.value = loaded;
        label.textContent = `Téléchargement du fichier de repérage, une seule fois : ${megabytes(loaded)} sur ${megabytes(total)}.`;
      }
    });
    label.textContent = 'Repérage complet en cours...';
    bar.removeAttribute('value');
    const spans = await detectWithModel(text);
    box.hidden = true;
    return spans.map((s) => ({ start: s.start, end: s.end, category: s.category, source: 'model' as const }));
  } catch (err) {
    box.hidden = true;
    const reason = navigator.onLine
      ? 'Le repérage complet n’a pas pu démarrer sur cet ordinateur.'
      : 'Le fichier de repérage n’a pas encore été téléchargé et l’ordinateur est hors ligne.';
    console.error(err);
    throw new Error(`${reason} Choisissez la façon « Rapide » et relancez.`);
  }
}
