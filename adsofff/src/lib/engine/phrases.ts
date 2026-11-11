import type { Category, Language } from '../schemas';
import type { ArchetypeId } from './archetypes';

/**
 * Audience-facing copy for the local template engine.
 * Placeholders: {product} {problem} {benefit} {audience} {cta} {price}
 * Templates avoid inflecting {product} so names work in every language.
 */
export type BeatId =
  | 'hook'
  | 'problem'
  | 'reveal'
  | 'demo'
  | 'benefit'
  | 'proof'
  | 'offer'
  | 'cta'
  | 'story'
  | 'detail'
  | 'myth'
  | 'bts'
  | 'compare';

export interface LanguagePack {
  /** Average comfortable voiceover speed, words per minute. */
  wpm: number;
  hooks: Record<ArchetypeId, [string, string]>;
  messages: Record<ArchetypeId, string>;
  vo: Record<Exclude<BeatId, 'hook'>, [string, string]>;
  ost: Record<Exclude<BeatId, 'hook' | 'benefit' | 'problem' | 'cta' | 'reveal'>, [string, string]>;
  priceLine: string;
  availableNow: string;
  social: {
    whyLove: string;
    linkInBio: string;
    commentPrompt: string;
    tiktokTail: string;
    shortsTail: string;
    fbHeadline: string;
    learnMore: string;
    ctas: [string, string, string];
  };
  categoryTags: Record<Category, string[]>;
}

const en: LanguagePack = {
  wpm: 150,
  hooks: {
    problemSolution: ['Sound familiar? {problem}', 'Still putting up with this? {problem}'],
    transformation: ['Before and after. See the difference for yourself.', 'Watch what changes in just a few seconds.'],
    dayInLife: ['Here is what my day looks like with {product}.', 'Come along for a day with {product}.'],
    socialProof: ['Honest opinion? {product} changed my mind.', 'I did not expect to like {product} this much.'],
    productHero: ['Take a closer look.', 'Every detail is there for a reason.'],
    mythBusting: ['Nobody tells you this.', 'The most common mistake people make.'],
    behindScenes: ['Want to see what happens behind the scenes?', 'Let us show you how it is really made.'],
    offerCountdown: ['Heads up: this offer will not last long.', 'Stop scrolling. This deal is worth it.'],
    emotionalStory: ['Some moments matter more than anything.', 'It is the small moments we remember.'],
    comparison: ['The old way or the new way?', 'Same goal. Two very different ways.'],
    threeReasons: ['3 reasons people choose {product}.', '3 things you should know about {product}.'],
  },
  messages: {
    problemSolution: '{product} solves it simply and reliably.',
    transformation: '{product} turns the before into an after you can feel.',
    dayInLife: '{product} fits naturally into a real day.',
    socialProof: 'Real experience says more than any slogan: {product} delivers.',
    productHero: '{product} is crafted down to the last detail.',
    mythBusting: 'You do not have to settle. {product} proves it.',
    behindScenes: 'Real care goes into every {product} experience.',
    offerCountdown: 'Now is the best time to try {product}.',
    emotionalStory: '{product} is there for the moments that matter.',
    comparison: '{product} is the smarter way to get it done.',
    threeReasons: '{product} gives you clear reasons to switch.',
  },
  vo: {
    problem: ['We have all been there: {problem}', 'It happens more often than it should: {problem}'],
    reveal: ['Meet {product}.', 'That is exactly why there is {product}.'],
    demo: ['Here is how it works. Simple from the very first try.', 'Watch how easy it is.'],
    benefit: ['{benefit}.', 'And the best part? {benefit}.'],
    proof: ['Made for {audience}, and it shows.', 'Designed around what {audience} actually need.'],
    offer: ['{priceLine}', 'Available now. {cta}.'],
    cta: ['{cta}.', '{product}. {cta}.'],
    story: ['It starts like any other day.', 'Small moments make the biggest difference.'],
    detail: ['Every detail is made with care.', 'Look closer. Quality you can see.'],
    myth: ['Many people think it has to be complicated. It does not.', 'The common belief? That you have to compromise. You do not.'],
    bts: ['This is what happens behind the scenes.', 'Real people, real work, every single time.'],
    compare: ['The old way: wasted time, stress and compromise.', 'The new way: {product}.'],
  },
  ost: {
    demo: ['This easy', 'Step by step'],
    proof: ['Made for you', 'Built around you'],
    offer: ['Limited time', 'Available now'],
    story: ['Every day', 'Real moments'],
    detail: ['Look closer', 'Crafted with care'],
    myth: ['Myth', 'Fact'],
    bts: ['Behind the scenes', 'How it is made'],
    compare: ['The old way', 'The new way'],
  },
  priceLine: 'All of this for {price}.',
  availableNow: 'Available now.',
  social: {
    whyLove: 'Why you will love it:',
    linkInBio: 'Link in bio.',
    commentPrompt: 'Tell us in the comments: would you try it?',
    tiktokTail: 'Would you try it?',
    shortsTail: 'Subscribe for more.',
    fbHeadline: 'Discover {product}',
    learnMore: 'Learn more',
    ctas: ['{cta}', 'Send us a message to learn more', 'Save this post for later'],
  },
  categoryTags: {
    Restaurant: ['foodie', 'restaurant', 'foodlover', 'eatlocal'],
    Fashion: ['fashion', 'outfitideas', 'style', 'ootd'],
    Beauty: ['beauty', 'skincare', 'selfcare', 'beautytips'],
    Technology: ['tech', 'gadgets', 'productivity', 'innovation'],
    'Real Estate': ['realestate', 'newhome', 'homegoals', 'property'],
    Education: ['education', 'learning', 'studytips', 'skills'],
    Fitness: ['fitness', 'workout', 'healthylifestyle', 'training'],
    'E-commerce': ['onlineshopping', 'shopnow', 'newarrivals', 'musthave'],
    'Local Services': ['localbusiness', 'supportlocal', 'smallbusiness', 'service'],
    Other: ['smallbusiness', 'newproduct', 'discover', 'quality'],
  },
};

