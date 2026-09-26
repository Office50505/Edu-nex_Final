const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');
const Session = require('../models/Session');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const underage = await User.find({ age: { $ne: null, $lt: 13 } }).select('_id').lean();
  const ids = underage.map(user => user._id);
  if (!ids.length) {
    console.log('No under-13 accounts found.');
    return;
  }
  await Promise.all([
    User.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          ageReviewRequired: true,
          isActive: false,
          deviceToken: null,
          activeSessionId: null,
          activeSessions: [],
        },
      }
    ),
    Session.updateMany(
      { user: { $in: ids }, loggedOutAt: null },
      { $set: { loggedOutAt: new Date(), deviceToken: null, refreshTokenHash: null } }
    ),
  ]);
  console.log(`Flagged and disabled ${ids.length} under-13 account(s); ages were not changed.`);
}

main()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
