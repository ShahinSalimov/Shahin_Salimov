import type { Dict } from '../types';

export const ru: Dict = {
  meta: { title: 'Vexora AI — AI-студия изображений и видео', description: 'Создавайте реалистичные AI-изображения и короткие видеорекламы в одной студии.' },
  nav: {
    explore: 'Обзор', create: 'Создать', pricing: 'Цены', profile: 'Профиль',
    home: 'Vexora AI — главная', main: 'Основная навигация', mobile: 'Мобильная навигация',
    creditsLeft: 'Осталось кредитов: {n}', language: 'Язык',
  },
  footer: { rights: '© {year} Vexora AI. Все права защищены.', synthetic: 'Превью — процедурно сгенерированные синтетические изображения.' },
  hero: {
    badge: 'Новинка: Pulse Motion cinematic video', title1: 'Опишите идею.', title2: 'Получите рекламу.',
    subtitle: 'Создавайте реалистичные изображения и короткие видеоклипы в одной панели. Смотрите работы авторов и делайте remix любого prompt в один клик.',
    start: 'Начать бесплатно', plans: 'Тарифы со скидкой',
  },
  categories: { all: 'Все', ads: 'Реклама', product: 'Товары', portrait: 'Портрет', cinematic: 'Cinematic', fashion: 'Мода', food: 'Еда', architecture: 'Архитектура', abstract: 'Абстракция' },
  explore: {
    search: 'Поиск', searchPlaceholder: 'Искать prompt, тему или автора…',
    kind: 'Тип медиа', all: 'Все', image: 'Фото', video: 'Видео',
    sort: 'Сортировка', trending: 'В тренде', newest: 'Новые', mostLiked: 'Популярные',
    results: 'Результатов: {n}', empty: 'По этим фильтрам ничего не найдено.', reset: 'Сбросить фильтры', featured: 'Выбор', open: '{title} — открыть превью',
  },
  preview: { prompt: 'Prompt', copy: 'Копировать', copied: 'Скопировано', likes: 'Лайки', remixes: 'Remix', seed: 'Seed', useprompt: 'Создать с этим prompt', like: 'Нравится', videoLength: 'Видео · {s} с' },
  models: {
    'ember-img-2': 'Реалистичные фото, точный свет', 'ember-img-fast': 'Быстрые эскизы и варианты', 'ember-img-pro': '4K-детализация, предметная съёмка',
    'pulse-vid-1': 'Cinematic camera movement', 'pulse-vid-lite': 'Короткие клипы для Reels / TikTok',
  },
  styles: { none: 'Свободный', realistic: 'Realistic', cinematic: 'Cinematic', studio: 'Studio product', neon: 'Neon noir', editorial: 'Editorial' },
  gen: {
    title1: 'Студия', title2: 'генерации', subtitle: 'Выберите модель, напишите prompt, настройте параметры.',
    kind: 'Тип медиа', image: 'Фото', video: 'Видео',
    model: 'Модель', prompt: 'Prompt', negative: 'Negative prompt', style: 'Стиль', aspect: 'Aspect ratio',
    count: 'Количество: {n}', countAria: 'Количество результатов', duration: 'Длительность: {n} с', durationAria: 'Длительность видео',
    seed: 'Seed', seedRandom: 'Случайный', randomSeed: 'Случайный seed', clearSeed: 'Сбросить seed',
    submit: 'Создать', cr: 'кр', perSec: '/с',
    noCredits: 'Недостаточно кредитов. Купите пакет или повысьте тариф.', buy: 'Купить кредиты',
    emptyTitle: 'Здесь появятся результаты', emptyText: 'Можно сделать remix готового prompt из раздела «Обзор».', inspire: 'Вдохновиться',
    cancel: 'Отменить', ready: 'Готово', cancelled: 'Отменено', failed: 'Произошла ошибка', download: 'Скачать (демо)',
  },
  pricing: {
    promo: 'Скидка к запуску', title1: 'Создавайте больше,', title2: 'платите меньше',
    subtitle: 'Прозрачная система кредитов с коммерческим использованием на всех платных тарифах.',
    cycle: 'Период оплаты', monthly: 'Ежемесячно', yearly: 'Ежегодно', upTo: 'до −{n}%',
    popular: 'Самый популярный', perMonth: '/мес',
    saveYearly: '{total} в год — экономия {save}', saveMonthly: 'Экономия {save}/мес',
    creditsPerMonth: '{n} кредитов / мес', current: 'Текущий тариф', startFree: 'Начать бесплатно', choose: 'Выбрать {name}',
    packsTitle: 'Дополнительные пакеты кредитов', packsSubtitle: 'Разовый платёж. Кредиты не сгорают.', bonus: '+{n} бонус', packCredits: '{n} кр',
  },
  plans: { free: { tagline: 'Попробовать платформу' }, starter: { tagline: 'Для авторов-одиночек' }, creator: { tagline: 'Для создателей видеорекламы' }, studio: { tagline: 'Агентства и команды' } },
  features: {
    flash: 'Модель Ember Flash', watermark: 'Скачивание с водяным знаком', publicGallery: 'Публичная галерея',
    allImage: 'Все модели изображений', noWatermark: 'Без водяного знака', pulseLite: 'Видео Pulse Lite', parallel: 'Параллельных генераций: {n}',
    pulseMotion: 'Pulse Motion cinematic video', commercial: 'Коммерческая лицензия', priority: 'Приоритетная очередь',
    allPro: 'Все Pro-модели', seats: 'Командный доступ (мест: {n})', api: 'Доступ к API (скоро)',
  },
  checkout: {
    title: 'Оплата', confirm: 'Подтвердите заказ', planLine: '{plan} · {cycle}', packLine: 'Пакет: {n} кредитов',
    discount: 'Скидка ({n}%)', total: 'Итого', card: 'Данные карты',
    demo: 'Демо-режим: реального списания нет. Эти поля будут заменены hosted-формой платёжного шлюза.',
    pay: 'Оплатить {amount}', processing: 'Обработка…', cancelAnytime: 'Отмена в любое время',
    successTitle: 'Оплата прошла', successText: 'На ваш счёт зачислено кредитов: {n}.', continue: 'Продолжить',
  },
  profile: {
    guest: 'Гость', demo: 'Аккаунты в демо-режиме — данные хранятся в браузере.', upgrade: 'Повысить тариф',
    credits: 'Кредиты', plan: 'Тариф', library: 'Библиотека', yearly: 'ежегодно', monthly: 'ежемесячно',
    works: 'Мои работы', empty: 'Вы пока ничего не создали.', start: 'Начать →',
  },
  common: { close: 'Закрыть', synthetic: 'Синтетическое превью' },
};