const az: LanguagePack = {
  wpm: 125,
  hooks: {
    problemSolution: ['Bu sizə tanış gəlir? {problem}', 'Hələ də buna dözürsünüz? {problem}'],
    transformation: ['Əvvəl və sonra. Fərqi özünüz görün.', 'Cəmi bir neçə saniyədə nəyin dəyişdiyini izləyin.'],
    dayInLife: ['{product} ilə günüm belə keçir.', 'Gəlin, {product} ilə bir günü birlikdə keçirək.'],
    socialProof: ['Səmimi fikrim? {product} məni təəccübləndirdi.', 'Açığı, bu qədər bəyənəcəyimi gözləmirdim: {product}.'],
    productHero: ['Daha yaxından baxın.', 'Hər detalın öz səbəbi var.'],
    mythBusting: ['Bunu sizə heç kim demir.', 'İnsanların ən çox etdiyi səhv.'],
    behindScenes: ['Pərdə arxasında nə baş verdiyini görmək istəyirsiniz?', 'Gəlin, bunun əslində necə hazırlandığını göstərək.'],
    offerCountdown: ['Diqqət: bu təklif uzun sürməyəcək.', 'Dayanın. Bu təklifə baxmağa dəyər.'],
    emotionalStory: ['Bəzi anlar hər şeydən dəyərlidir.', 'Yadda qalan kiçik anlardır.'],
    comparison: ['Köhnə üsul, yoxsa yeni üsul?', 'Eyni məqsəd. İki tamamilə fərqli yol.'],
    threeReasons: ['{product}: seçmək üçün 3 səbəb.', '{product} haqqında bilməli olduğunuz 3 şey.'],
  },
  messages: {
    problemSolution: '{product} bu problemi sadə və etibarlı şəkildə həll edir.',
    transformation: '{product} ilə dəyişikliyi özünüz hiss edəcəksiniz.',
    dayInLife: '{product} real həyatın ritminə təbii şəkildə uyğunlaşır.',
    socialProof: 'Real təcrübə istənilən şüardan daha çox deyir: {product} sözünün üstündədir.',
    productHero: '{product} ən kiçik detalına qədər düşünülüb.',
    mythBusting: 'Güzəştə getməyə ehtiyac yoxdur. {product} bunu sübut edir.',
    behindScenes: 'Hər addımda real əmək və diqqət var: {product}.',
    offerCountdown: 'Sınamaq üçün ən yaxşı vaxt indidir: {product}.',
    emotionalStory: '{product} vacib anlarda yanınızdadır.',
    comparison: '{product} işi görməyin daha ağıllı yoludur.',
    threeReasons: '{product} keçid etmək üçün aydın səbəblər təqdim edir.',
  },
  vo: {
    problem: ['Bu, hər birimizin başına gəlib: {problem}', 'Bu, olmalı olduğundan daha tez-tez baş verir: {problem}'],
    reveal: ['Tanış olun: {product}.', 'Məhz buna görə {product} var.'],
    demo: ['Bu belə işləyir. İlk dəfədən sadə.', 'Baxın, nə qədər asandır.'],
    benefit: ['{benefit}.', 'Ən gözəli isə? {benefit}.'],
    proof: ['{audience} üçün yaradılıb və bu, hiss olunur.', '{audience} üçün real ehtiyaclar əsasında hazırlanıb.'],
    offer: ['{priceLine}', 'İndi əlçatandır. {cta}.'],
    cta: ['{cta}.', '{product}. {cta}.'],
    story: ['Hər şey adi bir gün kimi başlayır.', 'Kiçik anlar ən böyük fərqi yaradır.'],
    detail: ['Hər detal diqqətlə hazırlanıb.', 'Yaxından baxın. Keyfiyyət görünür.'],
    myth: ['Çoxları bunun mürəkkəb olduğunu düşünür. Elə deyil.', 'Geniş yayılmış fikir? Güzəştə getməli olduğunuz. Ehtiyac yoxdur.'],
    bts: ['Pərdə arxasında bu baş verir.', 'Real insanlar, real əmək, hər dəfə.'],
    compare: ['Köhnə üsul: itirilən vaxt, stress və güzəşt.', 'Yeni üsul: {product}.'],
  },
  ost: {
    demo: ['Bu qədər asan', 'Addım-addım'],
    proof: ['Sizin üçün', 'Sizə uyğun'],
    offer: ['Məhdud müddət', 'İndi mövcuddur'],
    story: ['Hər gün', 'Real anlar'],
    detail: ['Yaxından baxın', 'Diqqətlə hazırlanıb'],
    myth: ['Mif', 'Fakt'],
    bts: ['Pərdə arxası', 'Necə hazırlanır'],
    compare: ['Köhnə üsul', 'Yeni üsul'],
  },
  priceLine: 'Bütün bunlar cəmi {price}.',
  availableNow: 'İndi əlçatandır.',
  social: {
    whyLove: 'Niyə bəyənəcəksiniz:',
    linkInBio: 'Link bio-da.',
    commentPrompt: 'Şərhlərdə yazın: sınamaq istərdinizmi?',
    tiktokTail: 'Sınamaq istərdinizmi?',
    shortsTail: 'Daha çoxu üçün abunə olun.',
    fbHeadline: '{product} ilə tanış olun',
    learnMore: 'Ətraflı öyrənin',
    ctas: ['{cta}', 'Ətraflı məlumat üçün bizə yazın', 'Bu paylaşımı yadda saxlayın'],
  },
  categoryTags: {
    Restaurant: ['restoran', 'yemək', 'dadlı', 'foodie'],
    Fashion: ['moda', 'geyim', 'stil', 'fashion'],
    Beauty: ['gözəllik', 'dəriqulluğu', 'selfcare', 'beauty'],
    Technology: ['texnologiya', 'gadget', 'tech', 'innovasiya'],
    'Real Estate': ['daşınmazəmlak', 'mənzil', 'yeniev', 'realestate'],
    Education: ['təhsil', 'kurs', 'öyrənmək', 'education'],
    Fitness: ['fitnes', 'idman', 'sağlamhəyat', 'workout'],
    'E-commerce': ['onlayndükan', 'onlaynalışveriş', 'yenimallar', 'shopping'],
    'Local Services': ['xidmət', 'yerlibiznes', 'kiçikbiznes', 'servis'],
    Other: ['kiçikbiznes', 'yeniməhsul', 'keyfiyyət', 'kəşfet'],
  },
};

