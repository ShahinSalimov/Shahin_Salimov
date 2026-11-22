import type { LegalContent } from './types';

export const en: LegalContent = {
  terms: {
    intro: 'These terms govern your use of {brand}. By creating an account or using the service, you agree to them.',
    sections: [
      { h: 'The service', p: ['{brand} lets you generate images and short videos with AI models. Outputs are produced automatically and may be inaccurate, unexpected or similar to other users’ outputs.'] },
      { h: 'Your account', p: ['You must be at least 18 years old, or have permission from a parent or guardian. Keep your password safe: you are responsible for activity on your account.'] },
      { h: 'Credits and payments', p: ['Generations use credits. Prices are shown before you pay, in the currency you choose. Plan credits are added at the start of each billing period; purchased credit packs do not expire.', 'Credits have no cash value and cannot be transferred. Payments are processed by our payment provider; we never see or store your full card details.'] },
      { h: 'Acceptable use', p: ['Do not create content that is illegal, sexualises minors, harasses people or infringes others’ rights. Do not create realistic images or videos of real people without their consent, or use outputs to deceive.', 'We may remove content and suspend accounts that break these rules.'] },
      { h: 'Your content', p: ['You keep the rights you have in your prompts and, as far as the law allows, in your outputs. You allow us to store and process them to run the service. On paid plans you may use outputs commercially, subject to these terms and the law.'] },
      { h: 'Liability', p: ['The service is provided “as is”. As far as the law allows, {owner} is not liable for indirect losses or for how outputs are used.'] },
      { h: 'Changes and governing law', p: ['We may update these terms; the date at the top shows the latest version. These terms are governed by the laws of {country}.'] },
    ],
  },
  privacy: {
    intro: 'This policy explains what data {brand} collects and why.',
    sections: [
      { h: 'What we collect', p: ['Account data (email, name, and your password stored as a secure hash), your prompts and generated outputs, payment records (amount, currency, status) and basic technical logs such as IP address and browser. Card details are handled by the payment provider, not by us.'] },
      { h: 'Why we use it', p: ['To run your account and generations, process payments and refunds, prevent abuse and improve the service.'] },
      { h: 'Cookies and storage', p: ['We use one essential cookie to keep you signed in. Your browser also remembers your language and currency. We do not use advertising cookies.'] },
      { h: 'Who we share it with', p: ['Only with services that help run {brand}: hosting, the payment provider and the AI model providers that process your prompts. We do not sell personal data.'] },
      { h: 'How long we keep it', p: ['Account data is kept while your account is active. Payment records are kept as long as accounting law requires.'] },
      { h: 'Your rights', p: ['You can ask for a copy of your data, a correction, or deletion of your account by writing to {email}.'] },
    ],
  },
  refunds: {
    intro: 'This policy explains when you can get your money or credits back.',
    sections: [
      { h: 'Failed or cancelled generations', p: ['If a generation fails, or you cancel it before it finishes, its credits return to your balance automatically.'] },
      { h: 'Credit packs', p: ['You can ask for a refund within 14 days of purchase if you have not used any credits from the pack.'] },
      { h: 'Plans', p: ['You can cancel a plan at any time; it stays active until the end of the paid period. Partly used periods are not refunded unless the law requires it.'] },
      { h: 'How to ask', p: ['Email {email} with your account email and the payment date. Approved refunds go back to the original payment method; how long that takes depends on your bank.'] },
      { h: 'Effect on credits', p: ['When a payment is refunded, the credits it added are removed from your balance.'] },
    ],
  },
  contact: {
    intro: 'Questions about your account, a payment or these policies? Write to us.',
    sections: [
      { h: 'Email', p: ['{email}', 'We aim to reply within 2 business days.'] },
      { h: 'Operator', p: ['{owner}, {country}'] },
    ],
  },
};
