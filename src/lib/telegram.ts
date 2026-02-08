import { TradingSignal } from '@/types/trading';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message to the configured Telegram chat
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('Telegram credentials not configured. Skipping message.');
        return false;
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: text,
                    parse_mode: 'HTML',
                }),
            }
        );

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
        return false;
    }
}

/**
 * Format and send a trading signal alert to Telegram
 */
export async function sendSignalAlert(signal: TradingSignal): Promise<boolean> {
    const emoji = signal.signal === 'BUY' ? '🟢' : signal.signal === 'SELL' ? '🔴' : '⚪';

    const message = `
${emoji} <b>${signal.signal} SIGNAL: ${signal.symbol}</b>

<b>Confidence:</b> ${signal.confidence}%
<b>Reasoning:</b> ${signal.reasoning}

<b>Metrics:</b>
• AltRank: ${signal.metrics.altRank}
• Galaxy Score: ${signal.metrics.galaxyScore}
• Mentions: ${signal.metrics.mentions}

#${signal.symbol} #Crypto #TradingSignal
`;

    return sendTelegramMessage(message);
}
