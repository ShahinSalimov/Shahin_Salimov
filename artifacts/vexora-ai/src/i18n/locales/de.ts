import type { Dict } from '../types';

export const de: Dict = {
  meta: { title: 'Vexora AI — KI-Studio für Bilder & Videos', description: 'Erstelle realistische KI-Bilder und kurze Videoanzeigen in einem Studio.' },
  nav: {
    explore: 'Entdecken', create: 'Erstellen', pricing: 'Preise', profile: 'Profil',
    home: 'Vexora AI — Startseite', main: 'Hauptnavigation', mobile: 'Mobile Navigation',
    creditsLeft: 'Noch {n} Credits', language: 'Sprache',
  },
  footer: { rights: '© {year} Vexora AI. Alle Rechte vorbehalten.', synthetic: 'Vorschauen sind prozedural erzeugte synthetische Grafiken.' },
  hero: {
    badge: 'Neu: Pulse Motion cinematic video', title1: 'Idee eingeben.', title2: 'Anzeige fertig.',
    subtitle: 'Erstelle realistische Bilder und kurze Videoclips in einem Panel. Entdecke Werke anderer Creator und remixe jeden Prompt mit einem Klick.',
    start: 'Kostenlos starten', plans: 'Rabattierte Pläne',
  },
  categories: { all: 'Alle', ads: 'Werbung', product: 'Produkt', portrait: 'Porträt', cinematic: 'Cinematic', fashion: 'Mode', food: 'Food', architecture: 'Architektur', abstract: 'Abstrakt' },
  explore: {
    search: 'Suche', searchPlaceholder: 'Prompts, Themen oder Creator suchen…',
    kind: 'Medientyp', all: 'Alle', image: 'Bild', video: 'Video',
    sort: 'Sortieren', trending: 'Trends', newest: 'Neueste', mostLiked: 'Beliebteste',
    results: '{n} Ergebnisse', empty: 'Keine Treffer für diese Filter.', reset: 'Filter zurücksetzen', featured: 'Empfohlen', open: '{title} — Vorschau öffnen',
  },
  preview: { prompt: 'Prompt', copy: 'Kopieren', copied: 'Kopiert', likes: 'Likes', remixes: 'Remixe', seed: 'Seed', useprompt: 'Mit diesem Prompt erstellen', like: 'Gefällt mir', videoLength: 'Video · {s} s' },
  models: {
    'ember-img-2': 'Realistische Fotos, präzises Licht', 'ember-img-fast': 'Schnelle Skizzen und Varianten', 'ember-img-pro': '4K-Details, Produktfotos',
    'pulse-vid-1': 'Cinematic camera movement', 'pulse-vid-lite': 'Kurze Reels- / TikTok-Clips',
  },
  styles: { none: 'Frei', realistic: 'Realistic', cinematic: 'Cinematic', studio: 'Studio product', neon: 'Neon noir', editorial: 'Editorial' },
  gen: {
    title1: 'Kreativ-', title2: 'Studio', subtitle: 'Modell wählen, Prompt schreiben, Parameter anpassen.',
    kind: 'Medientyp', image: 'Bild', video: 'Video',
    model: 'Modell', prompt: 'Prompt', negative: 'Negative prompt', style: 'Stil', aspect: 'Aspect ratio',
    count: 'Anzahl: {n}', countAria: 'Anzahl der Ergebnisse', duration: 'Dauer: {n} s', durationAria: 'Videodauer',
    seed: 'Seed', seedRandom: 'Zufällig', randomSeed: 'Zufälliger Seed', clearSeed: 'Seed zurücksetzen',
    submit: 'Erstellen', cr: 'Cr', perSec: '/s',
    noCredits: 'Nicht genug Credits. Kaufe ein Paket oder upgrade deinen Plan.', buy: 'Credits kaufen',
    emptyTitle: 'Hier erscheinen deine Ergebnisse', emptyText: 'Du kannst einen fertigen Prompt aus „Entdecken“ remixen.', inspire: 'Inspiration holen',
    cancel: 'Abbrechen', ready: 'Fertig', cancelled: 'Abgebrochen', failed: 'Etwas ist schiefgelaufen', download: 'Download (Demo)',
  },
  pricing: {
    promo: 'Launch-Rabatt', title1: 'Mehr erschaffen,', title2: 'weniger zahlen',
    subtitle: 'Transparente Credits mit kommerzieller Nutzung in allen bezahlten Plänen.',
    cycle: 'Abrechnungszeitraum', monthly: 'Monatlich', yearly: 'Jährlich', upTo: 'bis −{n} %',
    popular: 'Am beliebtesten', perMonth: '/Monat',
    saveYearly: '{total}/Jahr — {save} gespart', saveMonthly: '{save}/Monat gespart',
    creditsPerMonth: '{n} Credits / Monat', current: 'Aktueller Plan', startFree: 'Kostenlos starten', choose: '{name} wählen',
    packsTitle: 'Zusätzliche Credit-Pakete', packsSubtitle: 'Einmalzahlung. Credits verfallen nie.', bonus: '+{n} Bonus', packCredits: '{n} Cr',
  },
  plans: { free: { tagline: 'Plattform testen' }, starter: { tagline: 'Für Solo-Creator' }, creator: { tagline: 'Für Video-Werbung' }, studio: { tagline: 'Agenturen und Teams' } },
  features: {
    flash: 'Ember-Flash-Modell', watermark: 'Downloads mit Wasserzeichen', publicGallery: 'Öffentliche Galerie',
    allImage: 'Alle Bildmodelle', noWatermark: 'Ohne Wasserzeichen', pulseLite: 'Pulse-Lite-Video', parallel: '{n} parallele Generierungen',
    pulseMotion: 'Pulse Motion cinematic video', commercial: 'Kommerzielle Lizenz', priority: 'Prioritäts-Warteschlange',
    allPro: 'Alle Pro-Modelle', seats: 'Team-Freigabe ({n} Plätze)', api: 'API-Zugang (bald)',
  },
  checkout: {
    title: 'Kasse', confirm: 'Bestellung bestätigen', planLine: '{plan} · {cycle}', packLine: '{n}-Credit-Paket',
    discount: 'Rabatt ({n} %)', total: 'Gesamt', card: 'Kartendaten',
    demo: 'Demo-Modus: Es wird nichts abgebucht. Diese Felder werden durch das Hosted-Formular des Zahlungsanbieters ersetzt.',
    pay: '{amount} zahlen', processing: 'Wird verarbeitet…', cancelAnytime: 'Jederzeit kündbar',
    successTitle: 'Zahlung abgeschlossen', successText: '{n} Credits wurden deinem Konto gutgeschrieben.', continue: 'Weiter',
  },
  profile: {
    guest: 'Gast', demo: 'Konten laufen im Demo-Modus — Daten werden im Browser gespeichert.', upgrade: 'Plan upgraden',
    credits: 'Credits', plan: 'Plan', library: 'Bibliothek', yearly: 'jährlich', monthly: 'monatlich',
    works: 'Meine Werke', empty: 'Du hast noch nichts erstellt.', start: 'Jetzt starten →',
  },
  common: { close: 'Schließen', synthetic: 'Synthetische Vorschau' },
};
