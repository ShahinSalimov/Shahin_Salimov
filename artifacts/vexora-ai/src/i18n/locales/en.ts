/** Source dictionary. Every other locale must provide exactly these keys (enforced by the `Dict` type). */
export const en = {
  meta: {
    title: 'Vexora AI — AI image & video studio',
    description: 'Create realistic AI images and short video ads in one studio.',
  },
  nav: {
    explore: 'Explore', create: 'Create', pricing: 'Pricing', profile: 'Profile',
    home: 'Vexora AI — home', main: 'Main navigation', mobile: 'Mobile navigation',
    creditsLeft: '{n} credits left', language: 'Language',
  },
  footer: {
    rights: '© {year} Vexora AI. All rights reserved.',
    synthetic: 'Previews are procedurally generated synthetic visuals.',
  },
  hero: {
    badge: 'New: Pulse Motion cinematic video',
    title1: 'Write the idea.', title2: 'Get the ad.',
    subtitle: 'Create realistic images and short video clips from a single panel. Explore what creators make and remix any prompt in one click.',
    start: 'Start for free', plans: 'Discounted plans',
  },
  categories: {
    all: 'All', ads: 'Ads', product: 'Product', portrait: 'Portrait', cinematic: 'Cinematic',
    fashion: 'Fashion', food: 'Food', architecture: 'Architecture', abstract: 'Abstract',
  },
  explore: {
    search: 'Search', searchPlaceholder: 'Search prompts, topics or creators…',
    kind: 'Media type', all: 'All', image: 'Image', video: 'Video',
    sort: 'Sort', trending: 'Trending', newest: 'Newest', mostLiked: 'Most liked',
    results: '{n} results', empty: 'Nothing matches these filters.', reset: 'Reset filters',
    featured: 'Featured', open: '{title} — open preview',
  },
  preview: {
    prompt: 'Prompt', copy: 'Copy', copied: 'Copied', likes: 'Likes', remixes: 'Remixes', seed: 'Seed',
    useprompt: 'Create with this prompt', like: 'Like', videoLength: 'Video · {s}s',
  },
  models: {
    'ember-img-2': 'Realistic photos, precise lighting',
    'ember-img-fast': 'Fast sketches and variations',
    'ember-img-pro': '4K detail, product shoots',
    'pulse-vid-1': 'Cinematic camera movement',
    'pulse-vid-lite': 'Short Reels / TikTok clips',
  },
  styles: {
    none: 'Freestyle', realistic: 'Realistic', cinematic: 'Cinematic', studio: 'Studio product', neon: 'Neon noir', editorial: 'Editorial',
  },
  gen: {
    title1: 'Creation', title2: 'studio', subtitle: 'Pick a model, write a prompt, tune the parameters.',
    kind: 'Media type', image: 'Image', video: 'Video',
    model: 'Model', prompt: 'Prompt', negative: 'Negative prompt', style: 'Style', aspect: 'Aspect ratio',
    count: 'Count: {n}', countAria: 'Number of results', duration: 'Duration: {n}s', durationAria: 'Video duration',
    seed: 'Seed', seedRandom: 'Random', randomSeed: 'Random seed', clearSeed: 'Clear seed',
    submit: 'Generate', cr: 'cr', perSec: '/s',
    noCredits: 'Not enough credits. Buy a pack or upgrade your plan.', buy: 'Buy credits',
    emptyTitle: 'Your results will appear here', emptyText: 'You can remix a ready-made prompt from Explore.', inspire: 'Get inspired',
    cancel: 'Cancel', ready: 'Ready', cancelled: 'Cancelled', failed: 'Something went wrong', download: 'Download (demo)',
  },
  pricing: {
    promo: 'Launch discount', title1: 'Create more,', title2: 'pay less',
    subtitle: 'Transparent credits with commercial use on every paid plan.',
    cycle: 'Billing cycle', monthly: 'Monthly', yearly: 'Yearly', upTo: 'up to −{n}%',
    popular: 'Most popular', perMonth: '/mo',
    saveYearly: '{total}/year — save {save}', saveMonthly: 'Save {save}/mo',
    creditsPerMonth: '{n} credits / mo', current: 'Current plan', startFree: 'Start free', choose: 'Choose {name}',
    packsTitle: 'Extra credit packs', packsSubtitle: 'One-time payment. Credits never expire.', bonus: '+{n} bonus',
    packCredits: '{n} cr',
  },
  plans: {
    free: { tagline: 'Try the platform' },
    starter: { tagline: 'For solo creators' },
    creator: { tagline: 'For video ad makers' },
    studio: { tagline: 'Agencies and teams' },
  },
  features: {
    flash: 'Ember Flash model', watermark: 'Watermarked downloads', publicGallery: 'Public gallery',
    allImage: 'All image models', noWatermark: 'No watermark', pulseLite: 'Pulse Lite video', parallel: '{n} parallel generations',
    pulseMotion: 'Pulse Motion cinematic video', commercial: 'Commercial license', priority: 'Priority queue',
    allPro: 'All Pro models', seats: 'Team sharing ({n} seats)', api: 'API access (coming soon)',
  },
  checkout: {
    title: 'Checkout', confirm: 'Confirm your order', planLine: '{plan} · {cycle}', packLine: '{n} credit pack',
    discount: 'Discount ({n}%)', total: 'Total', card: 'Card details',
    demo: 'Demo mode: no real charge. These fields will be replaced by the payment gateway’s hosted form.',
    pay: 'Pay {amount}', processing: 'Processing…', cancelAnytime: 'Cancel anytime',
    successTitle: 'Payment complete', successText: '{n} credits were added to your account.', continue: 'Continue',
  },
  profile: {
    guest: 'Guest user', demo: 'Accounts are in demo mode — data is stored in your browser.', upgrade: 'Upgrade plan',
    credits: 'Credits', plan: 'Plan', library: 'Library', yearly: 'yearly', monthly: 'monthly',
    works: 'My creations', empty: 'You haven’t created anything yet.', start: 'Start now →',
  },
  common: { close: 'Close', synthetic: 'Synthetic preview' },
};
