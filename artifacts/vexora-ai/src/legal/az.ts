import type { LegalContent } from './types';

export const az: LegalContent = {
  terms: {
    intro: 'Bu şərtlər {brand} xidmətindən istifadəni tənzimləyir. Hesab yaratmaqla və ya xidmətdən istifadə etməklə bu şərtlərlə razılaşırsan.',
    sections: [
      { h: 'Xidmət', p: ['{brand} AI modelləri ilə şəkil və qısa video yaratmağa imkan verir. Nəticələr avtomatik yaradılır və qeyri-dəqiq, gözlənilməz və ya başqa istifadəçilərin nəticələrinə bənzər ola bilər.'] },
      { h: 'Hesabın', p: ['Ən azı 18 yaşın olmalıdır və ya valideyn/qəyyumun icazəsi olmalıdır. Şifrəni qoru: hesabındakı fəaliyyətə görə sən cavabdehsən.'] },
      { h: 'Kreditlər və ödənişlər', p: ['Generasiyalar kredit sərf edir. Qiymətlər ödənişdən əvvəl seçdiyin valyutada göstərilir. Plan kreditləri hər ödəniş dövrünün əvvəlində əlavə olunur; alınmış kredit paketlərinin vaxtı bitmir.', 'Kreditlərin nağd dəyəri yoxdur və başqasına ötürülə bilməz. Ödənişləri ödəniş provayderimiz emal edir; tam kart məlumatını görmürük və saxlamırıq.'] },
      { h: 'Qadağan olunan istifadə', p: ['Qanunsuz, azyaşlıları cinsiləşdirən, insanları təhqir edən və ya başqalarının hüquqlarını pozan məzmun yaratma. Real insanların razılığı olmadan onların realistik şəkil və videolarını yaratma, nəticələrdən aldatmaq üçün istifadə etmə.', 'Bu qaydaları pozan məzmunu silə və hesabları dayandıra bilərik.'] },
      { h: 'Sənin məzmunun', p: ['Prompt-larına və qanunun icazə verdiyi qədər nəticələrə olan hüquqların səndə qalır. Xidməti işlətmək üçün onları saxlamağımıza və emal etməyimizə icazə verirsən. Ödənişli planlarda nəticələrdən bu şərtlərə və qanuna uyğun olaraq kommersiya məqsədilə istifadə edə bilərsən.'] },
      { h: 'Məsuliyyət', p: ['Xidmət “olduğu kimi” təqdim olunur. Qanunun icazə verdiyi qədər {owner} dolayı zərərlərə və nəticələrin necə istifadə olunmasına görə məsuliyyət daşımır.'] },
      { h: 'Dəyişikliklər və tətbiq olunan qanun', p: ['Bu şərtləri yeniləyə bilərik; yuxarıdakı tarix son versiyanı göstərir. Bu şərtlər {country} qanunları ilə tənzimlənir.'] },
    ],
  },
  privacy: {
    intro: 'Bu siyasət {brand}-in hansı məlumatları topladığını və niyə topladığını izah edir.',
    sections: [
      { h: 'Nə toplayırıq', p: ['Hesab məlumatları (e-poçt, ad və təhlükəsiz hash şəklində saxlanılan şifrə), prompt-ların və yaradılan nəticələr, ödəniş qeydləri (məbləğ, valyuta, status) və IP ünvanı, brauzer kimi əsas texniki loglar. Kart məlumatlarını biz yox, ödəniş provayderi emal edir.'] },
      { h: 'Nə üçün istifadə edirik', p: ['Hesabını və generasiyaları işlətmək, ödəniş və geri qaytarmaları emal etmək, sui-istifadənin qarşısını almaq və xidməti yaxşılaşdırmaq üçün.'] },
      { h: 'Cookie və yaddaş', p: ['Hesabda qalman üçün yalnız bir zəruri cookie istifadə edirik. Brauzerin həmçinin dil və valyuta seçimini yadda saxlayır. Reklam cookie-ləri istifadə etmirik.'] },
      { h: 'Kimlə paylaşırıq', p: ['Yalnız {brand}-in işləməsinə kömək edən xidmətlərlə: hostinq, ödəniş provayderi və prompt-larını emal edən AI model provayderləri. Şəxsi məlumatları satmırıq.'] },
      { h: 'Nə qədər saxlayırıq', p: ['Hesab məlumatları hesabın aktiv olduğu müddətdə saxlanılır. Ödəniş qeydləri mühasibat qanunvericiliyinin tələb etdiyi müddətdə saxlanılır.'] },
      { h: 'Hüquqların', p: ['{email} ünvanına yazaraq məlumatlarının surətini, düzəldilməsini və ya hesabının silinməsini istəyə bilərsən.'] },
    ],
  },
  refunds: {
    intro: 'Bu qaydalar pulunu və ya kreditlərini nə vaxt geri ala biləcəyini izah edir.',
    sections: [
      { h: 'Uğursuz və ya ləğv edilmiş generasiyalar', p: ['Generasiya uğursuz olarsa və ya bitməmiş onu ləğv etsən, kreditlər avtomatik balansına qayıdır.'] },
      { h: 'Kredit paketləri', p: ['Paketdən heç bir kredit istifadə etməmisənsə, alışdan sonra 14 gün ərzində geri qaytarma istəyə bilərsən.'] },
      { h: 'Planlar', p: ['Planı istənilən vaxt ləğv edə bilərsən; o, ödənilmiş dövrün sonuna qədər aktiv qalır. Qismən istifadə olunmuş dövrlər üçün qanun tələb etmirsə, pul qaytarılmır.'] },
      { h: 'Necə müraciət etmək olar', p: ['Hesabının e-poçtu və ödəniş tarixi ilə {email} ünvanına yaz. Təsdiqlənmiş geri qaytarmalar ilkin ödəniş üsuluna göndərilir; müddət bankından asılıdır.'] },
      { h: 'Kreditlərə təsiri', p: ['Ödəniş geri qaytarılanda onun əlavə etdiyi kreditlər balansından silinir.'] },
    ],
  },
  contact: {
    intro: 'Hesabın, ödəniş və ya bu qaydalarla bağlı sualın var? Bizə yaz.',
    sections: [
      { h: 'E-poçt', p: ['{email}', 'Adətən 2 iş günü ərzində cavab veririk.'] },
      { h: 'Xidməti təqdim edən', p: ['{owner}, {country}'] },
    ],
  },
};
