// src/lib/lunarcrush.ts - LunarCrush API Client
import type { SocialMetrics } from '@/types/trading';

const BASE_URL = 'https://lunarcrush.com/api4/public';

const getApiKey = () => {
	const apiKey = process.env.LUNARCRUSH_API_KEY;
	if (!apiKey) {
		throw new Error('LUNARCRUSH_API_KEY environment variable is required');
	}
	return apiKey;
};

const makeRequest = async <T>(endpoint: string): Promise<T> => {
	const url = `${BASE_URL}${endpoint}`;

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${getApiKey()}`,
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error('Invalid API key - check your LunarCrush credentials');
			}
			if (response.status === 429) {
				throw new Error(
					'Rate limit exceeded - upgrade your plan or try again later'
				);
			}
			if (response.status >= 500) {
				throw new Error('LunarCrush API is temporarily unavailable');
			}

			throw new Error(
				`LunarCrush API Error: ${response.status} ${response.statusText}`
			);
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			console.error('LunarCrush API Error:', error.message);
			throw error;
		}
		throw new Error('Unknown error occurred while fetching LunarCrush data');
	}
};

// Response interfaces
interface CoinsListResponse {
	config: { generated: number };
	data: Array<{
		symbol: string;
		name: string;
		alt_rank: number;
		galaxy_score: number;
		price: number;
		market_cap: number;
		percent_change_24h: number;
	}>;
}

interface TopicResponse {
	config: { generated: number };
	data: {
		symbol: string;
		name: string;
		num_posts: number;
		interactions_24h: number;
		num_contributors: number;
		sentiment: number;
		social_score: number;
		price: number;
		market_cap: number;
	};
}

/**
 * Fetch comprehensive social metrics for a top coin
 * Combines pre-fetched coin data (altRank, galaxyScore) with live topic data (creators, mentions, interactions)
 */
export async function getSocialMetrics(coin: TopCoin): Promise<SocialMetrics> {
	try {
		console.log(`🔍 Fetching social metrics for: ${coin.symbol}`);

		// Only need to fetch topic data - coin data is already available
		const topicData = await fetchTopicData(coin.symbol);

		const metrics: SocialMetrics = {
			symbol: coin.symbol,
			mentions: topicData.num_posts || 0,
			interactions: topicData.interactions_24h || 0,
			creators: topicData.num_contributors || 0,
			altRank: coin.altRank,
			galaxyScore: coin.galaxyScore,
			timestamp: Date.now(),
		};

		console.log(`✅ Metrics for ${coin.symbol}:`, {
			mentions: metrics.mentions,
			interactions: metrics.interactions,
			creators: metrics.creators,
		});

		return metrics;
	} catch (error) {
		console.error(`Failed to fetch social metrics for ${coin.symbol}:`, error);
		throw error;
	}
}

/**
 * Fetch data from topic endpoint (creators, mentions, interactions)
 */
async function fetchTopicData(symbol: string): Promise<{
	num_posts: number;
	interactions_24h: number;
	num_contributors: number;
}> {
	try {
		console.log(`📡 Requesting topic data for: ${symbol} from /topic/${symbol}/v1`);
		const response = await makeRequest<TopicResponse>(`/topic/${symbol}/v1`);

		// Log full response to see what we're getting
		console.log(`📊 Full API response for ${symbol}:`, JSON.stringify(response, null, 2));

		// Validate we got actual data
		if (!response.data) {
			console.warn(`⚠️ No data object in response for ${symbol}`);
			throw new Error(`No topic data returned for ${symbol}`);
		}

		const topicData = {
			num_posts: response.data.num_posts || 0,
			interactions_24h: response.data.interactions_24h || 0,
			num_contributors: response.data.num_contributors || 0,
		};

		console.log(`✅ Parsed topic data for ${symbol}:`, topicData);

		return topicData;
	} catch (error) {
		console.error(`❌ Error fetching topic data for ${symbol}:`, error);
		console.error(`Error details:`, error instanceof Error ? error.message : 'Unknown error');
		// Return zeros but log which symbol failed
		console.warn(`⚠️ ${symbol} topic data unavailable - returning zeros`);
		return {
			num_posts: 0,
			interactions_24h: 0,
			num_contributors: 0,
		};
	}
}

/**
 * Coin data structure returned by getTopCoinsByAltRank
 */
export interface TopCoin {
	symbol: string;
	name: string;
	altRank: number;
	galaxyScore: number;
	price: number;
	marketCap: number;
	percentChange24h: number;
}

/**
 * Get top N coins sorted by AltRank
 * Returns full coin data (no need for lookups later)
 */
export async function getTopCoinsByAltRank(limit: number = 10): Promise<TopCoin[]> {
	const response = await makeRequest<CoinsListResponse>(
		`/coins/list/v1?limit=${limit}&sort=alt_rank`
	);

	// Transform API response to our coin structure
	const topCoins: TopCoin[] = response.data.map((coin) => ({
		symbol: coin.symbol.toUpperCase(),
		name: coin.name,
		altRank: coin.alt_rank,
		galaxyScore: coin.galaxy_score,
		price: coin.price,
		marketCap: coin.market_cap,
		percentChange24h: coin.percent_change_24h,
	}));

	console.log(
		`Fetched top ${limit} coins by AltRank:`,
		topCoins.map((c) => c.symbol)
	);

	return topCoins;
}

/**
 * Test LunarCrush API integration
 */
export async function testLunarCrushIntegration(): Promise<boolean> {
	try {
		// Fetch top coins
		const topCoins = await getTopCoinsByAltRank(5);

		if (topCoins.length === 0) {
			console.error('Failed to fetch top coins');
			return false;
		}

		// Test with first coin in the list
		const testCoin = topCoins[0];
		const metrics = await getSocialMetrics(testCoin);

		const hasCoinsData = metrics.altRank > 0 && metrics.galaxyScore > 0;
		const hasTopicData = metrics.mentions > 0 && metrics.interactions > 0;

		if (hasCoinsData && hasTopicData) {
			console.log('LunarCrush integration test successful');
			return true;
		} else {
			console.warn('Partial data received from LunarCrush API');
			return false;
		}
	} catch (error) {
		console.error('LunarCrush integration test failed:', error);
		return false;
	}
}
