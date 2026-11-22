import type { LegalContent } from './types';

export const tr: LegalContent = {
  terms: {
    intro: 'Bu koşullar {brand} kullanımını düzenler. Hesap oluşturarak veya hizmeti kullanarak bu koşulları kabul etmiş olursun.',
    sections: [
      { h: 'Hizmet', p: ['{brand}, yapay zekâ modelleriyle görsel ve kısa video oluşturmanı sağlar. Çıktılar otomatik üretilir; hatalı, beklenmedik veya başka kullanıcıların çıktılarına benzer olabilir.'] },
      { h: 'Hesabın', p: ['En az 18 yaşında olmalı ya da ebeveyn/vasi izni almalısın. Şifreni koru: hesabındaki etkinlikten sen sorumlusun.'] },
      { h: 'Krediler ve ödemeler', p: ['Üretimler kredi harcar. Fiyatlar ödeme öncesinde seçtiğin para biriminde gösterilir. Plan kredileri her fatura döneminin başında eklenir; satın alınan kredi paketlerinin süresi dolmaz.', 'Kredilerin nakit değeri yoktur ve devredilemez. Ödemeler ödeme sağlayıcımız tarafından işlenir; kart bilgilerinin tamamını görmeyiz ve saklamayız.'] },
      { h: 'Kabul edilebilir kullanım', p: ['Yasa dışı, reşit olmayanları cinselleştiren, taciz içeren veya başkalarının haklarını ihlal eden içerik oluşturma. Gerçek kişilerin rızası olmadan gerçekçi görsel veya videolarını oluşturma, çıktıları aldatmak için kullanma.', 'Bu kuralları ihlal eden içeriği kaldırabilir ve hesapları askıya alabiliriz.'] },
      { h: 'İçeriğin', p: ['Prompt’ların ve yasaların izin verdiği ölçüde çıktıların üzerindeki hakların sende kalır. Hizmeti çalıştırmak için bunları saklamamıza ve işlememize izin verirsin. Ücretli planlarda çıktıları bu koşullara ve yasalara uygun olarak ticari amaçla kullanabilirsin.'] },
      { h: 'Sorumluluk', p: ['Hizmet “olduğu gibi” sunulur. Yasaların izin verdiği ölçüde {owner}, dolaylı zararlardan veya çıktıların nasıl kullanıldığından sorumlu değildir.'] },
      { h: 'Değişiklikler ve uygulanacak hukuk', p: ['Bu koşulları güncelleyebiliriz; üstteki tarih son sürümü gösterir. Bu koşullar {country} yasalarına tabidir.'] },
    ],
  },
  privacy: {
    intro: 'Bu politika {brand}’in hangi verileri neden topladığını açıklar.',
    sections: [
      { h: 'Ne topluyoruz', p: ['Hesap verileri (e-posta, ad ve güvenli hash olarak saklanan şifre), prompt’ların ve üretilen çıktılar, ödeme kayıtları (tutar, para birimi, durum) ve IP adresi, tarayıcı gibi temel teknik kayıtlar. Kart bilgileri bizim tarafımızdan değil, ödeme sağlayıcısı tarafından işlenir.'] },
      { h: 'Neden kullanıyoruz', p: ['Hesabını ve üretimlerini çalıştırmak, ödemeleri ve iadeleri işlemek, kötüye kullanımı önlemek ve hizmeti geliştirmek için.'] },
      { h: 'Çerezler ve depolama', p: ['Oturumunu açık tutmak için yalnızca bir zorunlu çerez kullanırız. Tarayıcın dil ve para birimi tercihini de hatırlar. Reklam çerezi kullanmayız.'] },
      { h: 'Kimlerle paylaşıyoruz', p: ['Yalnızca {brand}’in çalışmasına yardım eden hizmetlerle: barındırma, ödeme sağlayıcısı ve prompt’larını işleyen yapay zekâ model sağlayıcıları. Kişisel veri satmayız.'] },
      { h: 'Ne kadar saklıyoruz', p: ['Hesap verileri hesabın aktif olduğu sürece saklanır. Ödeme kayıtları muhasebe mevzuatının gerektirdiği süre boyunca saklanır.'] },
      { h: 'Hakların', p: ['{email} adresine yazarak verilerinin bir kopyasını, düzeltilmesini veya hesabının silinmesini isteyebilirsin.'] },
    ],
  },
  refunds: {
    intro: 'Bu politika paranı veya kredilerini ne zaman geri alabileceğini açıklar.',
    sections: [
      { h: 'Başarısız veya iptal edilen üretimler', p: ['Bir üretim başarısız olursa veya bitmeden iptal edersen, kredileri otomatik olarak bakiyene döner.'] },
      { h: 'Kredi paketleri', p: ['Paketten hiç kredi kullanmadıysan satın alımdan sonraki 14 gün içinde iade isteyebilirsin.'] },
      { h: 'Planlar', p: ['Planını istediğin zaman iptal edebilirsin; ödenen dönemin sonuna kadar aktif kalır. Kısmen kullanılan dönemler, yasa gerektirmedikçe iade edilmez.'] },
      { h: 'Nasıl talep edilir', p: ['Hesap e-postan ve ödeme tarihiyle {email} adresine yaz. Onaylanan iadeler ilk ödeme yöntemine gönderilir; süre bankana bağlıdır.'] },
      { h: 'Krediler üzerindeki etkisi', p: ['Bir ödeme iade edildiğinde, eklediği krediler bakiyenden düşülür.'] },
    ],
  },
  contact: {
    intro: 'Hesabın, bir ödeme veya bu politikalar hakkında sorun mu var? Bize yaz.',
    sections: [
      { h: 'E-posta', p: ['{email}', 'Genellikle 2 iş günü içinde yanıt veririz.'] },
      { h: 'Hizmet sağlayıcı', p: ['{owner}, {country}'] },
    ],
  },
};
