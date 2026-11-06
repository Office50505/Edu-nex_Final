const cron = require('node-cron');
const Progress = require('../models/Progress');
const Course = require('../models/Course');
const Wishlist = require('../models/Wishlist');
const CourseAnalytics = require('../models/CourseAnalytics');
const Lesson = require('../models/Lesson');
const AiTutorSession = require('../models/AiTutorSession');
const { scheduleLockedJob } = require('../services/distributedLock');

const COURSE_STATS_LOCK_TTL_MS = 45 * 60 * 1000;
const DAILY_ANALYTICS_LOCK_TTL_MS = 90 * 60 * 1000;
const DROPOFF_LOCK_TTL_MS = 30 * 60 * 1000;

function getYesterdayUtcRange() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

async function refreshCourseStats() {
  console.log('[CRON] Refresh Course Stats started');
  try {
    const stats = await Progress.aggregate([
      // Look up the Course document alongside the lesson
      {
        $lookup: {
          from: 'courses',
          localField: 'course',
          foreignField: '_id',
          as: 'courseDoc',
        },
      },
      // Look up the Lesson record (to get videoIndex)
      {
        $lookup: {
          from: 'lessons',
          localField: 'lesson',
          foreignField: '_id',
          as: 'lessonDoc',
        },
      },
      {
        $unwind: {
          path: '$courseDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: '$lessonDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Derive video duration from the appropriate source:
      //   1. courseDoc.videos[videoIndex].duration  (preferred, new schema)
      //   2. lessonDoc.duration                      (fallback, old schema during migration)
      {
        $addFields: {
          videoIndexFromLesson: { $ifNull: ['$lessonDoc.videoIndex', 0] },
          durationFromCourse: {
            $let: {
              vars: {
                vidIdx: { $ifNull: ['$lessonDoc.videoIndex', 0] },
              },
              in: {
                $cond: [
                  {
                    $and: [
                      { $isArray: '$courseDoc.videos' },
                      { $gte: ['$$vidIdx', 0] },
                    ],
                  },
                  {
                    $ifNull: [
                      {
                        $arrayElemAt: ['$courseDoc.videos.duration', '$$vidIdx'],
                      },
                      0,
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          videoDuration: {
            $cond: [
              { $gt: [{ $ifNull: ['$durationFromCourse', 0] }, 0] },
              '$durationFromCourse',
              { $ifNull: ['$lessonDoc.duration', 0] },
            ],
          },
        },
      },
      {
        $addFields: {
          progressPercent: {
            $cond: [
              { $gt: ['$videoDuration', 0] },
              {
                $min: [
                  {
                    $multiply: [
                      { $divide: ['$watchedSeconds', '$videoDuration'] },
                      100,
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$course',
          uniqueUsers: { $addToSet: '$user' },
          totalWatchSeconds: { $sum: '$watchedSeconds' },
          completedCount: {
            $sum: { $cond: ['$completed', 1, 0] },
          },
          averageProgress: { $avg: '$progressPercent' },
        },
      },
    ]);

    for (const stat of stats) {
      const uniqueUserCount = stat.uniqueUsers.length;
      const completionRate = uniqueUserCount > 0
        ? (stat.completedCount / uniqueUserCount) * 100
        : 0;
      const wishlistCount = await Wishlist.countDocuments({
        courses: stat._id,
      });

      await Course.findByIdAndUpdate(stat._id, {
        totalStarted: uniqueUserCount,
        totalCompleted: stat.completedCount,
        totalWatchMinutes: Math.floor(stat.totalWatchSeconds / 60),
        completionRate: Math.round(completionRate * 100) / 100,
        averageProgress: Math.round((stat.averageProgress || 0) * 100) / 100,
        totalWishlisted: wishlistCount,
        lastCalculatedAt: new Date(),
      });
    }

    console.log('[CRON] Refresh Course Stats completed');
  } catch (err) {
    console.error(`[CRON] Refresh Course Stats failed (${err?.code || err?.name || 'unknown'})`);
  }
}

async function writeDailyCourseAnalytics() {
  console.log('[CRON] Write Daily CourseAnalytics started');
  try {
    const { start: yesterday, end: yesterdayEnd } = getYesterdayUtcRange();
    const courses = await Course.find({ status: 'published' }).select('_id');

    for (const course of courses) {
      const courseId = course._id;
      const progressRecords = await Progress.find({
        course: courseId,
        lastWatchedAt: { $gte: yesterday, $lte: yesterdayEnd },
      }).select('user lesson watchedSeconds completed dropOffPoint');
      const uniqueViewers = new Set(progressRecords.map(function getUserId(record) {
        return String(record.user);
      })).size;
      const lessonsWatched = progressRecords.length;
      const totalWatchSeconds = progressRecords.reduce(function sumWatched(total, record) {
        return total + (record.watchedSeconds || 0);
      }, 0);
      const firstLesson = await Lesson.findOne({ course: courseId }).sort({ order: 1 }).select('_id');
      const newStarts = firstLesson
        ? new Set(progressRecords
          .filter(function isFirstLesson(record) {
            return String(record.lesson) === String(firstLesson._id);
          })
          .map(function getUserId(record) {
            return String(record.user);
          })).size
        : 0;
      const newCompletions = new Set(progressRecords
        .filter(function isCompleted(record) {
          return record.completed;
        })
        .map(function getUserId(record) {
          return String(record.user);
        })).size;
      const aiTutorSessions = await AiTutorSession.find({
        course: courseId,
        lastUpdatedAt: { $gte: yesterday, $lte: yesterdayEnd },
      }).select('messages');
      const aiTutorQueries = aiTutorSessions.reduce(function sumQueries(total, session) {
        return total + (Array.isArray(session.messages) ? session.messages.length : 0);
      }, 0);
      const lessons = await Lesson.find({ course: courseId }).sort({ order: 1 }).select('_id');
      const lessonDropOff = [];

      for (const lesson of lessons) {
        const lessonRecords = progressRecords.filter(function isLessonRecord(record) {
          return String(record.lesson) === String(lesson._id);
        });
        const viewCount = new Set(lessonRecords.map(function getUserId(record) {
          return String(record.user);
        })).size;
        const dropCount = new Set(lessonRecords
          .filter(function hasDropOff(record) {
            return record.dropOffPoint !== null && record.dropOffPoint !== undefined;
          })
          .map(function getUserId(record) {
            return String(record.user);
          })).size;

        lessonDropOff.push({
          lesson: lesson._id,
          viewCount,
          dropCount,
        });
      }

      await CourseAnalytics.findOneAndUpdate(
        { course: courseId, date: yesterday },
        {
          $set: {
            course: courseId,
            date: yesterday,
            uniqueViewers,
            lessonsWatched,
            watchMinutes: Math.floor(totalWatchSeconds / 60),
            newStarts,
            newCompletions,
            aiTutorQueries,
            lessonDropOff,
          },
        },
        { upsert: true, new: true }
      );
    }

    console.log('[CRON] Write Daily CourseAnalytics completed');
  } catch (err) {
    console.error(`[CRON] Write Daily CourseAnalytics failed (${err?.code || err?.name || 'unknown'})`);
  }
}

async function calculateDropOffPoints() {
  console.log('[CRON] Calculate Drop Off Points started');
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const records = await Progress.find({
      completed: false,
      dropOffPoint: null,
      lastWatchedAt: { $lt: cutoff },
    }).select('_id watchedSeconds');

    if (records.length) {
      await Progress.bulkWrite(records.map(function toBulkUpdate(record) {
        return {
          updateOne: {
            filter: { _id: record._id },
            update: { $set: { dropOffPoint: record.watchedSeconds } },
          },
        };
      }));
    }

    console.log('[CRON] Calculate Drop Off Points completed');
  } catch (err) {
    console.error(`[CRON] Calculate Drop Off Points failed (${err?.code || err?.name || 'unknown'})`);
  }
}

scheduleLockedJob({
  cron,
  expression: '0 2 * * *',
  jobName: 'course-stats',
  lockTtlMs: COURSE_STATS_LOCK_TTL_MS,
  task: refreshCourseStats,
});

scheduleLockedJob({
  cron,
  expression: '0 1 * * *',
  jobName: 'daily-analytics',
  lockTtlMs: DAILY_ANALYTICS_LOCK_TTL_MS,
  task: writeDailyCourseAnalytics,
});

scheduleLockedJob({
  cron,
  expression: '0 3 * * *',
  jobName: 'dropoff',
  lockTtlMs: DROPOFF_LOCK_TTL_MS,
  task: calculateDropOffPoints,
});
