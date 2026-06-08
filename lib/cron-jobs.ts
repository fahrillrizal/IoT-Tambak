import cron from 'node-cron';
import { saveDailySummaryForYesterday } from './daily-summary-scheduler';
import { saveHourlySummaryForLastHour } from './hourly-summary-scheduler';
import { runAIAutoFeeding } from './ai-feeding-scheduler';

const AI_FEEDING_MODE = (process.env.AI_AUTO_FEEDING_MODE || "cron").toLowerCase();

let cronJobStarted = false;

export function startCronJobs() {
  if (cronJobStarted) {
    console.log('⏭️  Cron jobs already started, skipping...');
    return;
  }

  try {
    console.log('🕐 Initializing cron jobs...');

    const dailySummaryCron = cron.schedule('5 0 * * *', async () => {
      console.log('🚀 Starting daily summary cron job at', new Date().toISOString());
      try {
        await saveDailySummaryForYesterday();
        console.log('✅ Daily summary cron job completed successfully');
      } catch (error) {
        console.error('❌ Daily summary cron job failed:', error);
      }
    });

    const hourlySummaryCron = cron.schedule('5 * * * *', async () => {
      console.log('🕐 Starting hourly summary cron job at', new Date().toISOString());
      try {
        await saveHourlySummaryForLastHour();
        console.log('✅ Hourly summary cron job completed successfully');
      } catch (error) {
        console.error('❌ Hourly summary cron job failed:', error);
      }
    });

    const aiAutoFeedingCron =
      AI_FEEDING_MODE === "cron"
        ? cron.schedule('*/15 * * * *', async () => {
            console.log('🤖 Starting AI auto feeding cron job at', new Date().toISOString());
            try {
              await runAIAutoFeeding();
              console.log('✅ AI auto feeding cron job completed successfully');
            } catch (error) {
              console.error('❌ AI auto feeding cron job failed:', error);
            }
          })
        : null;


    console.log('✨ Cron jobs initialized:');
    console.log('  🕐 Hourly Summary: Every hour at minute 05 (UTC)');
    console.log('  📊 Daily Summary: Every day at 00:05 (UTC)');
    console.log(
      `  🤖 AI Auto Feeding: ${AI_FEEDING_MODE === "cron" ? "Every 15 minutes (UTC)" : "Webhook mode"}`
    );
    console.log('  ⏸️  To stop cron jobs, call stopCronJobs()');

    cronJobStarted = true;

    // Return stop function
    return {
      stop: () => {
        dailySummaryCron.stop();
        hourlySummaryCron.stop();
        aiAutoFeedingCron?.stop();
        console.log('🛑 Cron jobs stopped');
      },
    };
  } catch (error) {
    console.error('🚨 Failed to initialize cron jobs:', error);
    throw error;
  }
}

export function stopCronJobs() {
  console.log('🛑 Stopping all cron jobs...');
  cronJobStarted = false;
}
