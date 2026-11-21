import type { Dict } from '../types';

export const fr: Dict = {
  meta: { title: 'Vexora AI — studio IA d’images et de vidéos', description: 'Créez des images IA réalistes et de courtes publicités vidéo dans un seul studio.' },
  nav: {
    explore: 'Explorer', create: 'Créer', pricing: 'Tarifs', profile: 'Profil',
    home: 'Vexora AI — accueil', main: 'Navigation principale', mobile: 'Navigation mobile',
    creditsLeft: '{n} crédits restants', language: 'Langue',
  },
  footer: { rights: '© {year} Vexora AI. Tous droits réservés.', synthetic: 'Les aperçus sont des visuels synthétiques générés de façon procédurale.' },
  hero: {
    badge: 'Nouveau : Pulse Motion cinematic video', title1: 'Écrivez l’idée.', title2: 'Obtenez la pub.',
    subtitle: 'Créez des images réalistes et de courts clips vidéo depuis un seul panneau. Explorez les créations et remixez n’importe quel prompt en un clic.',
    start: 'Commencer gratuitement', plans: 'Offres à prix réduit',
  },
  categories: { all: 'Tout', ads: 'Publicité', product: 'Produit', portrait: 'Portrait', cinematic: 'Cinematic', fashion: 'Mode', food: 'Cuisine', architecture: 'Architecture', abstract: 'Abstrait' },
  explore: {
    search: 'Rechercher', searchPlaceholder: 'Rechercher un prompt, un thème ou un créateur…',
    kind: 'Type de média', all: 'Tout', image: 'Image', video: 'Vidéo',
    sort: 'Trier', trending: 'Tendances', newest: 'Plus récents', mostLiked: 'Plus aimés',
    results: '{n} résultats', empty: 'Aucun résultat pour ces filtres.', reset: 'Réinitialiser les filtres', featured: 'À la une', open: '{title} — ouvrir l’aperçu',
  },
  preview: { prompt: 'Prompt', copy: 'Copier', copied: 'Copié', likes: 'J’aime', remixes: 'Remix', seed: 'Seed', useprompt: 'Créer avec ce prompt', like: 'J’aime', videoLength: 'Vidéo · {s} s' },
  models: {
    'ember-img-2': 'Photos réalistes, éclairage précis', 'ember-img-fast': 'Esquisses et variantes rapides', 'ember-img-pro': 'Détails 4K, photos produit',
    'pulse-vid-1': 'Cinematic camera movement', 'pulse-vid-lite': 'Clips courts pour Reels / TikTok',
  },
  styles: { none: 'Libre', realistic: 'Realistic', cinematic: 'Cinematic', studio: 'Studio product', neon: 'Neon noir', editorial: 'Editorial' },
  gen: {
    title1: 'Studio de', title2: 'création', subtitle: 'Choisissez un modèle, écrivez un prompt, réglez les paramètres.',
    kind: 'Type de média', image: 'Image', video: 'Vidéo',
    model: 'Modèle', prompt: 'Prompt', negative: 'Negative prompt', style: 'Style', aspect: 'Aspect ratio',
    count: 'Nombre : {n}', countAria: 'Nombre de résultats', duration: 'Durée : {n} s', durationAria: 'Durée de la vidéo',
    seed: 'Seed', seedRandom: 'Aléatoire', randomSeed: 'Seed aléatoire', clearSeed: 'Effacer le seed',
    submit: 'Générer', cr: 'cr', perSec: '/s',
    noCredits: 'Crédits insuffisants. Achetez un pack ou passez à une offre supérieure.', buy: 'Acheter des crédits',
    emptyTitle: 'Vos résultats apparaîtront ici', emptyText: 'Vous pouvez remixer un prompt depuis Explorer.', inspire: 'S’inspirer',
    cancel: 'Annuler', ready: 'Prêt', cancelled: 'Annulé', failed: 'Une erreur est survenue', download: 'Télécharger (démo)',
  },
  pricing: {
    promo: 'Remise de lancement', title1: 'Créez plus,', title2: 'payez moins',
    subtitle: 'Des crédits transparents avec usage commercial sur toutes les offres payantes.',
    cycle: 'Période de facturation', monthly: 'Mensuel', yearly: 'Annuel', upTo: 'jusqu’à −{n} %',
    popular: 'Le plus populaire', perMonth: '/mois',
    saveYearly: '{total}/an — {save} d’économie', saveMonthly: '{save}/mois d’économie',
    creditsPerMonth: '{n} crédits / mois', current: 'Offre actuelle', startFree: 'Commencer gratuitement', choose: 'Choisir {name}',
    packsTitle: 'Packs de crédits supplémentaires', packsSubtitle: 'Paiement unique. Les crédits n’expirent jamais.', bonus: '+{n} offerts', packCredits: '{n} cr',
  },
  plans: { free: { tagline: 'Essayer la plateforme' }, starter: { tagline: 'Pour les créateurs solo' }, creator: { tagline: 'Pour les pubs vidéo' }, studio: { tagline: 'Agences et équipes' } },
  features: {
    flash: 'Modèle Ember Flash', watermark: 'Téléchargements filigranés', publicGallery: 'Galerie publique',
    allImage: 'Tous les modèles d’image', noWatermark: 'Sans filigrane', pulseLite: 'Vidéo Pulse Lite', parallel: '{n} générations en parallèle',
    pulseMotion: 'Pulse Motion cinematic video', commercial: 'Licence commerciale', priority: 'File prioritaire',
    allPro: 'Tous les modèles Pro', seats: 'Partage d’équipe ({n} places)', api: 'Accès API (bientôt)',
  },
  checkout: {
    title: 'Paiement', confirm: 'Confirmez votre commande', planLine: '{plan} · {cycle}', packLine: 'Pack de {n} crédits',
    discount: 'Remise ({n} %)', total: 'Total', card: 'Informations de carte',
    demo: 'Mode démo : aucun débit réel. Ces champs seront remplacés par le formulaire hébergé de la passerelle de paiement.',
    pay: 'Payer {amount}', processing: 'Traitement…', cancelAnytime: 'Résiliable à tout moment',
    successTitle: 'Paiement effectué', successText: '{n} crédits ont été ajoutés à votre compte.', continue: 'Continuer',
  },
  profile: {
    guest: 'Invité', demo: 'Les comptes sont en mode démo — les données sont stockées dans votre navigateur.', upgrade: 'Changer d’offre',
    credits: 'Crédits', plan: 'Offre', library: 'Bibliothèque', yearly: 'annuel', monthly: 'mensuel',
    works: 'Mes créations', empty: 'Vous n’avez encore rien créé.', start: 'Commencer →',
  },
  common: { close: 'Fermer', synthetic: 'Aperçu synthétique' },
};
