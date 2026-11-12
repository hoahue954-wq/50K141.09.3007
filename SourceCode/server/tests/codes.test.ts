import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCode } from '../src/utils/codes.js';

test('generates codes in the configured formats', async () => {
  assert.match(await generateCode('product'), /^\d{13}$/);
  assert.match(await generateCode('category'), /^DM\d{3}$/);
  assert.match(await generateCode('customer'), /^KH\d{6}$/);
  assert.match(await generateCode('invoice'), /^BH\d{6}$/);
  assert.match(await generateCode('disposal'), /^PHH\d{6}$/);
  assert.match(await generateCode('return'), /^PHD\d{6}$/);
  assert.match(await generateCode('purchaseOrder'), /^PHN\d{6}$/);
});

test('retries generated codes when the code is already in use', async () => {
  let firstCode: string | undefined;
  let calls = 0;
  const code = await generateCode('invoice', async (candidate) => {
    calls += 1;
    if (calls === 1) {
      firstCode = candidate;
      return true;
    }
    return false;
  });

  assert.equal(calls, 2);
  assert.notEqual(code, firstCode);
});
