'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const token = account => `browser-test-session-${account}`.padEnd(64, account);
async function signInFixture(page, account = 'A') {
  await page.addInitScript(value => {
    sessionStorage.setItem('arkham.session', value);
    localStorage.setItem('arkham.language', 'en');
  }, token(account));
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#profile-name')).toHaveText(`Account ${account}`);
}
async function api(request, operation, payload = {}, extra = {}, account = 'A') {
  const response = await request.post('/api', { data: { operation, payload, sessionToken: token(account), ...extra } });
  return response.json();
}

test('unconfigured Google login stays signed out and private API requests are denied', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#google-sign-in')).toBeDisabled();
  await expect(page.locator('#auth-status')).toContainText('setup', { ignoreCase: true });
  await expect(page.locator('#workspace')).toBeHidden();
  const response = await request.post('/api', { data: { operation: 'bootstrap', payload: {} } });
  const denied = await response.json();
  expect(denied.ok).toBe(false);
  expect(denied.error.code).toBe('AUTH_REQUIRED');
  expect(denied.data).toBeUndefined();
  expect(errors).toEqual([]);
});

test('sample preview is read only, bilingual, and fits desktop/mobile screens', async ({ page }) => {
  const mutations = [];
  page.on('request', request => { if (request.url().endsWith('/api')) { const body = request.postDataJSON(); if (body && body.operation !== 'publicConfig') mutations.push(body.operation); } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?preview=1');
  await expect(page.locator('#preview-banner')).toContainText('sample data');
  await expect(page.locator('#app-content .page-heading button')).toBeDisabled();
  await expect(page.locator('.campaign-card')).toHaveCount(3);
  fs.mkdirSync(path.join(__dirname, '../../.local'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '../../.local/design-preview-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#workspace [data-language-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('#preview-banner')).toContainText('ข้อมูลตัวอย่าง');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(__dirname, '../../.local/design-preview-mobile.png'), fullPage: true });
  await page.locator('#exit-preview').click();
  await expect(page.locator('#landing')).toBeVisible();
  expect(mutations).toEqual([]);
});

test('campaign creation persists across reload and an uncertain network response retries once', async ({ page, request }) => {
  await signInFixture(page);
  const name = 'Persistence and retry campaign';
  await page.locator('#app-content .page-heading button').click();
  await page.locator('#field-name').fill(name);
  await page.locator('#field-description').fill('The same intent must create exactly one campaign.');
  await page.locator('#field-notes').fill('PRIVATE_CAMPAIGN_TEST_NOTE');
  let dropped = false;
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    if (body.operation === 'createCampaign' && !dropped) {
      dropped = true;
      await route.fetch(); // Commit happened; browser never received the response.
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#app-dialog button[type=submit]').click();
  // The UI may retry automatically; otherwise retry the unchanged form intent.
  await expect(async () => {
    if (await page.locator('#app-dialog .form-error').isVisible()) await page.locator('#app-dialog button[type=submit]').click();
    await expect(page.locator('#app-dialog')).not.toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(page.locator('#app-content h1')).toHaveText(name);
  await page.reload();
  await expect(page.locator('.campaign-card h3').filter({ hasText: name })).toHaveCount(1);
  const result = await api(request, 'bootstrap');
  expect(result.data.campaigns.filter(campaign => campaign.name === name)).toHaveLength(1);
});

test('UI invitations bind the recipient, hide private notes, and membership removal revokes access', async ({ browser, page, request }) => {
  await signInFixture(page);
  await page.getByRole('button', { name: 'Open campaign: The Miskatonic Files', exact: true }).click();
  await page.getByRole('button', { name: /Invite member/ }).click();
  await page.locator('#field-email').fill('player@example.com');
  await page.locator('#app-dialog button[type=submit]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await signInFixture(player, 'B');
  await player.locator('[data-view="invitations"]').click();
  await player.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(player.locator('#app-content h1')).toHaveText('The Miskatonic Files');
  await expect(player.locator('#app-content')).not.toContainText('UNREVEALED_TEST_SECRET');
  await expect(player.getByRole('button', { name: /Edit campaign/ })).toHaveCount(0);
  const campaigns = await api(request, 'bootstrap');
  const campaign = campaigns.data.campaigns.find(item => item.name === 'The Miskatonic Files');
  const playerProjection = await api(request, 'bootstrap', { campaignId: campaign.id }, {}, 'B');
  expect(JSON.stringify(playerProjection)).not.toContain('UNREVEALED_TEST_SECRET');
  expect(playerProjection.data.activeCampaign.campaign).not.toHaveProperty('notes');
  expect((await api(request, 'bootstrap', { campaignId: campaign.id }, {}, 'C')).error.code).toBe('FORBIDDEN');
  await page.reload();
  await page.getByRole('button', { name: 'Open campaign: The Miskatonic Files', exact: true }).click();
  await page.getByRole('button', { name: 'Remove member: Account B', exact: true }).click();
  await page.locator('#app-dialog button[type=submit]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  expect((await api(request, 'bootstrap', { campaignId: campaign.id }, {}, 'B')).error.code).toBe('FORBIDDEN');
  await player.reload();
  await expect(player.locator('.campaign-card')).toHaveCount(0);
  await playerContext.close();
});

test('logout clears the browser state and revokes the persisted session', async ({ page, request }) => {
  await signInFixture(page, 'C');
  await page.locator('#sign-out').click();
  await expect(page.locator('#landing')).toBeVisible();
  await expect.poll(async () => (await api(request, 'bootstrap', {}, {}, 'C')).error?.code).toBe('AUTH_REQUIRED');
  expect(await page.evaluate(() => sessionStorage.getItem('arkham.session'))).toBeNull();
});
