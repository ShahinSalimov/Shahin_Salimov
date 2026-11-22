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
      { h: 'Seguridad de los pagos', p: ['Los datos de la tarjeta solo se introducen en la página segura del banco o de un proveedor de pagos autorizado, que los trata conforme al estándar de seguridad de las marcas de tarjetas (PCI DSS). {brand} nunca ve, recibe ni guarda el número de tu tarjeta, la fecha de caducidad ni el CVV. Solo guardamos el número de pedido, el importe, la moneda y el estado del pago.'] },
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
      { h: 'Servicio digital', p: ['Como los créditos se entregan inmediatamente después del pago, una compra cuyos créditos ya se han usado no se reembolsa, salvo que la ley exija lo contrario.'] },
      { h: 'Generaciones fallidas o canceladas', p: ['Si una generación falla o la cancelas antes de que termine, sus créditos vuelven a tu saldo automáticamente.'] },
      { h: 'Paquetes de créditos', p: ['Puedes pedir un reembolso en los 14 días siguientes a la compra si no has usado ningún crédito del paquete.'] },
      { h: 'Planes', p: ['Puedes cancelar un plan cuando quieras; seguirá activo hasta el final del periodo pagado. Los periodos usados en parte no se reembolsan salvo que la ley lo exija.'] },
      { h: 'Cómo solicitarlo', p: ['Escribe a {email} con el correo de tu cuenta y la fecha del pago. Los reembolsos aprobados vuelven al método de pago original; el plazo depende de tu banco.'] },
      { h: 'Efecto en los créditos', p: ['Cuando se reembolsa un pago, los créditos que añadió se descuentan de tu saldo.'] },
    ],
  },
  delivery: {
    intro: '{brand} es un servicio digital. No se envía nada físico: los créditos y planes que compras se añaden a tu cuenta en línea.',
    sections: [
      { h: 'Cuándo lo recibes', p: ['Los créditos y planes se añaden automáticamente, normalmente en menos de un minuto después de que el banco confirme el pago. Verás el nuevo saldo en la parte superior de la página y en tu perfil.'] },
      { h: 'Cómo funciona', p: ['Tras pagar en la página de pago segura, el proveedor de pagos avisa a nuestro servidor. El servidor comprueba el aviso y el importe y añade los créditos. Se te redirige a una página de confirmación con tu número de pedido.'] },
      { h: 'Si no aparecen los créditos', p: ['Si se te ha cobrado pero los créditos no aparecen en 30 minutos, escribe a {email} con tu número de pedido. Añadiremos los créditos o reembolsaremos el pago.'] },
      { h: 'Uso del servicio', p: ['Los créditos se gastan al generar imágenes y vídeos. Los resultados aparecen en el estudio y en tu perfil, y se pueden descargar.'] },
      { h: 'Disponibilidad', p: ['El servicio funciona las 24 horas, salvo durante el mantenimiento. El tiempo de generación depende del modelo y de la carga.'] },
    ],
  },
  contact: {
    intro: '¿Tienes dudas sobre tu cuenta, un pago o estas políticas? Escríbenos.',
    sections: [
      { h: 'Tiempo de respuesta', p: ['Solemos responder en 2 días hábiles.'] },
    ],
  },
};
