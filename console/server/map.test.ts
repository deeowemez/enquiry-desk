// Unit tests for the pure mapping helpers (no database). Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gmailUrl } from './map.js';

describe('gmailUrl', () => {
  it('links to the thread in the first signed-in account by default', () =>
    assert.equal(gmailUrl('1a157be8b1c0d83b', ''), 'https://mail.google.com/mail/u/0/#all/1a157be8b1c0d83b'));
  it('opens the business mailbox when one is configured', () =>
    assert.equal(gmailUrl('1a157be8b1c0d83b', 'desk@example.com'), 'https://mail.google.com/mail/?authuser=desk%40example.com#all/1a157be8b1c0d83b'));
  it('has no link for form posts', () => { assert.equal(gmailUrl(null, ''), null); assert.equal(gmailUrl('', ''), null); });
  it('refuses anything that is not a Gmail thread id', () => {
    for (const bad of ['javascript:alert(1)', '1a15/../x', 'abc#def', 'g'.repeat(5), 'a'.repeat(33)]) assert.equal(gmailUrl(bad, ''), null, bad);
  });
});
