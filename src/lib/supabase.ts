import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only throw error if we are NOT in a build environment
// This allows the build to pass even if env vars are missing
if (!supabaseUrl || !supabaseAnonKey) {
	if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
		console.warn('Supabase env vars missing during build/server init');
	} else {
		throw new Error('Missing Supabase environment variables');
	}
}

export const supabase = (supabaseUrl && supabaseAnonKey)
	? createClient(supabaseUrl, supabaseAnonKey)
	: ({} as ReturnType<typeof createClient>);

/**
 * Save trading signal to database
 */
export const saveSignal = async (signal: any): Promise<void> => {
	const { error } = await supabase.from('trading_signals').insert([signal]);

	if (error) {
		console.error('Failed to save signal:', error);
		throw new Error(`Failed to save signal: ${error.message}`);
	}
};
