const MAX_LESSON_NOTES_LENGTH = 20000;

function normalizeLessonNotes(value) {
  const notes = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (notes.length > MAX_LESSON_NOTES_LENGTH) {
    const error = new Error(`Lesson notes cannot exceed ${MAX_LESSON_NOTES_LENGTH.toLocaleString('en-US')} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return notes;
}

module.exports = { MAX_LESSON_NOTES_LENGTH, normalizeLessonNotes };
