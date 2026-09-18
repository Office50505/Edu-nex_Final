// @vitest-environment jsdom
import React from 'react';
import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { plainCourseDescription as web } from '../../src/lib/courseDescription.js';
import { plainCourseDescription as native } from '../../../appcopyai/services/courseDescription.js';

it('web and native remove Markdown markers while retaining paragraphs and readable lists', () => {
  const input = '## Learn **AI** ##\n\nA *practical* _course_.\n\n* Build a [project](https://example.test)\n- Use `prompts`\n\n---\n\n### Next steps';
  const expected = 'Learn AI\n\nA practical course.\n\n• Build a project\n• Use prompts\n\nNext steps';
  expect(web(input)).toBe(expected); expect(native(input)).toBe(expected);
});
it('preserves meaningful hash/underscore characters and arithmetic', () => {
  const text = 'Learn C# and #AI with user_name_here. Compute 2 * 3 * 4.';
  expect(web(text)).toBe(text); expect(native(text)).toBe(text);
});
it('empty values are safe and untrusted HTML remains escaped text', () => {
  expect(web(null)).toBe(''); expect(native(undefined)).toBe('');
  const markup = renderToStaticMarkup(<p>{web('**Hello** <script>alert(1)</script>')}</p>);
  expect(markup).not.toContain('<script>'); expect(markup).toContain('&lt;script&gt;');
});
