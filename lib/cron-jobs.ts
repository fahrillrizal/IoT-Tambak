import cron from 'node-cron';
import { saveDailySummaryForYesterday } from './daily-summary-scheduler';

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

    // Optional: Jalankan setiap jam untuk debug/testing
    // const testCron = cron.schedule('0 * * * *', async () => {
    //   console.log('🧪 Test cron job running at', new Date().toISOString());
    // });

    console.log('✨ Cron jobs initialized:');
    console.log('  📊 Daily Summary: Every day at 00:05 (UTC)');
    console.log('  ⏸️  To stop cron jobs, call stopCronJobs()');

    cronJobStarted = true;

    // Return stop function
    return {
      stop: () => {
        dailySummaryCron.stop();
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
