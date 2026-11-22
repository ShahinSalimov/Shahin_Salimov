import type { LegalContent } from './types';

export const fr: LegalContent = {
  terms: {
    intro: 'Ces conditions encadrent l’utilisation de {brand}. En créant un compte ou en utilisant le service, vous les acceptez.',
    sections: [
      { h: 'Le service', p: ['{brand} permet de générer des images et de courtes vidéos avec des modèles d’IA. Les résultats sont produits automatiquement et peuvent être inexacts, inattendus ou proches de ceux d’autres utilisateurs.'] },
      { h: 'Votre compte', p: ['Vous devez avoir au moins 18 ans ou l’autorisation d’un parent ou tuteur. Protégez votre mot de passe : vous êtes responsable de l’activité de votre compte.'] },
      { h: 'Crédits et paiements', p: ['Les générations consomment des crédits. Les prix sont affichés avant le paiement, dans la devise choisie. Les crédits d’une offre sont ajoutés au début de chaque période de facturation ; les packs de crédits achetés n’expirent pas.', 'Les crédits n’ont aucune valeur monétaire et ne sont pas transférables. Les paiements sont traités par notre prestataire de paiement ; nous ne voyons ni ne conservons vos données de carte complètes.'] },
      { h: 'Utilisation acceptable', p: ['Ne créez pas de contenu illégal, sexualisant des mineurs, harcelant ou portant atteinte aux droits d’autrui. Ne créez pas d’images ou de vidéos réalistes de personnes réelles sans leur consentement et n’utilisez pas les résultats pour tromper.', 'Nous pouvons retirer ce contenu et suspendre les comptes qui enfreignent ces règles.'] },
      { h: 'Votre contenu', p: ['Vous conservez vos droits sur vos prompts et, dans la mesure permise par la loi, sur vos résultats. Vous nous autorisez à les stocker et à les traiter pour faire fonctionner le service. Avec une offre payante, vous pouvez utiliser les résultats à des fins commerciales, conformément à ces conditions et à la loi.'] },
      { h: 'Responsabilité', p: ['Le service est fourni « en l’état ». Dans la mesure permise par la loi, {owner} n’est pas responsable des dommages indirects ni de l’usage fait des résultats.'] },
      { h: 'Modifications et droit applicable', p: ['Nous pouvons mettre à jour ces conditions ; la date en haut indique la version en vigueur. Elles sont régies par le droit de {country}.'] },
    ],
  },
  privacy: {
    intro: 'Cette politique explique quelles données {brand} collecte et pourquoi.',
    sections: [
      { h: 'Ce que nous collectons', p: ['Les données du compte (e-mail, nom et mot de passe stocké sous forme de hash sécurisé), vos prompts et résultats, les enregistrements de paiement (montant, devise, statut) et des journaux techniques de base comme l’adresse IP et le navigateur. Les données de carte sont traitées par le prestataire de paiement, pas par nous.'] },
      { h: 'Pourquoi nous les utilisons', p: ['Pour faire fonctionner votre compte et vos générations, traiter paiements et remboursements, prévenir les abus et améliorer le service.'] },
      { h: 'Cookies et stockage', p: ['Nous utilisons un seul cookie essentiel pour vous garder connecté. Votre navigateur mémorise aussi votre langue et votre devise. Nous n’utilisons pas de cookies publicitaires.'] },
      { h: 'Avec qui nous les partageons', p: ['Uniquement avec les services qui font fonctionner {brand} : l’hébergement, le prestataire de paiement et les fournisseurs de modèles d’IA qui traitent vos prompts. Nous ne vendons pas de données personnelles.'] },
      { h: 'Durée de conservation', p: ['Les données du compte sont conservées tant que le compte est actif. Les enregistrements de paiement, aussi longtemps que l’exige la loi comptable.'] },
      { h: 'Vos droits', p: ['Vous pouvez demander une copie de vos données, leur rectification ou la suppression de votre compte en écrivant à {email}.'] },
    ],
  },
  refunds: {
    intro: 'Cette politique explique quand vous pouvez récupérer votre argent ou vos crédits.',
    sections: [
      { h: 'Générations échouées ou annulées', p: ['Si une génération échoue ou si vous l’annulez avant la fin, ses crédits reviennent automatiquement sur votre solde.'] },
      { h: 'Packs de crédits', p: ['Vous pouvez demander un remboursement dans les 14 jours suivant l’achat si vous n’avez utilisé aucun crédit du pack.'] },
      { h: 'Offres', p: ['Vous pouvez résilier une offre à tout moment ; elle reste active jusqu’à la fin de la période payée. Les périodes partiellement utilisées ne sont pas remboursées, sauf si la loi l’exige.'] },
      { h: 'Comment demander', p: ['Écrivez à {email} avec l’e-mail de votre compte et la date du paiement. Les remboursements acceptés reviennent sur le moyen de paiement d’origine ; le délai dépend de votre banque.'] },
      { h: 'Effet sur les crédits', p: ['Lorsqu’un paiement est remboursé, les crédits qu’il avait ajoutés sont retirés de votre solde.'] },
    ],
  },
  contact: {
    intro: 'Une question sur votre compte, un paiement ou ces politiques ? Écrivez-nous.',
    sections: [
      { h: 'E-mail', p: ['{email}', 'Nous répondons généralement sous 2 jours ouvrés.'] },
      { h: 'Exploitant', p: ['{owner}, {country}'] },
    ],
  },
};
