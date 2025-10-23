import { inngest } from '@/lib/inngest';
import { getTopCoinsByAltRank } from '@/lib/lunarcrush';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		// Always fetch top 10 as candidates (we'll select best 3 with complete data)
		const candidateCount = 10;

		// Generate unique job ID
		const jobId = `job_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`;

		// Fetch top 10 coins by AltRank as candidates
		console.log(`Fetching top ${candidateCount} coins by AltRank as candidates...`);
		const topCoins = await getTopCoinsByAltRank(candidateCount);
		console.log(`Got ${topCoins.length} candidate coins:`, topCoins.map(c => c.symbol));

		// Prepare event data for Inngest (pass full coin objects)
		const eventData = {
			jobId: jobId,
			topCoins: topCoins, // Pass complete coin data (no lookups needed)
			timestamp: Date.now(),
			triggerType: 'manual',
		};

		// Send event to Inngest
		const eventId = await inngest.send({
			name: 'trading.analyze',
			data: eventData,
		});

		return NextResponse.json({
			success: true,
			jobId: jobId,
			eventId: eventId,
			symbols: topCoins.map(c => c.symbol),
			message: `Analysis job queued for top ${topCoins.length} coins by AltRank`,
		});
	} catch (error) {
		console.error('Failed to trigger analysis:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to queue processing job',
			},
			{ status: 500 }
		);
	}
}

export async function GET() {
	return NextResponse.json({
		status: 'Trading Analysis API',
		endpoints: {
			POST: 'Trigger new analysis job',
		},
	});
}