const tr: LanguagePack = {
  wpm: 130,
  hooks: {
    problemSolution: ['Tanıdık geldi mi? {problem}', 'Hâlâ buna katlanıyor musunuz? {problem}'],
    transformation: ['Önce ve sonra. Farkı kendiniz görün.', 'Sadece birkaç saniyede neyin değiştiğini izleyin.'],
    dayInLife: ['{product} ile bir günüm böyle geçiyor.', 'Gelin, {product} ile bir günü birlikte geçirelim.'],
    socialProof: ['Dürüst fikrim mi? {product} beni şaşırttı.', 'Açıkçası bu kadar beğeneceğimi düşünmemiştim: {product}.'],
    productHero: ['Daha yakından bakın.', 'Her detayın bir sebebi var.'],
    mythBusting: ['Bunu size kimse söylemiyor.', 'İnsanların en sık yaptığı hata.'],
    behindScenes: ['Perde arkasında neler olduğunu görmek ister misiniz?', 'Gelin, gerçekte nasıl hazırlandığını gösterelim.'],
    offerCountdown: ['Dikkat: bu teklif uzun sürmeyecek.', 'Kaydırmayı bırakın. Bu fırsata değer.'],
    emotionalStory: ['Bazı anlar her şeyden değerlidir.', 'Akılda kalan küçük anlardır.'],
    comparison: ['Eski yol mu, yeni yol mu?', 'Aynı hedef. İki çok farklı yol.'],
    threeReasons: ['{product}: tercih etmek için 3 sebep.', '{product} hakkında bilmeniz gereken 3 şey.'],
  },
  messages: {
    problemSolution: '{product} bu sorunu basit ve güvenilir şekilde çözüyor.',
    transformation: '{product} ile değişimi kendiniz hissedeceksiniz.',
    dayInLife: '{product} gerçek hayatın ritmine doğal şekilde uyum sağlıyor.',
    socialProof: 'Gerçek deneyim her slogandan fazlasını anlatır: {product} sözünü tutuyor.',
    productHero: '{product} en küçük detayına kadar düşünüldü.',
    mythBusting: 'Ödün vermek zorunda değilsiniz. {product} bunu kanıtlıyor.',
    behindScenes: 'Her adımda gerçek emek ve özen var: {product}.',
    offerCountdown: 'Denemek için en iyi zaman şimdi: {product}.',
    emotionalStory: '{product} önemli anlarda yanınızda.',
    comparison: '{product} işi halletmenin daha akıllı yolu.',
    threeReasons: '{product} geçiş yapmak için net sebepler sunuyor.',
  },
  vo: {
    problem: ['Hepimizin başına geldi: {problem}', 'Olması gerekenden çok daha sık oluyor: {problem}'],
    reveal: ['Karşınızda: {product}.', 'İşte tam da bu yüzden {product} var.'],
    demo: ['İşte böyle çalışıyor. İlk denemeden itibaren basit.', 'Ne kadar kolay olduğunu izleyin.'],
    benefit: ['{benefit}.', 'En güzeli mi? {benefit}.'],
    proof: ['{audience} için tasarlandı ve bu hissediliyor.', '{audience} için gerçek ihtiyaçlara göre hazırlandı.'],
    offer: ['{priceLine}', 'Şimdi mevcut. {cta}.'],
    cta: ['{cta}.', '{product}. {cta}.'],
    story: ['Her şey sıradan bir gün gibi başlıyor.', 'Küçük anlar en büyük farkı yaratır.'],
    detail: ['Her detay özenle hazırlandı.', 'Yakından bakın. Kalite görünüyor.'],
    myth: ['Çoğu kişi bunun karmaşık olduğunu düşünür. Değil.', 'Yaygın inanış mı? Ödün vermeniz gerektiği. Gerekmiyor.'],
    bts: ['Perde arkasında olan bu.', 'Gerçek insanlar, gerçek emek, her seferinde.'],
    compare: ['Eski yol: kaybedilen zaman, stres ve ödün.', 'Yeni yol: {product}.'],
  },
  ost: {
    demo: ['Bu kadar kolay', 'Adım adım'],
    proof: ['Sizin için', 'Size göre'],
    offer: ['Sınırlı süre', 'Şimdi mevcut'],
    story: ['Her gün', 'Gerçek anlar'],
    detail: ['Yakından bakın', 'Özenle hazırlandı'],
    myth: ['Efsane', 'Gerçek'],
    bts: ['Perde arkası', 'Nasıl hazırlanıyor'],
    compare: ['Eski yol', 'Yeni yol'],
  },
  priceLine: 'Tüm bunlar sadece {price}.',
  availableNow: 'Şimdi mevcut.',
  social: {
    whyLove: 'Neden seveceksiniz:',
    linkInBio: 'Link biyografide.',
    commentPrompt: 'Yorumlarda yazın: denemek ister misiniz?',
    tiktokTail: 'Denemek ister misiniz?',
    shortsTail: 'Daha fazlası için abone olun.',
    fbHeadline: '{product} ile tanışın',
    learnMore: 'Daha fazla bilgi',
    ctas: ['{cta}', 'Detaylı bilgi için bize mesaj gönderin', 'Bu gönderiyi kaydedin'],
  },
  categoryTags: {
    Restaurant: ['restoran', 'yemek', 'lezzet', 'foodie'],
    Fashion: ['moda', 'stil', 'kombin', 'fashion'],
    Beauty: ['güzellik', 'ciltbakımı', 'selfcare', 'beauty'],
    Technology: ['teknoloji', 'gadget', 'tech', 'inovasyon'],
    'Real Estate': ['emlak', 'yeniev', 'konut', 'realestate'],
    Education: ['eğitim', 'kurs', 'öğrenme', 'education'],
    Fitness: ['fitness', 'spor', 'sağlıklıyaşam', 'antrenman'],
    'E-commerce': ['onlinealışveriş', 'yeniürünler', 'alışveriş', 'shopping'],
    'Local Services': ['hizmet', 'yerelişletme', 'küçükişletme', 'servis'],
    Other: ['küçükişletme', 'yeniürün', 'kalite', 'keşfet'],
  },
};

