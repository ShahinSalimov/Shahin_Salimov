import type { Messages } from "./en";

export const tr: Messages = {
  common: {
    appName: "CHANGEMESH",
    tagline: "Her değişiklik. Her bağlantı. Tek kontrol merkezi.",
    signIn: "Giriş yap",
    signUp: "Hesap oluştur",
    signOut: "Çıkış yap",
    tryDemo: "Demoyu keşfet",
    exitDemo: "Demodan çık",
    email: "E-posta",
    password: "Şifre",
    fullName: "Ad soyad",
    continue: "Devam et",
    or: "veya",
  },
  demo: {
    banner: "Demo modu — kurgusal örnek veriler. Burada yaptığınız hiçbir şey kaydedilmez veya gönderilmez.",
    createAccount: "Gerçek hesap oluştur",
  },
  auth: {
    signInTitle: "CHANGEMESH'e giriş yapın",
    signInSubtitle: "Tekrar hoş geldiniz. Devam etmek için bilgilerinizi girin.",
    signUpTitle: "Hesabınızı oluşturun",
    signUpSubtitle: "İşletme bilgilerinizin nasıl bağlantılı olduğunu haritalamaya başlayın.",
    noAccount: "Hesabınız yok mu?",
    haveAccount: "Zaten hesabınız var mı?",
    google: "Google ile devam et",
    passwordHint: "En az 10 karakter, harf ve rakam içermeli.",
    notConfiguredTitle: "Kimlik doğrulama yapılandırılmamış",
    notConfiguredBody: "Girişi etkinleştirmek için Supabase ortam değişkenlerini ayarlayın. ENVIRONMENT.md dosyasına bakın.",
  },
  onboarding: {
    title: "Organizasyonunuzu kurun",
    subtitle: "Organizasyon faturalandırmayı ve kişileri tutar. Workspace'ler varlıkları tutar — her marka, müşteri veya şube grubu için bir tane oluşturun.",
    organizationName: "Organizasyon adı",
    workspaceName: "İlk workspace adı",
    submit: "Workspace oluştur",
  },
  workspace: {
    overview: "Genel bakış",
    members: "Üyeler",
    yourRole: "Rolünüz",
    foundationNotice: "Temel aşama: varlıklar, grafik, değişiklikler ve onaylar sonraki aşamalarda gelecek.",
  },
  roles: { owner: "Sahip", admin: "Yönetici", editor: "Editör", viewer: "Görüntüleyici" },
};
