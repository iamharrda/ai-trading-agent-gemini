import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

/**
 * Clear database - USE WITH CAUTION
 * This endpoint deletes all trading signals and analysis jobs
 */
export async function POST() {
	try {
		// Delete all trading signals
		const { error: signalsError } = await supabase
			.from('trading_signals')
			.delete()
			.neq('id', ''); // Delete all rows

		if (signalsError) {
			console.error('Error deleting signals:', signalsError);
			throw signalsError;
		}

		// Delete all analysis jobs
		const { error: jobsError } = await supabase
			.from('analysis_jobs')
			.delete()
			.neq('id', ''); // Delete all rows

		if (jobsError) {
			console.error('Error deleting jobs:', jobsError);
			throw jobsError;
		}

		return NextResponse.json({
			success: true,
			message: 'Database cleared successfully',
		});
	} catch (error) {
		console.error('Failed to clear database:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to clear database',
			},
			{ status: 500 }
		);
	}
}

export async function GET() {
	return NextResponse.json({
		message: 'Use POST to clear the database',
		warning: 'This will delete all trading signals and analysis jobs',
	});
}
