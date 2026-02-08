
import { testGeminiConnection } from '@/lib/gemini';
import { testLunarCrushIntegration } from '@/lib/lunarcrush';
import { testSupabaseConnection } from '@/lib/supabase';
import { testTelegramConnection } from '@/lib/telegram';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        console.log('🚀 Starting AI Trading Agent Health Checks...');

        const results = await Promise.allSettled([
            testLunarCrushIntegration().then(ok => ({ name: 'LunarCrush', ok })),
            testGeminiConnection().then(ok => ({ name: 'Google Gemini', ok })),
            testSupabaseConnection().then(ok => ({ name: 'Supabase DB', ok })),
            testTelegramConnection().then(ok => ({ name: 'Telegram Bot', ok }))
        ]);

        console.log('----------------------------------------');
        console.log('       🔌 SERVICE STATUS REPORT        ');
        console.log('----------------------------------------');

        let allHealthy = true;

        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                const { name, ok } = result.value;
                const icon = ok ? '✅' : '❌';
                const status = ok ? 'Connected' : 'FAILED';
                console.log(`${icon} ${name.padEnd(15)} : ${status}`);
                if (!ok) allHealthy = false;
            } else {
                console.log(`❌ Service Check Failed : ${result.reason}`);
                allHealthy = false;
            }
        });

        console.log('----------------------------------------');
        if (allHealthy) {
            console.log('✨ SYSTEM READY: All services operational');
        } else {
            console.warn('⚠️ SYSTEM WARNING: Some services are unreachable');
            console.warn('   Check your .env environment variables');
        }
        console.log('----------------------------------------');
    }
}
