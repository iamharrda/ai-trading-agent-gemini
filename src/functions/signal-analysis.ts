import { inngest } from '@/lib/inngest';
import { generateSignalForSymbol } from '@/lib/signal-generator';
import { getSocialMetrics } from '@/lib/lunarcrush';
import { generateTradingSignal } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import { sendSignalAlert } from '@/lib/telegram';
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

		console.log(`[Job:${jobId}] Starting signal analysis workflow`, { eventData: event.data });

		if (!jobId) {
			const error = new Error('No job ID provided in event data');
			console.error(`[Job:Missing] Critical error:`, error);
			throw error;
		}

		const updateProgress = async (
			stepNumber: number,
			stepName: string,
			stepMessage: string,
			status: string = 'started'
		) => {
			const progressPercentage = Math.round((stepNumber / 7) * 100);

			console.log(`[Job:${jobId}] Step ${stepNumber}/7: ${stepName} - ${status}`);

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
					console.error(`[Job:${jobId}] Failed to update DB progress:`, error);
				}
			} catch (error) {
				console.error(`[Job:${jobId}] Exception during DB update:`, error);
			}
		};

		// Step 1: Initialize analysis job
		await step.run('initialize-job', async () => {
			console.log(`[Job:${jobId}] Step 1: Initializing job record`);
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
				console.error(`[Job:${jobId}] Job creation failed:`, error);
				throw error;
			}

			return jobId;
		});

		// Step 2 & 3 Combined: Select coins with complete data AND fetch metrics
		const socialMetrics = await step.run('select-and-fetch-data', async () => {
			console.log(`[Job:${jobId}] Step 2/3: Selecting coins and fetching data`);
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

			console.log(`[Job:${jobId}] Testing ${candidateCoins.length} candidate coins for data availability...`);

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
					console.debug(`[Job:${jobId}] Fetching metrics for ${coin.symbol}`);
					const metrics = await getSocialMetrics(coin);

					// Check if we got real data (not all zeros)
					if (metrics.mentions > 0 || metrics.interactions > 0 || metrics.creators > 0) {
						console.log(`[Job:${jobId}] ✅ ${coin.symbol} has complete data - selected!`, {
							mentions: metrics.mentions,
							interactions: metrics.interactions,
							creators: metrics.creators
						});
						results.push({ symbol: coin.symbol, metrics, success: true });
					} else {
						console.log(`[Job:${jobId}] ⚠️ ${coin.symbol} has no social data - skipping (all zeros)`);
					}
				} catch (error) {
					console.warn(`[Job:${jobId}] ❌ ${coin.symbol} failed data check - skipping`, error);
				}
			}

			if (results.length === 0) {
				throw new Error('No coins with complete social data found in top 10');
			}

			const selectedSymbols = results.map((r: any) => r.symbol).join(', ');

			console.log(`[Job:${jobId}] Selection complete. Selected: ${selectedSymbols}`);

			await updateProgress(
				3,
				'Selection Complete',
				`Selected ${results.length} coins with complete metrics: ${selectedSymbols}`
			);

			return results;
		});

		// Step 4: Generate AI trading signals (PARALLEL - much faster!)
		const tradingSignals = await step.run('generate-ai-signals', async () => {
			console.log(`[Job:${jobId}] Step 4: Generating AI signals`);
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
						console.error(`[Job:${jobId}] AI analysis failed for ${result.symbol}:`, error);
						return null;
					})
			);

			// Wait for all signals to complete simultaneously
			const signals = (await Promise.all(signalPromises)).filter(
				(s): s is TradingSignal => s !== null
			);

			console.log(`[Job:${jobId}] Generated ${signals.length} signals`);

			await updateProgress(
				4,
				'AI Analysis Complete',
				`Generated ${signals.length} trading signals with confidence scores`
			);

			return signals;
		});

		// Step 5: Save signals to database
		const savedSignals = await step.run('save-to-database', async () => {
			console.log(`[Job:${jobId}] Step 5: Saving signals to DB`);
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
					console.error(`[Job:${jobId}] Failed to save signal for ${signal.symbol}:`, error);
					saveResults.push({ symbol: signal.symbol, success: false });
				}
			}

			console.log(`[Job:${jobId}] Saved ${saveResults.filter(r => r.success).length}/${saveResults.length} signals`);

			return saveResults;
		});

		// Step 6: Generate analysis summary
		const summary = await step.run('generate-summary', async () => {
			console.log(`[Job:${jobId}] Step 6: Generating summary`);
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

			console.log(`[Job:${jobId}] Summary generated`, summary);

			return summary;
		});

		// Step 6.5: Send Telegram Notifications
		await step.run('send-notifications', async () => {
			const highConfidenceSignals = tradingSignals.filter(
				(s) => s.confidence >= 70
			);

			if (highConfidenceSignals.length > 0) {
				console.log(`[Job:${jobId}] Step 6.5: Sending Telegram notifications`);
				await updateProgress(
					6,
					'Sending Notifications',
					`Sending ${highConfidenceSignals.length} high-confidence alerts to Telegram...`
				);

				const results = await Promise.allSettled(
					highConfidenceSignals.map((signal) => sendSignalAlert(signal))
				);

				const sentCount = results.filter(
					(r) => r.status === 'fulfilled' && r.value === true
				).length;

				console.log(
					`[Job:${jobId}] Sent ${sentCount}/${highConfidenceSignals.length} Telegram alerts`
				);
			} else {
				console.log(`[Job:${jobId}] No high confidence signals for notifications`);
			}
		});

		// Step 7: Complete analysis
		await step.run('complete-job', async () => {
			const duration = Date.now() - startTime;
			console.log(`[Job:${jobId}] Step 7: completing job. Duration: ${duration}ms`);

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
					console.error(`[Job:${jobId}] Failed to update final job statistics:`, error);
				}
			} catch (error) {
				console.error(`[Job:${jobId}] Exception updating final job statistics:`, error);
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
