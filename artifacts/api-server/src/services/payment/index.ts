import { paymentConfig, type GatewayId } from './config';
import { sandboxGateway } from './gateways/sandbox';
import { epointGateway } from './gateways/epoint';
import { payriffGateway } from './gateways/payriff';
import type { PaymentGateway } from './types';

/** To add a bank's acquiring: implement PaymentGateway in gateways/<bank>.ts and register it here. */
const GATEWAYS: Record<GatewayId, PaymentGateway> = { sandbox: sandboxGateway, epoint: epointGateway, payriff: payriffGateway };

export const activeGateway = (): PaymentGateway | null => (paymentConfig.enabled ? GATEWAYS[paymentConfig.gateway] : null);
export const gatewayById = (id: string): PaymentGateway | undefined => GATEWAYS[id as GatewayId];

export { paymentConfig, validatePaymentConfig } from './config';
export { sandboxGateway };
export type { PaymentGateway } from './types';
