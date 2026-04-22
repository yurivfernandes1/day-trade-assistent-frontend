/**
 * US-C1 / US-C2 — Broker client (Paper/Sandbox)
 * Em Paper mode, todas as ordens são enviadas ao sandbox Alpaca.
 * Nunca executa ordens reais; a chave real nunca deve ser usada aqui no MVP.
 */

export const BROKER_SANDBOX_URL = 'https://paper-api.alpaca.markets';

export class BrokerError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BrokerError';
    this.status = status;
  }
}

/**
 * Envia uma ordem ao broker sandbox (Alpaca Paper Trading).
 *
 * @param {{ symbol: string, side: 'buy'|'sell', qty: number, price?: number,
 *           orderType?: 'market'|'limit', apiKey: string, apiSecret: string }} params
 * @returns {Promise<{ id: string, status: string, [key: string]: unknown }>}
 * @throws {BrokerError} quando o broker rejeita a ordem
 */
export async function sendOrder({
  symbol,
  side,
  qty,
  price,
  orderType = 'market',
  apiKey,
  apiSecret,
}) {
  if (!symbol || !side || !qty || !apiKey || !apiSecret) {
    throw new BrokerError('Parâmetros obrigatórios ausentes: symbol, side, qty, apiKey, apiSecret', 400);
  }

  const body = {
    symbol,
    qty: String(qty),
    side,
    type: orderType,
    time_in_force: 'day',
  };

  if (orderType === 'limit' && price != null) {
    body.limit_price = String(price);
  }

  const response = await fetch(`${BROKER_SANDBOX_URL}/v2/orders`, {
    method: 'POST',
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Broker error: ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) message = errorBody.message;
    } catch {
      // ignora falha ao parsear corpo de erro
    }
    throw new BrokerError(message, response.status);
  }

  return response.json();
}
