import { inngest } from '@/lib/inngest';
import { generateSignalForSymbol } from '@/lib/signal-generator';
import { getSocialMetrics } from '@/lib/lunarcrush';
import { generateTradingSignal } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import type { TradingSignal } from '@/types/trading';

/**
 * Main trading signal analysis workflow
 * Processes social metrics and generates AI-powered trading signals
 */
export const signalAnalysisWorkflow = inngest.createFunction(
	{ id: 'signal-analysis-workflow' },
	{ event: 'trading.analyze' },
	async ({ event, step }) => {
		const startTime = Date.now();
		const jobId = event.data.jobId;

		if (!jobId) {
			throw new Error('No job ID provided in event data');
		}

		const updateProgress = async (
			stepNumber: number,
			stepName: string,
			stepMessage: string,
			status: string = 'started'
		) => {
			const progressPercentage = Math.round((stepNumber / 7) * 100);

			const updateData = {
				current_step: stepName,
				step_message: stepMessage,
				progress_percentage: progressPercentage,
				status: status,
				updated_at: new Date().toISOString(),
			};

			try {
				const { error } = await supabase
					.from('analysis_jobs')
					.update(updateData)
					.eq('id', jobId)
					.select();

				if (error) {
					console.error(`Failed to update progress for job ${jobId}:`, error);
				}
			} catch (error) {
				console.error('Exception during progress update:', error);
			}
		};

		// Step 1: Initialize analysis job
		await step.run('initialize-job', async () => {
			const jobData = {
				id: jobId,
				status: 'started',
				current_step: 'Initializing Analysis',
				step_message: 'Setting up trading analysis pipeline...',
				progress_percentage: 14,
				event_data: event.data,
				started_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};

			const { data, error } = await supabase
				.from('analysis_jobs')
				.insert(jobData)
				.select();

			if (error) {
				console.error('Job creation failed:', error);
				throw error;
			}

			return jobId;
		});

		// Step 2 & 3 Combined: Select coins with complete data AND fetch metrics
		const socialMetrics = await step.run('select-and-fetch-data', async () => {
			await updateProgress(
				2,
				'Selecting Best Coins',
				'Testing top 10 candidates for complete social data...'
			);

			// Get candidate coins from trigger endpoint
			const candidateCoins = event.data.topCoins || [];

			if (candidateCoins.length === 0) {
				throw new Error('No candidate coins provided');
			}

			console.log(`Testing ${candidateCoins.length} candidate coins for data availability...`);

			// Test each coin and collect those with complete data
			const results = [];

			for (const coin of candidateCoins) {
				// Stop once we have 3 coins with complete data
				if (results.length >= 3) break;

				try {
					await updateProgress(
						2,
						'Testing Coin Data',
						`Checking ${coin.symbol} (${results.length + 1}/3 found)...`
					);

					// Fetch social metrics
					const metrics = await getSocialMetrics(coin);

					// Check if we got real data (not all zeros)
					if (metrics.mentions > 0 || metrics.interactions > 0 || metrics.creators > 0) {
						console.log(`✅ ${coin.symbol} has complete data - selected!`, {
							mentions: metrics.mentions,
							interactions: metrics.interactions,
							creators: metrics.creators
						});
						results.push({ symbol: coin.symbol, metrics, success: true });
					} else {
						console.log(`⚠️ ${coin.symbol} has no social data - skipping (all zeros)`);
					}
				} catch (error) {
					console.log(`❌ ${coin.symbol} failed data check - skipping`, error);
				}
			}

			if (results.length === 0) {
				throw new Error('No coins with complete social data found in top 10');
			}

			const selectedSymbols = results.map((r: any) => r.symbol).join(', ');

			await updateProgress(
				3,
				'Selection Complete',
				`Selected ${results.length} coins with complete metrics: ${selectedSymbols}`
			);

			return results;
		});

		// Step 4: Generate AI trading signals (PARALLEL - much faster!)
		const tradingSignals = await step.run('generate-ai-signals', async () => {
			await updateProgress(
				4,
				'AI Signal Generation',
				'Google Gemini analyzing all coins in parallel...'
			);

			const successfulMetrics = socialMetrics.filter(
				(result) => result.success && result.metrics
			);

			// Generate ALL signals in parallel instead of sequential
			// Skip historical metrics for speed - current data is sufficient for 3 coins
			const signalPromises = successfulMetrics.map((result) =>
				generateTradingSignal(result.symbol, result.metrics!, undefined)
					.catch((error) => {
						console.error(`AI analysis failed for ${result.symbol}:`, error);
						return null;
					})
			);

			// Wait for all signals to complete simultaneously
			const signals = (await Promise.all(signalPromises)).filter(
				(s): s is TradingSignal => s !== null
			);

			await updateProgress(
				4,
				'AI Analysis Complete',
				`Generated ${signals.length} trading signals with confidence scores`
			);

			return signals;
		});

		// Step 5: Save signals to database
		const savedSignals = await step.run('save-to-database', async () => {
			await updateProgress(
				5,
				'Saving Results',
				`Storing ${tradingSignals.length} trading signals in database...`
			);

			const saveResults = [];

			for (let i = 0; i < tradingSignals.length; i++) {
				const signal = tradingSignals[i];
				try {
					const { error } = await supabase.from('trading_signals').insert({
						id: signal.id,
						symbol: signal.symbol,
						signal: signal.signal,
						confidence: signal.confidence,
						reasoning: signal.reasoning,
						metrics: signal.metrics,
						created_at: signal.createdAt,
					});

					if (error) throw error;

					saveResults.push({ symbol: signal.symbol, success: true });

					await updateProgress(
						5,
						'Saving Results',
						`Saved ${i + 1}/${tradingSignals.length} signals to database...`
					);
				} catch (error) {
					console.error(`Failed to save signal for ${signal.symbol}:`, error);
					saveResults.push({ symbol: signal.symbol, success: false });
				}
			}

			return saveResults;
		});

		// Step 6: Generate analysis summary
		const summary = await step.run('generate-summary', async () => {
			await updateProgress(
				6,
				'Generating Summary',
				'Creating analysis summary and preparing notifications...'
			);

			const highConfidenceSignals = tradingSignals.filter(
				(s) => s.confidence >= 70
			);
			const buySignals = tradingSignals.filter((s) => s.signal === 'BUY');
			const sellSignals = tradingSignals.filter((s) => s.signal === 'SELL');

			const summary = {
				totalAnalyzed: tradingSignals.length,
				highConfidence: highConfidenceSignals.length,
				distribution: {
					BUY: buySignals.length,
					SELL: sellSignals.length,
					HOLD: tradingSignals.filter((s) => s.signal === 'HOLD').length,
				},
				topSignals: tradingSignals
					.sort((a, b) => b.confidence - a.confidence)
					.slice(0, 3)
					.map((s) => ({
						symbol: s.symbol,
						signal: s.signal,
						confidence: s.confidence,
						altRank: s.metrics.altRank,
					})),
			};

			return summary;
		});

		// Step 7: Complete analysis
		await step.run('complete-job', async () => {
			const duration = Date.now() - startTime;

			await updateProgress(
				7,
				'Analysis Complete',
				`Generated ${tradingSignals.length} trading signals.`,
				'completed'
			);

			// Update final job statistics
			try {
				const { error } = await supabase
					.from('analysis_jobs')
					.update({
						signals_generated: tradingSignals.length,
						alerts_generated: summary.highConfidence,
						duration_ms: duration,
						completed_at: new Date().toISOString(),
					})
					.eq('id', jobId)
					.select();

				if (error) {
					console.error('Failed to update final job statistics:', error);
				}
			} catch (error) {
				console.error('Exception updating final job statistics:', error);
			}
		});

		return {
			success: true,
			jobId,
			duration: Date.now() - startTime,
			symbolsAnalyzed: tradingSignals.length,
			summary,
		};
	}
);

/**
 * Analyze a single cryptocurrency symbol
 */
export const analyzeSingleSymbol = inngest.createFunction(
	{ id: 'analyze-single-symbol' },
	{ event: 'trading.analyze.symbol' },
	async ({ event, step }) => {
		const { symbol } = event.data;

		const result = await step.run('analyze-symbol', async () => {
			return await generateSignalForSymbol(symbol);
		});

		return result;
	}
);
