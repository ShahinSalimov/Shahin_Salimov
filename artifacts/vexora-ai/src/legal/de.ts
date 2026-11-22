import type { LegalContent } from './types';

export const de: LegalContent = {
  terms: {
    intro: 'Diese Bedingungen regeln die Nutzung von {brand}. Mit der Kontoerstellung oder Nutzung des Dienstes stimmst du ihnen zu.',
    sections: [
      { h: 'Der Dienst', p: ['Mit {brand} erstellst du Bilder und kurze Videos mit KI-Modellen. Ergebnisse entstehen automatisch und können ungenau, unerwartet oder den Ergebnissen anderer Nutzer ähnlich sein.'] },
      { h: 'Dein Konto', p: ['Du musst mindestens 18 Jahre alt sein oder die Erlaubnis eines Elternteils bzw. Vormunds haben. Schütze dein Passwort: Du bist für die Aktivitäten in deinem Konto verantwortlich.'] },
      { h: 'Credits und Zahlungen', p: ['Generierungen verbrauchen Credits. Preise werden vor der Zahlung in der gewählten Währung angezeigt. Plan-Credits werden zu Beginn jedes Abrechnungszeitraums gutgeschrieben; gekaufte Credit-Pakete verfallen nicht.', 'Credits haben keinen Geldwert und sind nicht übertragbar. Zahlungen wickelt unser Zahlungsanbieter ab; wir sehen und speichern keine vollständigen Kartendaten.'] },
      { h: 'Zulässige Nutzung', p: ['Erstelle keine rechtswidrigen Inhalte, keine Inhalte, die Minderjährige sexualisieren, keine belästigenden Inhalte und nichts, was Rechte Dritter verletzt. Erstelle keine realistischen Bilder oder Videos echter Personen ohne deren Einwilligung und nutze Ergebnisse nicht zur Täuschung.', 'Wir können solche Inhalte entfernen und Konten sperren, die gegen diese Regeln verstoßen.'] },
      { h: 'Deine Inhalte', p: ['Deine Rechte an Prompts und, soweit gesetzlich möglich, an Ergebnissen bleiben bei dir. Du erlaubst uns, sie zum Betrieb des Dienstes zu speichern und zu verarbeiten. In bezahlten Plänen darfst du Ergebnisse im Rahmen dieser Bedingungen und der Gesetze kommerziell nutzen.'] },
      { h: 'Haftung', p: ['Der Dienst wird „wie besehen“ bereitgestellt. Soweit gesetzlich zulässig, haftet {owner} nicht für indirekte Schäden oder für die Verwendung der Ergebnisse.'] },
      { h: 'Änderungen und anwendbares Recht', p: ['Wir können diese Bedingungen aktualisieren; das Datum oben zeigt die aktuelle Fassung. Es gilt das Recht von {country}.'] },
    ],
  },
  privacy: {
    intro: 'Diese Erklärung beschreibt, welche Daten {brand} erhebt und warum.',
    sections: [
      { h: 'Was wir erheben', p: ['Kontodaten (E-Mail, Name und dein Passwort als sicherer Hash), deine Prompts und erzeugten Ergebnisse, Zahlungsdaten (Betrag, Währung, Status) sowie grundlegende technische Protokolle wie IP-Adresse und Browser. Kartendaten verarbeitet der Zahlungsanbieter, nicht wir.'] },
      { h: 'Zahlungssicherheit', p: ['Kartendaten werden nur auf der sicheren Seite der Bank oder eines lizenzierten Zahlungsanbieters eingegeben und nach dem Sicherheitsstandard der Kartenorganisationen (PCI DSS) verarbeitet. {brand} sieht, erhält und speichert weder Kartennummer noch Ablaufdatum oder CVV. Wir speichern nur Bestellnummer, Betrag, Währung und Zahlungsstatus.'] },
      { h: 'Wozu wir sie nutzen', p: ['Um dein Konto und deine Generierungen bereitzustellen, Zahlungen und Erstattungen abzuwickeln, Missbrauch zu verhindern und den Dienst zu verbessern.'] },
      { h: 'Cookies und Speicher', p: ['Wir verwenden ein einziges notwendiges Cookie, damit du angemeldet bleibst. Dein Browser merkt sich außerdem Sprache und Währung. Werbe-Cookies verwenden wir nicht.'] },
      { h: 'Weitergabe', p: ['Nur an Dienste, die den Betrieb von {brand} ermöglichen: Hosting, den Zahlungsanbieter und die KI-Modellanbieter, die deine Prompts verarbeiten. Wir verkaufen keine personenbezogenen Daten.'] },
      { h: 'Speicherdauer', p: ['Kontodaten speichern wir, solange dein Konto aktiv ist. Zahlungsdaten so lange, wie es die Buchhaltungsvorschriften verlangen.'] },
      { h: 'Deine Rechte', p: ['Du kannst unter {email} eine Kopie deiner Daten, deren Berichtigung oder die Löschung deines Kontos verlangen.'] },
    ],
  },
  refunds: {
    intro: 'Diese Richtlinie erklärt, wann du Geld oder Credits zurückbekommst.',
    sections: [
      { h: 'Digitale Leistung', p: ['Da Credits sofort nach der Zahlung bereitgestellt werden, wird ein Kauf, dessen Credits bereits genutzt wurden, nicht erstattet, sofern das Gesetz nichts anderes vorschreibt.'] },
      { h: 'Fehlgeschlagene oder abgebrochene Generierungen', p: ['Schlägt eine Generierung fehl oder brichst du sie vor dem Ende ab, gehen die Credits automatisch auf dein Guthaben zurück.'] },
      { h: 'Credit-Pakete', p: ['Du kannst innerhalb von 14 Tagen nach dem Kauf eine Erstattung verlangen, wenn du noch keine Credits aus dem Paket genutzt hast.'] },
      { h: 'Pläne', p: ['Du kannst einen Plan jederzeit kündigen; er bleibt bis zum Ende des bezahlten Zeitraums aktiv. Teilweise genutzte Zeiträume werden nicht erstattet, sofern das Gesetz es nicht verlangt.'] },
      { h: 'So beantragst du eine Erstattung', p: ['Schreibe an {email} mit der E-Mail deines Kontos und dem Zahlungsdatum. Genehmigte Erstattungen gehen an die ursprüngliche Zahlungsmethode; die Dauer hängt von deiner Bank ab.'] },
      { h: 'Auswirkung auf Credits', p: ['Wird eine Zahlung erstattet, werden die damit gutgeschriebenen Credits von deinem Guthaben abgezogen.'] },
    ],
  },
  delivery: {
    intro: '{brand} ist ein digitaler Dienst. Es wird nichts physisch versendet: Gekaufte Credits und Pläne werden deinem Konto online gutgeschrieben.',
    sections: [
      { h: 'Wann du sie erhältst', p: ['Credits und Pläne werden automatisch gutgeschrieben, meist innerhalb einer Minute, nachdem die Bank die Zahlung bestätigt hat. Das neue Guthaben siehst du oben auf der Seite und in deinem Profil.'] },
      { h: 'So funktioniert es', p: ['Nach der Zahlung auf der sicheren Zahlungsseite benachrichtigt der Zahlungsanbieter unseren Server. Der Server prüft die Nachricht und den Betrag und schreibt dann die Credits gut. Du wirst zu einer Bestätigungsseite mit deiner Bestellnummer weitergeleitet.'] },
      { h: 'Wenn keine Credits erscheinen', p: ['Wurde deine Karte belastet, aber nach 30 Minuten sind keine Credits sichtbar, schreib mit deiner Bestellnummer an {email}. Wir schreiben die Credits gut oder erstatten die Zahlung.'] },
      { h: 'Nutzung des Dienstes', p: ['Credits werden beim Erstellen von Bildern und Videos verbraucht. Ergebnisse erscheinen im Studio und in deinem Profil und können heruntergeladen werden.'] },
      { h: 'Verfügbarkeit', p: ['Der Dienst ist rund um die Uhr verfügbar, außer bei Wartungsarbeiten. Die Generierungsdauer hängt vom Modell und der Auslastung ab.'] },
    ],
  },
  contact: {
    intro: 'Fragen zu deinem Konto, einer Zahlung oder diesen Richtlinien? Schreib uns.',
    sections: [
      { h: 'Antwortzeit', p: ['Wir antworten in der Regel innerhalb von 2 Werktagen.'] },
    ],
  },
};
