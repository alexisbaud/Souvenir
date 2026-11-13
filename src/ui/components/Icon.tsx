// Pictogrammes en ligne (aucune ressource externe).
const P: Record<string, string> = {
  ici: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  personnes: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  souvenirs: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10.5 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4.5-5a2.5 2.5 0 0 1 0 5',
  journal: 'M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM8 9h8M8 13h8M8 17h5',
  retour: 'M2 16l20-6-20-6 4 6zM6 10h8M3 20h18',
  reglages:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.3 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  recherche: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  fermer: 'M18 6L6 18M6 6l12 12',
  retourArriere: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  bas: 'M6 9l6 6 6-6',
  carte: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  ia: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  alerte: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  ok: 'M5 13l4 4L19 7',
  photo: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  corbeille: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  lien: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copier: 'M9 9h11v11H9zM5 15H4V4h11v1',
  coller: 'M8 4h8v3H8zM6 6H4v15h16V6h-2',
  modifier: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  sac: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  ampoule: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  rien: 'M12 8v4M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plusActions: 'M5 12h.01M12 12h.01M19 12h.01',
  poignee: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  groupe: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  // Catégories
  'cat-nourriture': 'M4 8h16v12H4zM4 8l3-4h10l3 4M12 8v12',
  'cat-boisson': 'M10 2h4v4l2 3v12H8V9l2-3zM8 13h8',
  'cat-artisanat': 'M12 3c4 0 7 3 7 7 0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.7c.6.4.5 1.3-.2 1.3H12a9 9 0 0 1 0-18zM7.5 11h.01M10 7h.01M15 7.5h.01',
  'cat-cuisine': 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
  'cat-textile': 'M4 6h16v12H4zM4 10h16M4 14h16',
  'cat-papeterie': 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  'cat-deco': 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  'cat-beaute': 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  'cat-pop': 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  'cat-the': 'M4 8h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3',
};

export function Icon({ n, taille = 20, titre, epaisseur = 1.8 }: { n: keyof typeof P | string; taille?: number; titre?: string; epaisseur?: number }) {
  return (
    <svg
      class="icon"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={epaisseur}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={titre ? undefined : 'true'}
      role={titre ? 'img' : undefined}
      aria-label={titre}
    >
      <path d={P[n] ?? ''} />
    </svg>
  );
}
