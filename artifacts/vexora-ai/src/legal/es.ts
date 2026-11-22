import type { LegalContent } from './types';

export const es: LegalContent = {
  terms: {
    intro: 'Estos términos regulan el uso de {brand}. Al crear una cuenta o usar el servicio, los aceptas.',
    sections: [
      { h: 'El servicio', p: ['{brand} te permite generar imágenes y vídeos cortos con modelos de IA. Los resultados se crean automáticamente y pueden ser inexactos, inesperados o parecidos a los de otros usuarios.'] },
      { h: 'Tu cuenta', p: ['Debes tener al menos 18 años o contar con permiso de un padre, madre o tutor. Protege tu contraseña: eres responsable de la actividad de tu cuenta.'] },
      { h: 'Créditos y pagos', p: ['Las generaciones consumen créditos. Los precios se muestran antes de pagar, en la moneda que elijas. Los créditos del plan se añaden al inicio de cada periodo de facturación; los paquetes de créditos comprados no caducan.', 'Los créditos no tienen valor monetario y no se pueden transferir. Los pagos los procesa nuestro proveedor de pagos; nunca vemos ni guardamos los datos completos de tu tarjeta.'] },
      { h: 'Uso aceptable', p: ['No crees contenido ilegal, que sexualice a menores, que acose o que infrinja derechos ajenos. No crees imágenes o vídeos realistas de personas reales sin su consentimiento ni uses los resultados para engañar.', 'Podemos retirar contenido y suspender cuentas que incumplan estas normas.'] },
      { h: 'Tu contenido', p: ['Conservas los derechos sobre tus prompts y, en la medida que permita la ley, sobre tus resultados. Nos permites guardarlos y procesarlos para prestar el servicio. En los planes de pago puedes usar los resultados con fines comerciales, conforme a estos términos y a la ley.'] },
      { h: 'Responsabilidad', p: ['El servicio se ofrece “tal cual”. En la medida que permita la ley, {owner} no responde de daños indirectos ni del uso que se haga de los resultados.'] },
      { h: 'Cambios y ley aplicable', p: ['Podemos actualizar estos términos; la fecha de arriba indica la versión vigente. Se rigen por las leyes de {country}.'] },
    ],
  },
  privacy: {
    intro: 'Esta política explica qué datos recoge {brand} y por qué.',
    sections: [
      { h: 'Qué recogemos', p: ['Datos de la cuenta (correo, nombre y tu contraseña guardada como hash seguro), tus prompts y resultados, registros de pago (importe, moneda, estado) y registros técnicos básicos como la IP y el navegador. Los datos de la tarjeta los gestiona el proveedor de pagos, no nosotros.'] },
      { h: 'Para qué los usamos', p: ['Para gestionar tu cuenta y tus generaciones, procesar pagos y reembolsos, evitar abusos y mejorar el servicio.'] },
      { h: 'Cookies y almacenamiento', p: ['Usamos una sola cookie esencial para mantener tu sesión. Tu navegador también recuerda tu idioma y moneda. No usamos cookies publicitarias.'] },
      { h: 'Con quién los compartimos', p: ['Solo con servicios que hacen funcionar {brand}: alojamiento, el proveedor de pagos y los proveedores de modelos de IA que procesan tus prompts. No vendemos datos personales.'] },
      { h: 'Cuánto tiempo los guardamos', p: ['Los datos de la cuenta se guardan mientras esté activa. Los registros de pago, el tiempo que exija la normativa contable.'] },
      { h: 'Tus derechos', p: ['Puedes pedir una copia de tus datos, su corrección o la eliminación de tu cuenta escribiendo a {email}.'] },
    ],
  },
  refunds: {
    intro: 'Esta política explica cuándo puedes recuperar tu dinero o tus créditos.',
    sections: [
      { h: 'Generaciones fallidas o canceladas', p: ['Si una generación falla o la cancelas antes de que termine, sus créditos vuelven a tu saldo automáticamente.'] },
      { h: 'Paquetes de créditos', p: ['Puedes pedir un reembolso en los 14 días siguientes a la compra si no has usado ningún crédito del paquete.'] },
      { h: 'Planes', p: ['Puedes cancelar un plan cuando quieras; seguirá activo hasta el final del periodo pagado. Los periodos usados en parte no se reembolsan salvo que la ley lo exija.'] },
      { h: 'Cómo solicitarlo', p: ['Escribe a {email} con el correo de tu cuenta y la fecha del pago. Los reembolsos aprobados vuelven al método de pago original; el plazo depende de tu banco.'] },
      { h: 'Efecto en los créditos', p: ['Cuando se reembolsa un pago, los créditos que añadió se descuentan de tu saldo.'] },
    ],
  },
  contact: {
    intro: '¿Tienes dudas sobre tu cuenta, un pago o estas políticas? Escríbenos.',
    sections: [
      { h: 'Correo electrónico', p: ['{email}', 'Solemos responder en 2 días hábiles.'] },
      { h: 'Responsable del servicio', p: ['{owner}, {country}'] },
    ],
  },
};
