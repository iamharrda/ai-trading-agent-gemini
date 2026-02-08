import { inngest } from '@/lib/inngest';
import { getTopCoinsByAltRank } from '@/lib/lunarcrush';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
	const requestId = crypto.randomUUID();
	const startTime = Date.now();

	try {
		console.log(`[API] POST /api/trigger - Request received`, { requestId });

		const body = await request.json();
		// Always fetch top 10 as candidates (we'll select best 3 with complete data)
		const candidateCount = 10;

		// Generate unique job ID
		const jobId = `job_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`;

		console.log(`[API] Job initialized`, { requestId, jobId, candidateCount });

		// Fetch top 10 coins by AltRank as candidates
		console.log(`[API] Fetching top ${candidateCount} coins by AltRank...`, { requestId, jobId });
		const topCoins = await getTopCoinsByAltRank(candidateCount);

		console.log(`[API] Candidate coins fetched`, {
			requestId,
			jobId,
			count: topCoins.length,
			symbols: topCoins.map(c => c.symbol)
		});

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

		const duration = Date.now() - startTime;
		console.log(`[API] Job successfully queued`, {
			requestId,
			jobId,
			eventId,
			durationMs: duration
		});

		return NextResponse.json({
			success: true,
			jobId: jobId,
			eventId: eventId,
			symbols: topCoins.map(c => c.symbol),
			message: `Analysis job queued for top ${topCoins.length} coins by AltRank`,
		});
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`[API] Failed to trigger analysis`, {
			requestId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			durationMs: duration
		});

		return NextResponse.json(
			{
				success: false,
				error: 'Failed to queue processing job',
				details: error instanceof Error ? error.message : undefined
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
