// Appel direct de l'API Claude depuis le navigateur (§9.6), avec la clé de l'utilisateur.
import Anthropic from '@anthropic-ai/sdk';
import type { Demande } from './context';

import type { UsageIA } from './modeles';

export interface ResultatAppel {
  input: unknown;
  usage: UsageIA;
  journal: string[];
}

import { ErreurIA } from './modeles';
export { ErreurIA };

/** Version de l'outil de recherche web : filtrage dynamique quand le modèle le permet */
function versionRecherche(modele: string, recente: boolean): 'web_search_20260209' | 'web_search_20250305' {
  if (!recente) return 'web_search_20250305';
  return /^claude-(sonnet|opus|fable)-/.test(modele) ? 'web_search_20260209' : 'web_search_20250305';
}

/** Repli serveur en cas de refus (modèles qui le prennent en charge) */
function avecRepli(modele: string): boolean {
  return modele === 'claude-sonnet-5-5' || modele === 'claude-opus-5-5' || modele.startsWith('claude-fable-');
}

export function client(cle: string): Anthropic {
  return new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, timeout: 120_000, maxRetries: 2 });
}

function traduireErreur(e: unknown): ErreurIA {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new ErreurIA('Clé invalide', true);
  if (e instanceof Anthropic.RateLimitError) return new ErreurIA('Trop de demandes : réessayez plus tard.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErreurIA('Délai dépassé (120 s).');
  if (e instanceof Anthropic.APIConnectionError) return new ErreurIA('Réseau indisponible.');
  if (e instanceof Anthropic.BadRequestError) return new ErreurIA('Requête refusée : ' + e.message, true);
  if (e instanceof Anthropic.APIError) return new ErreurIA(`Erreur de l'API (${e.status ?? '?'}) : ${e.message}`);
  return new ErreurIA((e as Error)?.message ?? String(e));
}

export async function testerCle(cle: string): Promise<void> {
  try {
    await client(cle).models.list({ limit: 1 });
  } catch (e) {
    throw traduireErreur(e);
  }
}

/**
 * Boucle de traitement (§9.6) : au plus quatre requêtes.
 * pause_turn → on renvoie ; pas d'appel de l'outil de sortie → une relance ; refus → échec.
 */
export async function executer(
  cle: string,
  modele: string,
  d: Demande,
  maxRecherches: number,
  ville: string | undefined,
  recente = true,
): Promise<ResultatAppel> {
  const c = client(cle);
  const usage: UsageIA = { jetonsEntree: 0, jetonsSortie: 0, recherches: 0 };
  const journal: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: d.message }];
  let relance = false;
  for (let i = 0; i < 4; i++) {
    const params = {
      model: modele,
      max_tokens: 16000,
      system: d.systeme,
      messages,
      tools: [
        {
          type: versionRecherche(modele, recente),
          name: 'web_search' as const,
          max_uses: maxRecherches,
          user_location: { type: 'approximate' as const, city: ville, country: 'JP', timezone: 'Asia/Tokyo' },
        },
        { name: d.outil.name, description: d.outil.description, input_schema: d.outil.input_schema as Anthropic.Beta.BetaTool.InputSchema },
      ],
      tool_choice: { type: 'auto' as const },
      ...(avecRepli(modele) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming;
    let r: Anthropic.Beta.BetaMessage;
    try {
      r = await c.beta.messages.create(params);
    } catch (e) {
      // Version récente de l'outil refusée : on revient à la version de base
      if (recente && e instanceof Anthropic.BadRequestError && /web_search|fallback/i.test(e.message)) {
        journal.push('Repli sur web_search_20250305 : ' + e.message);
        const res = await executer(cle, modele, d, maxRecherches, ville, false);
        return { ...res, journal: [...journal, ...res.journal] };
      }
      throw traduireErreur(e);
    }
    usage.jetonsEntree += r.usage.input_tokens ?? 0;
    usage.jetonsSortie += r.usage.output_tokens ?? 0;
    usage.recherches += r.usage.server_tool_use?.web_search_requests ?? 0;
    for (const b of r.content) {
      if (b.type === 'web_search_tool_result' && !Array.isArray(b.content)) {
        journal.push('Recherche web : ' + (b.content as { error_code?: string }).error_code);
      }
    }
    if (r.stop_reason === 'refusal') throw new ErreurIA('Le modèle a refusé cette demande.', true);
    const appel = r.content.find((b) => b.type === 'tool_use' && b.name === d.outil.name);
    if (appel && appel.type === 'tool_use') return { input: appel.input, usage, journal };
    messages.push({ role: 'assistant', content: r.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (r.stop_reason === 'pause_turn') continue;
    if (relance) break;
    relance = true;
    messages.push({ role: 'user', content: `Appelle maintenant l'outil ${d.outil.name} avec tes résultats.` });
  }
  throw new ErreurIA("L'IA n'a pas renvoyé de résultat exploitable.");
}
