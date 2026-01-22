require('dotenv').config();
const { Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');

async function checkQueue() {
    const queue = new Queue('attendanceUploadQueue', { connection: redisConfig });

    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();

    console.log(`--- QUEUE STATUS ---`);
    console.log(`Completed: ${completed.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Waiting: ${waiting.length}`);
    console.log(`Active: ${active.length}`);

    if (failed.length > 0) {
        console.log(`\n--- FAILED JOBS ---`);
        failed.slice(0, 5).forEach(job => {
            console.log(`Job ID: ${job.id}, Reason: ${job.failedReason}`);
        });
    }

    if (completed.length > 0) {
        console.log(`\n--- RECENT COMPLETED JOBS ---`);
        completed.slice(0, 5).forEach(job => {
            console.log(`Job ID: ${job.id}, Return Value: ${JSON.stringify(job.returnvalue)}`);
        });
    }

    process.exit(0);
}

checkQueue();
