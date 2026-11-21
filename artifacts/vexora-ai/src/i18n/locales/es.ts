import type { Dict } from '../types';

export const es: Dict = {
  meta: { title: 'Vexora AI — estudio de imagen y vídeo con IA', description: 'Crea imágenes realistas con IA y anuncios de vídeo cortos en un solo estudio.' },
  nav: {
    explore: 'Explorar', create: 'Crear', pricing: 'Precios', profile: 'Perfil',
    home: 'Vexora AI — inicio', main: 'Navegación principal', mobile: 'Navegación móvil',
    creditsLeft: 'Quedan {n} créditos', language: 'Idioma',
  },
  footer: { rights: '© {year} Vexora AI. Todos los derechos reservados.', synthetic: 'Las vistas previas son imágenes sintéticas generadas proceduralmente.' },
  hero: {
    badge: 'Nuevo: Pulse Motion cinematic video', title1: 'Escribe la idea.', title2: 'Obtén el anuncio.',
    subtitle: 'Crea imágenes realistas y clips de vídeo cortos desde un solo panel. Explora lo que hacen los creadores y haz remix de cualquier prompt con un clic.',
    start: 'Empieza gratis', plans: 'Planes con descuento',
  },
  categories: { all: 'Todo', ads: 'Anuncios', product: 'Producto', portrait: 'Retrato', cinematic: 'Cinematic', fashion: 'Moda', food: 'Comida', architecture: 'Arquitectura', abstract: 'Abstracto' },
  explore: {
    search: 'Buscar', searchPlaceholder: 'Busca prompts, temas o creadores…',
    kind: 'Tipo de medio', all: 'Todo', image: 'Imagen', video: 'Vídeo',
    sort: 'Ordenar', trending: 'Tendencia', newest: 'Más recientes', mostLiked: 'Más gustados',
    results: '{n} resultados', empty: 'Nada coincide con estos filtros.', reset: 'Restablecer filtros', featured: 'Destacado', open: '{title} — abrir vista previa',
  },
  preview: { prompt: 'Prompt', copy: 'Copiar', copied: 'Copiado', likes: 'Me gusta', remixes: 'Remixes', seed: 'Seed', useprompt: 'Crear con este prompt', like: 'Me gusta', videoLength: 'Vídeo · {s} s' },
  models: {
    'ember-img-2': 'Fotos realistas, iluminación precisa', 'ember-img-fast': 'Bocetos y variaciones rápidas', 'ember-img-pro': 'Detalle 4K, fotografía de producto',
    'pulse-vid-1': 'Cinematic camera movement', 'pulse-vid-lite': 'Clips cortos para Reels / TikTok',
  },
  styles: { none: 'Libre', realistic: 'Realistic', cinematic: 'Cinematic', studio: 'Studio product', neon: 'Neon noir', editorial: 'Editorial' },
  gen: {
    title1: 'Estudio de', title2: 'creación', subtitle: 'Elige un modelo, escribe un prompt y ajusta los parámetros.',
    kind: 'Tipo de medio', image: 'Imagen', video: 'Vídeo',
    model: 'Modelo', prompt: 'Prompt', negative: 'Negative prompt', style: 'Estilo', aspect: 'Aspect ratio',
    count: 'Cantidad: {n}', countAria: 'Número de resultados', duration: 'Duración: {n} s', durationAria: 'Duración del vídeo',
    seed: 'Seed', seedRandom: 'Aleatorio', randomSeed: 'Seed aleatorio', clearSeed: 'Borrar seed',
    submit: 'Generar', cr: 'cr', perSec: '/s',
    noCredits: 'No tienes créditos suficientes. Compra un paquete o mejora tu plan.', buy: 'Comprar créditos',
    emptyTitle: 'Tus resultados aparecerán aquí', emptyText: 'Puedes hacer remix de un prompt desde Explorar.', inspire: 'Inspírate',
    cancel: 'Cancelar', ready: 'Listo', cancelled: 'Cancelado', failed: 'Algo salió mal', download: 'Descargar (demo)',
  },
  pricing: {
    promo: 'Descuento de lanzamiento', title1: 'Crea más,', title2: 'paga menos',
    subtitle: 'Créditos transparentes con uso comercial en todos los planes de pago.',
    cycle: 'Ciclo de facturación', monthly: 'Mensual', yearly: 'Anual', upTo: 'hasta −{n} %',
    popular: 'Más popular', perMonth: '/mes',
    saveYearly: '{total}/año — ahorras {save}', saveMonthly: 'Ahorras {save}/mes',
    creditsPerMonth: '{n} créditos / mes', current: 'Plan actual', startFree: 'Empieza gratis', choose: 'Elegir {name}',
    packsTitle: 'Paquetes de créditos extra', packsSubtitle: 'Pago único. Los créditos no caducan.', bonus: '+{n} de regalo', packCredits: '{n} cr',
  },
  plans: { free: { tagline: 'Prueba la plataforma' }, starter: { tagline: 'Para creadores individuales' }, creator: { tagline: 'Para anuncios en vídeo' }, studio: { tagline: 'Agencias y equipos' } },
  features: {
    flash: 'Modelo Ember Flash', watermark: 'Descargas con marca de agua', publicGallery: 'Galería pública',
    allImage: 'Todos los modelos de imagen', noWatermark: 'Sin marca de agua', pulseLite: 'Vídeo Pulse Lite', parallel: '{n} generaciones en paralelo',
    pulseMotion: 'Pulse Motion cinematic video', commercial: 'Licencia comercial', priority: 'Cola prioritaria',
    allPro: 'Todos los modelos Pro', seats: 'Uso en equipo ({n} plazas)', api: 'Acceso a la API (próximamente)',
  },
  checkout: {
    title: 'Pago', confirm: 'Confirma tu pedido', planLine: '{plan} · {cycle}', packLine: 'Paquete de {n} créditos',
    discount: 'Descuento ({n} %)', total: 'Total', card: 'Datos de la tarjeta',
    demo: 'Modo demo: no se realiza ningún cargo. Estos campos se sustituirán por el formulario alojado de la pasarela de pago.',
    pay: 'Pagar {amount}', processing: 'Procesando…', cancelAnytime: 'Cancela cuando quieras',
    successTitle: 'Pago completado', successText: 'Se añadieron {n} créditos a tu cuenta.', continue: 'Continuar',
  },
  profile: {
    guest: 'Invitado', demo: 'Las cuentas están en modo demo: los datos se guardan en tu navegador.', upgrade: 'Mejorar plan',
    credits: 'Créditos', plan: 'Plan', library: 'Biblioteca', yearly: 'anual', monthly: 'mensual',
    works: 'Mis creaciones', empty: 'Aún no has creado nada.', start: 'Empieza ahora →',
  },
  common: { close: 'Cerrar', synthetic: 'Vista previa sintética' },
};