const ru: LanguagePack = {
  wpm: 130,
  hooks: {
    problemSolution: ['Знакомо? {problem}', 'Всё ещё с этим миритесь? {problem}'],
    transformation: ['До и после. Оцените разницу сами.', 'Посмотрите, что меняется всего за несколько секунд.'],
    dayInLife: ['Вот как проходит мой день с {product}.', 'Проведите со мной один день: {product} рядом.'],
    socialProof: ['Честное мнение? {product} приятно удивляет.', 'Честно? Результат превзошёл ожидания: {product}.'],
    productHero: ['Посмотрите поближе.', 'У каждой детали есть своя причина.'],
    mythBusting: ['Об этом вам никто не скажет.', 'Самая частая ошибка.'],
    behindScenes: ['Хотите заглянуть за кулисы?', 'Покажем, как всё создаётся на самом деле.'],
    offerCountdown: ['Внимание: предложение действует недолго.', 'Остановитесь. Это предложение того стоит.'],
    emotionalStory: ['Некоторые моменты важнее всего.', 'Запоминаются именно маленькие моменты.'],
    comparison: ['Старый способ или новый?', 'Одна цель. Два совершенно разных пути.'],
    threeReasons: ['{product}: 3 причины выбрать.', '{product}: 3 вещи, которые стоит знать.'],
  },
  messages: {
    problemSolution: '{product} решает эту проблему просто и надёжно.',
    transformation: 'С {product} вы почувствуете перемены сами.',
    dayInLife: '{product} естественно вписывается в реальный день.',
    socialProof: 'Реальный опыт говорит больше любого слогана: {product} держит слово.',
    productHero: '{product} продуман до мельчайших деталей.',
    mythBusting: 'Не нужно идти на компромисс. {product} это доказывает.',
    behindScenes: 'За {product} стоят реальный труд и забота.',
    offerCountdown: 'Лучшее время попробовать {product} — сейчас.',
    emotionalStory: '{product} рядом в важные моменты.',
    comparison: '{product} — более разумный способ решить задачу.',
    threeReasons: '{product} даёт понятные причины перейти.',
  },
  vo: {
    problem: ['С этим сталкивался каждый: {problem}', 'Это случается чаще, чем хотелось бы: {problem}'],
    reveal: ['Знакомьтесь: {product}.', 'Именно поэтому существует {product}.'],
    demo: ['Вот как это работает. Просто с первого раза.', 'Смотрите, как это легко.'],
    benefit: ['{benefit}.', 'А самое приятное? {benefit}.'],
    proof: ['Создано для вас: {audience}. И это чувствуется.', 'Продумано под реальные потребности: {audience}.'],
    offer: ['{priceLine}', 'Уже доступно. {cta}.'],
    cta: ['{cta}.', '{product}. {cta}.'],
    story: ['Всё начинается как обычный день.', 'Маленькие моменты меняют больше всего.'],
    detail: ['Каждая деталь сделана с заботой.', 'Посмотрите ближе. Качество видно сразу.'],
    myth: ['Многие думают, что это сложно. Это не так.', 'Распространённое мнение? Что придётся идти на компромисс. Не придётся.'],
    bts: ['Вот что происходит за кулисами.', 'Реальные люди, реальная работа, каждый раз.'],
    compare: ['Старый способ: потерянное время, стресс и компромиссы.', 'Новый способ: {product}.'],
  },
  ost: {
    demo: ['Так просто', 'Шаг за шагом'],
    proof: ['Для вас', 'Под ваши задачи'],
    offer: ['Ограниченное время', 'Уже доступно'],
    story: ['Каждый день', 'Реальные моменты'],
    detail: ['Посмотрите ближе', 'Сделано с заботой'],
    myth: ['Миф', 'Факт'],
    bts: ['За кулисами', 'Как это создаётся'],
    compare: ['Старый способ', 'Новый способ'],
  },
  priceLine: 'Всё это всего за {price}.',
  availableNow: 'Уже доступно.',
  social: {
    whyLove: 'Почему вам понравится:',
    linkInBio: 'Ссылка в профиле.',
    commentPrompt: 'Напишите в комментариях: попробовали бы?',
    tiktokTail: 'Попробуете?',
    shortsTail: 'Подписывайтесь, чтобы не пропустить новое.',
    fbHeadline: 'Знакомьтесь: {product}',
    learnMore: 'Подробнее',
    ctas: ['{cta}', 'Напишите нам, чтобы узнать подробнее', 'Сохраните этот пост'],
  },
  categoryTags: {
    Restaurant: ['ресторан', 'еда', 'вкусно', 'foodie'],
    Fashion: ['мода', 'стиль', 'образ', 'fashion'],
    Beauty: ['красота', 'уходзакожей', 'selfcare', 'beauty'],
    Technology: ['технологии', 'гаджеты', 'tech', 'инновации'],
    'Real Estate': ['недвижимость', 'новыйдом', 'квартира', 'realestate'],
    Education: ['образование', 'обучение', 'курсы', 'education'],
    Fitness: ['фитнес', 'спорт', 'здоровыйобразжизни', 'тренировка'],
    'E-commerce': ['онлайншопинг', 'новинки', 'покупки', 'shopping'],
    'Local Services': ['услуги', 'местныйбизнес', 'малыйбизнес', 'сервис'],
    Other: ['малыйбизнес', 'новинка', 'качество', 'открытие'],
  },
};

export const PACKS: Record<Language, LanguagePack> = {
  English: en,
  Azerbaijani: az,
  Turkish: tr,
  Russian: ru,
};

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '').replace(/\s{2,}/g, ' ').trim();
}
