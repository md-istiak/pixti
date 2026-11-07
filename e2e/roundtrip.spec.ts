/**
 * Browser tests of the real application (production build served by `vite preview`).
 *
 * Run with a UTF-8 locale (e.g. `LC_ALL=C.UTF-8 npm run test:e2e`): on Linux without one,
 * Chromium replaces non-ASCII download names with "download". Non-ASCII file names are
 * covered by the unit tests instead.
 */
import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const PASSWORD = 'correct horse battery staple 42';

test('encrypted file: encode -> PDF -> decode -> identical bytes', async ({ page }, info) => {
  const original = Buffer.concat([Buffer.from('Hello pixti\n'.repeat(20000)), randomBytes(300_000)]);
  const name = 'My Report (final).txt';

  await page.goto('/encode');
  await page.setInputFiles('[data-testid=encode-input]', { name, mimeType: 'text/plain', buffer: original });
  await expect(page.getByTestId('selected-name')).toHaveText(name);

  const start = page.getByTestId('start-encode');
  await expect(start).toBeDisabled(); // password required while encryption is on
  await page.getByTestId('password').fill(PASSWORD);
  await page.getByTestId('password-confirm').fill('something else');
  await expect(page.getByText('The passwords do not match.')).toBeVisible();
  await expect(start).toBeDisabled();
  await page.getByTestId('password-confirm').fill(PASSWORD);
  await start.click();

  await expect(page.getByText('Your document is ready')).toBeVisible({ timeout: 60_000 });
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /pixti_[0-9a-f]{8}\.pdf/ }).click(),
  ]);
  const pdfPath = info.outputPath('encoded.pdf');
  await pdfDownload.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.includes(Buffer.from('My Report'))).toBe(false); // encrypted sets do not expose the name

  await page.getByRole('link', { name: 'Decode', exact: true }).click();
  await page.setInputFiles('[data-testid=decode-input]', pdfPath);
  await expect(page.getByText(/Complete set/)).toBeVisible();
  await expect(page.getByText('Password required')).toBeVisible();
  await expect(page.getByTestId('start-decode')).toBeDisabled();

  await page.getByTestId('password').fill('wrong password');
  await page.getByTestId('start-decode').click();
  await expect(page.getByText('Could not decrypt')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('password').fill(PASSWORD);
  await page.getByTestId('start-decode').click();
  await expect(page.getByText('File recovered')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Verified: matches the original checksum/)).toBeVisible();
  await expect(page.getByTestId('recovered-name')).toHaveText(name);

  const [fileDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-recovered').click()]);
  expect(fileDownload.suggestedFilename()).toBe(name);
  const outPath = info.outputPath('recovered.bin');
  await fileDownload.saveAs(outPath);
  expect(sha(readFileSync(outPath))).toBe(sha(original));
});

test('multi-file set: missing file is named, any upload order works', async ({ page }, info) => {
  const original = randomBytes(25 * 1024 * 1024);

  await page.goto('/encode');
  await page.setInputFiles('[data-testid=encode-input]', { name: 'big.bin', mimeType: 'application/octet-stream', buffer: original });
  await page.getByRole('switch').click(); // encryption off
  await expect(page.getByText('Encryption is off')).toBeVisible();
  await page.getByText('Advanced settings').click();
  await page.selectOption('#page', '2');
  await page.selectOption('#doclimit', '10');
  await page.getByTestId('start-encode').click();
  await expect(page.getByText('Your document is ready')).toBeVisible({ timeout: 120_000 });

  const buttons = page.getByRole('button', { name: /pixti_[0-9a-f]{8}_file_\d{3}_of_\d{3}\.pdf/ });
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(3);
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const [d] = await Promise.all([page.waitForEvent('download'), buttons.nth(i).click()]);
    const p = info.outputPath(`part${i}.pdf`);
    await d.saveAs(p);
    paths.push(p);
  }

  await page.getByRole('link', { name: 'Decode', exact: true }).click();
  await page.setInputFiles('[data-testid=decode-input]', paths.slice(1)); // first file missing
  await expect(page.getByText('Missing parts').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Missing pages? 1/).first()).toBeVisible();
  await expect(page.getByTestId('start-decode')).toBeDisabled();

  await page.setInputFiles('[data-testid=decode-input]', [paths[0]]); // arrives last: order must not matter
  await expect(page.getByText(/Complete set/)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('start-decode').click();
  await expect(page.getByText('File recovered')).toBeVisible({ timeout: 120_000 });
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-recovered').click()]);
  const out = info.outputPath('recovered-big.bin');
  await d.saveAs(out);
  expect(sha(readFileSync(out))).toBe(sha(original));
});

test('a PDF that pixti did not create is rejected clearly', async ({ page }) => {
  await page.goto('/decode');
  await page.setInputFiles('[data-testid=decode-input]', {
    name: 'other.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 not made by pixti'),
  });
  await expect(page.getByText('Not a pixti document')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('start-decode')).toBeDisabled();
});

test('deep links work after a refresh', async ({ page }) => {
  await page.goto('/settings');
  await page.reload();
  await expect(page.getByText('Format version')).toBeVisible();
});
