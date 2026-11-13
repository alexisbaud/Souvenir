// Validation stricte d'une réponse IA (§9.7) : nettoyage des textes puis contrôle par le schéma.
type Schema = Record<string, unknown>;

/** Nettoie : espaces superflus retirés, chaînes tronquées à maxLength. Renvoie une copie. */
export function nettoyer(v: unknown, s: Schema): unknown {
  if (typeof v === 'string') {
    let t = v.replace(/\s+/g, ' ').trim();
    const max = s.maxLength as number | undefined;
    if (max !== undefined && t.length > max) t = t.slice(0, max - 1).trimEnd() + '…';
    return t;
  }
  if (Array.isArray(v) && s.items) return v.map((x) => nettoyer(x, s.items as Schema));
  if (v && typeof v === 'object' && s.properties) {
    const props = s.properties as Record<string, Schema>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === null) continue; // null = absent
      out[k] = props[k] ? nettoyer(x, props[k]) : x;
    }
    return out;
  }
  return v;
}

/** Renvoie la liste des erreurs (vide si valide) */
export function valider(v: unknown, s: Schema, chemin = 'réponse'): string[] {
  const err: string[] = [];
  const type = s.type as string | undefined;
  if (type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${chemin} : objet attendu`];
    const o = v as Record<string, unknown>;
    for (const r of (s.required as string[] | undefined) ?? [])
      if (o[r] === undefined || o[r] === '') err.push(`${chemin}.${r} : champ obligatoire manquant`);
    const props = (s.properties as Record<string, Schema> | undefined) ?? {};
    for (const [k, x] of Object.entries(o)) if (props[k] && x !== undefined) err.push(...valider(x, props[k], `${chemin}.${k}`));
    return err;
  }
  if (type === 'array') {
    if (!Array.isArray(v)) return [`${chemin} : liste attendue`];
    if (s.minItems !== undefined && v.length < (s.minItems as number))
      err.push(`${chemin} : au moins ${s.minItems} élément(s)`);
    if (s.maxItems !== undefined && v.length > (s.maxItems as number))
      err.push(`${chemin} : au plus ${s.maxItems} élément(s)`);
    v.forEach((x, i) => err.push(...valider(x, s.items as Schema, `${chemin}[${i}]`)));
    return err;
  }
  if (type === 'string') {
    if (typeof v !== 'string') return [`${chemin} : texte attendu`];
    if (s.enum && !(s.enum as string[]).includes(v)) err.push(`${chemin} : valeur « ${v} » non autorisée`);
    return err;
  }
  if (type === 'integer' || type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return [`${chemin} : nombre attendu`];
    if (type === 'integer' && !Number.isInteger(v)) err.push(`${chemin} : entier attendu`);
    if (s.minimum !== undefined && v < (s.minimum as number)) err.push(`${chemin} : minimum ${s.minimum}`);
    if (s.maximum !== undefined && v > (s.maximum as number)) err.push(`${chemin} : maximum ${s.maximum}`);
    return err;
  }
  if (type === 'boolean' && typeof v !== 'boolean') return [`${chemin} : vrai/faux attendu`];
  return err;
}

/** Extrait le premier bloc JSON d'un texte collé (F-44 CA2) */
export function extraireJSON(texte: string): unknown {
  const bloc = /```(?:json)?\s*([\s\S]*?)```/i.exec(texte);
  const candidats: string[] = [];
  if (bloc) candidats.push(bloc[1]);
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut >= 0 && fin > debut) candidats.push(texte.slice(debut, fin + 1));
  for (const c of candidats) {
    try {
      return JSON.parse(c.trim());
    } catch {
      /* candidat suivant */
    }
  }
  throw new Error('Aucun bloc JSON lisible dans le texte collé.');
}

export function urlHttpsValide(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
}
