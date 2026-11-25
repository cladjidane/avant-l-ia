// Petites fonctions d'interface partagées.

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément introuvable : ${id}`);
  return node as T;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Solution de secours pour les navigateurs qui refusent l'accès au presse-papiers.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

// Nom de fichier de sortie : « devis.docx » devient « devis-nettoye.docx ».
export function suffixedName(name: string, suffix: string, ext?: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = ext ?? (dot > 0 ? name.slice(dot + 1) : 'txt');
  return `${base}-${suffix}.${extension}`;
}

// Active le glisser-déposer d'un fichier sur une zone.
export function setupDropZone(zone: HTMLElement, onFile: (file: File) => void): void {
  let depth = 0;
  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('dragging');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

export function plural(n: number, forms: [string, string]): string {
  return `${n} ${n > 1 ? forms[1] : forms[0]}`;
}
