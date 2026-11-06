const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  audienceFilter,
  createNotificationService,
} = require('../services/notificationService');

function serviceHarness(recipientIds = ['user-1', 'user-2']) {
  const inserted = [];
  const savedBroadcasts = [];
  let recipientFilter;
  const service = createNotificationService({
    UserModel: {
      async distinct(field, filter) {
        assert.equal(field, '_id');
        recipientFilter = filter;
        return recipientIds;
      },
    },
    NotificationModel: {
      async insertMany(rows) {
        inserted.push(...rows);
      },
    },
    BroadcastModel: {
      async create(data) {
        return {
          _id: 'broadcast-1',
          createdAt: new Date('2026-10-07T10:00:00.000Z'),
          recipientCount: 0,
          error: null,
          ...data,
          async save() {
            savedBroadcasts.push({ ...this });
          },
        };
      },
    },
  });
  return { service, inserted, savedBroadcasts, recipientFilter: () => recipientFilter };
}

test('broadcast creates one unread in-app notification per targeted active account', async () => {
  const harness = serviceHarness();
  const result = await harness.service.broadcastNotification({
    title: '  New lessons   available  ',
    body: ' Open the course to see what changed. ',
    type: 'course_update',
    audience: 'learners',
    source: 'course',
    courseId: 'course-1',
    createdBy: 'admin-1',
  });

  assert.deepEqual(harness.recipientFilter(), audienceFilter('learners'));
  assert.equal(result.recipientCount, 2);
  assert.equal(result.broadcast.status, 'sent');
  assert.equal(harness.inserted.length, 2);
  assert.deepEqual(harness.inserted.map((row) => row.recipient), ['user-1', 'user-2']);
  assert.ok(harness.inserted.every((row) => row.isRead === false && row.channel === 'push'));
  assert.ok(harness.inserted.every((row) => row.title === 'New lessons available'));
  assert.equal(harness.savedBroadcasts.at(-1).recipientCount, 2);
});

test('broadcast validates message content and audience before creating records', async () => {
  const harness = serviceHarness();
  await assert.rejects(
    harness.service.broadcastNotification({ title: 'Hi', body: 'Valid message', audience: 'all' }),
    /title must contain at least 3 characters/
  );
  await assert.rejects(
    harness.service.broadcastNotification({ title: 'Valid title', body: 'Valid message', audience: 'deleted-users' }),
    /valid notification audience/
  );
  assert.equal(harness.inserted.length, 0);
});

test('server mounts learner and admin notification routes and broadcasts published course changes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api', require\('\.\/routes\/notifications'\)\)/);
  assert.match(serverSource, /app\.use\('\/api\/admin', require\('\.\/routes\/adminNotifications'\)\)/);
  assert.match(serverSource, /const notificationBroadcast = await broadcastCourseChange\([\s\S]*savedCourse,[\s\S]*'new'/);
  assert.match(serverSource, /existingCourse\.status === 'published' \? 'update' : 'new'/);
  assert.match(serverSource, /if \(!course \|\| course\.status !== 'published'\) return null/);
});
