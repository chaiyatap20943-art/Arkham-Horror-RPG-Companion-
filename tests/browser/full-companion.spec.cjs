'use strict';
const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');

// Accounts D and E use the server's isolated test vault, never an application
// authentication bypass. Every workflow below goes through the real API/store.
const token = account => `browser-test-session-${account}`.padEnd(64, account);
async function api(request, operation, payload = {}, account = 'A', version) {
  const body = { operation, payload, sessionToken: token(account), requestId: crypto.randomUUID() };
  if (version !== undefined) body.expectedVersion = version;
  const response = await request.post('/api', { data: body });
  const result = await response.json();
  expect(result.ok, JSON.stringify(result.error)).toBe(true);
  return result.data;
}
async function campaign(request, name, members = ['D']) {
  const { campaign } = await api(request, 'createCampaign', { name, notes: 'PRIVATE_CAMPAIGN_FULL_FLOW_NOTE' });
  for (const member of members) {
    const { invitation } = await api(request, 'inviteMember', { campaignId: campaign.id, email: `player${member.toLowerCase()}@example.com` });
    await api(request, 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }, member);
  }
  return campaign;
}
async function signIn(page, account, name) {
  await page.addInitScript(value => {
    sessionStorage.setItem('arkham.session', value);
    localStorage.setItem('arkham.language', 'en');
  }, token(account));
  await page.goto('/');
  await expect(page.locator('#profile-name')).toHaveText(`Account ${account}`);
  await page.getByRole('button', { name: `Open campaign: ${name}`, exact: true }).click();
  await expect(page.locator('#app-content h1')).toHaveText(name);
}
async function reopen(page, name, view) {
  await page.reload();
  await page.getByRole('button', { name: `Open campaign: ${name}`, exact: true }).click();
  await expect(page.locator('#app-content h1')).toHaveText(name);
  if (view) await feature(page, view);
}
async function feature(page, view) {
  await page.locator(`[data-feature-view="${view}"]`).click();
  await expect.poll(() => page.evaluate(() => window.ArkhamUI.state.view)).toBe(view);
  await expect(page.locator('.campaign-tab.active')).toBeVisible();
}
async function submit(page) {
  await page.locator('#app-dialog button[type="submit"]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
}
async function nextStep(page, index) {
  await page.locator('#app-dialog button[type="submit"]').click();
  await expect(page.locator('#app-dialog .eyebrow')).toContainText(`STEP ${index}/6`);
}
const recordCard = (page, name, selector = '.entity-card') => page.locator(selector).filter({ has: page.getByRole('heading', { name, exact: true }) });

test('six-step investigator wizard, GM approval, attendance, real dice, snapshots and next-session continuity', async ({ browser, page, request }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const created = await campaign(request, 'Full workflow at Blackwater');
  await signIn(page, 'D', created.name);
  await feature(page, 'investigators');
  await page.getByRole('button', { name: '+ Create investigator', exact: true }).click();
  await page.locator('#field-name').fill('Margaret Blackwater');
  await page.locator('#app-dialog button[type="submit"]').click();
  await expect(page.locator('#app-dialog .eyebrow')).toContainText('STEP 1/6');
  await page.locator('#field-placeOfOrigin').fill('Arkham');
  await page.locator('#field-localVisitor').selectOption('LOCAL');
  await page.locator('#field-narrative').fill('OWNER_PRIVATE_BACKGROUND_BLACKWATER');
  await nextStep(page, 2);
  await page.locator('#field-personalityId').selectOption({ index: 1 });
  await nextStep(page, 3);
  await page.locator('#field-archetypeId').selectOption('adventurer');
  await nextStep(page, 4);
  for (const id of ['agility', 'athletics', 'intuition']) await page.locator(`#field-skill-${id}`).selectOption('5');
  await page.locator('#field-skill-ranged-combat').selectOption('4');
  await nextStep(page, 5);
  await page.locator('#field-startingKnackId').selectOption('brawler');
  await page.locator('#field-package').selectOption('insight');
  await nextStep(page, 6);
  await expect(page.locator('#app-dialog')).toContainText('Margaret Blackwater');
  await submit(page);
  await expect(recordCard(page, 'Margaret Blackwater').locator('.entity-status')).toHaveText('SUBMITTED');
  let active = (await api(request, 'bootstrap', { campaignId: created.id }, 'D')).activeCampaign;
  let character = active.characters[0];
  expect(character.version).toBeGreaterThanOrEqual(8);
  expect(character.build.background.narrative).toBe('OWNER_PRIVATE_BACKGROUND_BLACKWATER');
  await reopen(page, created.name, 'investigators');
  await expect(recordCard(page, character.name).locator('.entity-status')).toHaveText('SUBMITTED');

  const gmContext = await browser.newContext();
  const gmPage = await gmContext.newPage();
  await signIn(gmPage, 'A', created.name);
  await feature(gmPage, 'investigators');
  await recordCard(gmPage, character.name).getByRole('button', { name: 'Review', exact: true }).click();
  await gmPage.locator('#field-notes').fill('Reviewed against the Corebook.');
  await submit(gmPage);
  await expect(recordCard(gmPage, character.name).locator('.entity-status')).toHaveText('APPROVED');
  await feature(gmPage, 'sessions');
  await gmPage.getByRole('button', { name: '+ New session', exact: true }).click();
  await gmPage.locator('#field-name').fill('The first chapter');
  await submit(gmPage);
  let chapter = recordCard(gmPage, 'The first chapter', '.session-card');
  await chapter.getByRole('button', { name: 'Attendance', exact: true }).click();
  await gmPage.locator('#field-userId').selectOption('google:browser-D');
  await gmPage.locator('#field-characterId').selectOption(character.id);
  await submit(gmPage);
  await expect(chapter.locator('.attendance-chip')).toHaveText('Account D · PRESENT');
  await chapter.getByRole('button', { name: 'Start session', exact: true }).click();
  await submit(gmPage);
  await expect(chapter.locator('.entity-status')).toHaveText('ACTIVE');

  await feature(gmPage, 'investigators');
  await recordCard(gmPage, character.name).getByRole('button', { name: 'Open sheet →', exact: true }).click();
  await gmPage.getByRole('button', { name: 'Apply rule effect', exact: true }).click();
  await gmPage.locator('#field-ruleSource').selectOption('KNACK:brawler');
  await expect(gmPage.locator('#app-dialog .catalog-detail')).toContainText('printed p.');
  await gmPage.locator('#field-modifier').fill('-1');
  await gmPage.locator('#field-reason').fill('PRIVATE_RULE_ADJUDICATION_REASON');
  await submit(gmPage);

  await reopen(page, created.name, 'investigators');
  await recordCard(page, character.name).getByRole('button', { name: 'Open sheet →', exact: true }).click();
  await page.getByRole('button', { name: 'Roll dice', exact: true }).click();
  await page.locator('#field-skillId').selectOption('ranged-combat');
  await page.locator('#field-diceCount').fill('1');
  await page.locator('#app-dialog button[type="submit"]').click();
  await expect(page.locator('#app-dialog .eyebrow')).toHaveText('SERVER ROLL');
  await expect(page.locator('#app-dialog .die')).toHaveCount(1);
  expect(Number(await page.locator('#app-dialog .die').textContent())).toBeGreaterThanOrEqual(1);
  expect(Number(await page.locator('#app-dialog .die').textContent())).toBeLessThanOrEqual(6);
  await expect(page.locator('#app-dialog')).toContainText('printed p.');
  await expect(page.locator('#app-dialog')).toContainText('GM ruling applied');
  active = (await api(request, 'bootstrap', { campaignId: created.id }, 'D')).activeCampaign;
  character = active.characters[0];
  expect(character.normalDice).toBe(5);
  expect(active.rolls).toHaveLength(1);
  expect(active.rolls[0].characterId).toBe(character.id);
  expect(active.rolls[0].adjudication).toBe('GM_ADJUDICATED');
  expect(active.rolls[0].adjudicatedModifier).toBe(-1);
  expect(active.rolls[0].ruleEffects[0].parameters.duration).toBe('NEXT_ACTION');
  expect(JSON.stringify(active)).not.toContain('PRIVATE_RULE_ADJUDICATION_REASON');
  await page.locator('#app-dialog .icon-button').click();

  await reopen(gmPage, created.name, 'sessions');
  chapter = recordCard(gmPage, 'The first chapter', '.session-card');
  await chapter.getByRole('button', { name: 'End & snapshot', exact: true }).click();
  await gmPage.locator('#field-summary').fill('The first chapter closes with a persistent spent die.');
  await gmPage.locator('#field-gmNotes').fill('PRIVATE_SNAPSHOT_FULL_FLOW_NOTE');
  await gmPage.locator(`[name="xp-${character.id}"]`).fill('2');
  await submit(gmPage);
  await expect(chapter.locator('.entity-status')).toHaveText('COMPLETED');
  await chapter.getByRole('button', { name: 'View snapshot', exact: true }).click();
  await expect(gmPage.locator('#app-dialog')).toContainText('normal/horror dice 5/0 · XP 2');
  await expect(gmPage.locator('#app-dialog')).toContainText('PRIVATE_SNAPSHOT_FULL_FLOW_NOTE');
  await gmPage.locator('#app-dialog .icon-button').click();
  await reopen(page, created.name, 'sessions');
  await recordCard(page, 'The first chapter', '.session-card').getByRole('button', { name: 'View snapshot', exact: true }).click();
  await expect(page.locator('#app-dialog')).toContainText('normal/horror dice 5/0 · XP 2');
  await expect(page.locator('#app-dialog')).not.toContainText('PRIVATE_SNAPSHOT_FULL_FLOW_NOTE');
  await page.locator('#app-dialog .icon-button').click();
  await gmPage.getByRole('button', { name: '+ New session', exact: true }).click();
  await gmPage.locator('#field-name').fill('The second chapter');
  await submit(gmPage);
  const next = recordCard(gmPage, 'The second chapter', '.session-card');
  await next.getByRole('button', { name: 'Attendance', exact: true }).click();
  await gmPage.locator('#field-userId').selectOption('google:browser-D');
  await gmPage.locator('#field-characterId').selectOption(character.id);
  await submit(gmPage);
  await next.getByRole('button', { name: 'Start session', exact: true }).click();
  await submit(gmPage);
  active = (await api(request, 'bootstrap', { campaignId: created.id }, 'D')).activeCampaign;
  expect(active.characters[0].normalDice).toBe(5);
  expect(active.characters[0].xpEarned).toBe(2);
  expect(active.characters[0].insightCurrent).toBe(2);
  expect(active.snapshots[0].characters[0].normalDice).toBe(5);
  expect(JSON.stringify(active)).not.toContain('PRIVATE_SNAPSHOT_FULL_FLOW_NOTE');
  expect(errors).toEqual([]);
  await gmContext.close();
});

test('GM prepares a secret clue and selected reveal reaches only the chosen player without GM notes', async ({ browser, page, request }) => {
  const created = await campaign(request, 'Selective reveal in the study', ['D', 'E']);
  await signIn(page, 'A', created.name);
  await feature(page, 'story');
  await page.getByRole('button', { name: '+ Story asset', exact: true }).click();
  await page.locator('#field-kind').selectOption('CLUE');
  await page.locator('#field-name').fill('The torn diary page');
  await page.locator('#field-description').fill('REVEALED_DIARY_FOR_D_ONLY');
  await page.locator('#field-gmNotes').fill('SECRET_DIARY_GM_NOTES');
  await submit(page);
  const clue = recordCard(page, 'The torn diary page');
  await expect(clue).toContainText('GM_ONLY');
  for (const account of ['D', 'E']) {
    const active = (await api(request, 'bootstrap', { campaignId: created.id }, account)).activeCampaign;
    expect(JSON.stringify(active)).not.toContain('REVEALED_DIARY_FOR_D_ONLY');
    expect(JSON.stringify(active)).not.toContain('SECRET_DIARY_GM_NOTES');
  }
  await clue.getByRole('button', { name: 'Reveal / access', exact: true }).click();
  await page.locator('#field-visibility').selectOption('SELECTED_PLAYERS');
  await page.locator('#app-dialog').getByLabel('Account D', { exact: true }).check();
  await submit(page);
  const selectedContext = await browser.newContext();
  const unselectedContext = await browser.newContext();
  const selected = await selectedContext.newPage();
  const unselected = await unselectedContext.newPage();
  await signIn(selected, 'D', created.name);
  await signIn(unselected, 'E', created.name);
  await feature(selected, 'story');
  await feature(unselected, 'story');
  await expect(recordCard(selected, 'The torn diary page')).toContainText('REVEALED_DIARY_FOR_D_ONLY');
  await expect(selected.locator('#app-content')).not.toContainText('SECRET_DIARY_GM_NOTES');
  await expect(recordCard(unselected, 'The torn diary page')).toHaveCount(0);
  const selectedProjection = (await api(request, 'bootstrap', { campaignId: created.id }, 'D')).activeCampaign;
  expect(selectedProjection.assets[0]).not.toHaveProperty('gmNotes');
  const unselectedProjection = (await api(request, 'bootstrap', { campaignId: created.id }, 'E')).activeCampaign;
  expect(unselectedProjection.assets).toHaveLength(0);
  await clue.getByRole('button', { name: 'Reveal / access', exact: true }).click();
  await page.locator('#field-visibility').selectOption('GM_ONLY');
  await submit(page);
  await reopen(selected, created.name, 'story');
  await expect(recordCard(selected, 'The torn diary page')).toHaveCount(0);
  await selectedContext.close();
  await unselectedContext.close();
});

test('rules search shows source pages, bilingual fallback and grounded assistant with no configured Gemini', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const created = await campaign(request, 'The cited rulebook');
  await signIn(page, 'D', created.name);
  await feature(page, 'rulebook');
  await page.locator('#field-query').fill('Action Dice');
  await page.locator('#field-language').selectOption('th');
  await page.locator('.search-form button[type="submit"]').click();
  await expect(page.locator('.rules-results .rule-entry').first()).toBeVisible();
  await expect(page.locator('.rules-results')).toContainText('printed p.');
  await expect(page.locator('.rules-results')).toContainText('PDF p.');
  await expect(page.locator('.rules-results')).toContainText('VERIFIED');
  await feature(page, 'assistant');
  await page.locator('#field-question').fill('Action Dice');
  await page.locator('.assistant-form [name="consent"]').check();
  await page.locator('.assistant-form button[type="submit"]').click();
  await expect(page.locator('.ai-answer')).toHaveCount(1);
  await expect(page.locator('.ai-answer')).toContainText('AI is unavailable');
  await expect(page.locator('.ai-answer')).toContainText('OFFICIAL_RULE');
  await expect(page.locator('.ai-answer')).toContainText('printed p.');
  await expect(page.locator('.assistant-form [name="consent"]')).not.toBeChecked();
  await page.locator('#field-question').fill('noexistingrulezzzxxyy');
  await page.locator('.assistant-form [name="consent"]').check();
  await page.locator('.assistant-form button[type="submit"]').click();
  await expect(page.locator('.ai-answer')).toHaveCount(2);
  await expect(page.locator('.ai-answer').first()).toContainText('SOURCE_UNAVAILABLE');
  await expect(page.locator('.ai-answer').first()).toContainText('No accessible supporting sources');
  await page.getByRole('button', { name: 'Load AI history', exact: true }).click();
  await expect(page.locator('.ai-answer')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('owner exports a private backup and restores validated campaign data while players have no tools access', async ({ page, browser, request }) => {
  const created = await campaign(request, 'Private owner backup workflow');
  await signIn(page, 'A', created.name);
  await feature(page, 'story');
  await page.getByRole('button', { name: '+ Story asset', exact: true }).click();
  await page.locator('#field-kind').selectOption('CLUE');
  await page.locator('#field-name').fill('Recovered backup clue');
  await page.locator('#field-description').fill('Original backed-up clue description');
  await submit(page);
  await feature(page, 'tools');
  await page.getByRole('button', { name: 'Download private backup', exact: true }).click();
  await page.locator('#app-dialog [name="consent"]').check();
  const downloadPromise = page.waitForEvent('download');
  await submit(page);
  const download = await downloadPromise;
  const backupText = fs.readFileSync(await download.path(), 'utf8');
  const backup = JSON.parse(backupText);
  expect(backupText).toContain('PRIVATE_CAMPAIGN_FULL_FLOW_NOTE');
  expect(backup).toHaveProperty('checksum');
  await feature(page, 'story');
  await recordCard(page, 'Recovered backup clue').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#field-description').fill('Changed after the private backup');
  await page.locator('#field-visibility').selectOption('CAMPAIGN_PLAYERS');
  await submit(page);
  await page.getByRole('button', { name: '+ Story asset', exact: true }).click();
  await page.locator('#field-kind').selectOption('CLUE');
  await page.locator('#field-name').fill('Added after the private backup');
  await submit(page);
  await expect(recordCard(page, 'Added after the private backup')).toBeVisible();
  await feature(page, 'tools');
  await page.getByRole('button', { name: 'Review a restore', exact: true }).click();
  await page.locator('#field-backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
  await page.locator('#field-confirmation').fill(created.name);
  await page.locator('#field-reason').fill('Browser verification of an owner-authorized restore.');
  await page.locator('#app-dialog [name="consent"]').check();
  await submit(page);
  await feature(page, 'story');
  await expect(recordCard(page, 'Recovered backup clue')).toContainText('Original backed-up clue description');
  await expect(recordCard(page, 'Recovered backup clue')).not.toContainText('Changed after the private backup');
  await expect(recordCard(page, 'Recovered backup clue')).toContainText('CAMPAIGN_PLAYERS');
  await expect(recordCard(page, 'Added after the private backup')).toHaveCount(1);
  await expect(page.locator('#toast-stack')).toContainText('Backup recovered. Newer records retained:');
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await signIn(player, 'D', created.name);
  await feature(player, 'tools');
  await expect(player.locator('#app-content')).toContainText('Owner access required.');
  await expect(player.getByRole('button', { name: 'Download private backup', exact: true })).toHaveCount(0);
  await playerContext.close();
});

test('source administration imports an explicitly shared excerpt, reviews it and keeps unconfigured image storage honest', async ({ page, request }) => {
  const created = await campaign(request, 'Reviewed source administration');
  await signIn(page, 'A', created.name);
  await feature(page, 'materials');
  await page.getByRole('button', { name: 'Register source book', exact: true }).click();
  await page.locator('#field-title').fill('Private browser source excerpt');
  await page.locator('#field-edition').fill('Test-only source metadata');
  await page.locator('#field-checksum').fill('a'.repeat(64));
  const registeredPromise = page.waitForResponse(response => response.url().endsWith('/api') && response.request().postDataJSON()?.operation === 'registerBook');
  await submit(page);
  const registered = (await (await registeredPromise).json()).data.book;
  await page.getByRole('button', { name: 'Import rule entities', exact: true }).click();
  await page.locator('#field-book').fill(registered.id);
  const entities = [{ id: 'browser-reviewed-excerpt', type: 'RULE', name: 'Browser reviewed excerpt', englishText: 'sourceadministrationzzq is a test-only cited excerpt, not a new engine mechanic.', printedPage: 12, pdfPageIndex: 12, section: 'Browser fixture', keywords: ['sourceadministrationzzq'], visibility: 'CAMPAIGN_PLAYERS' }];
  await page.locator('#field-batch').setInputFiles({ name: 'excerpt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(entities)) });
  await submit(page);
  await expect(page.locator('#toast-stack')).toContainText('Imported 1 entities. Book version: 2');
  await feature(page, 'rulebook');
  await page.locator('#field-query').fill('sourceadministrationzzq');
  await page.locator('.search-form button[type="submit"]').click();
  const source = page.locator('.rules-results .rule-entry').filter({ hasText: 'Browser reviewed excerpt' });
  await expect(source).toContainText('NEEDS_REVIEW');
  await expect(page.locator('.rules-results')).toContainText('index is partial');
  await source.getByRole('button', { name: 'Review source', exact: true }).click();
  await page.locator('#field-decision').selectOption('VERIFIED');
  await page.locator('#field-notes').fill('Verified the private excerpt against its cited source.');
  await submit(page);
  await page.locator('#field-query').fill('sourceadministrationzzq');
  await page.locator('.search-form button[type="submit"]').click();
  await expect(source).toContainText('VERIFIED');
  const searched = await api(request, 'searchRules', { campaignId: created.id, query: 'sourceadministrationzzq', language: 'en' }, 'D');
  expect(searched.results).toHaveLength(1);
  expect(searched.results[0].verificationStatus).toBe('VERIFIED');
  expect(searched.results[0].citation.printedPage).toBe(12);
  expect(searched.results[0].citation.pdfPage).toBe(13);

  await feature(page, 'materials');
  await page.getByRole('button', { name: '+ Upload image', exact: true }).click();
  await page.locator('#field-image').setInputFiles({ name: 'one-pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/iroAAAAASUVORK5CYII=', 'base64') });
  await page.locator('#field-title').fill('Unconfigured private image storage');
  const uploadPromise = page.waitForResponse(response => response.url().endsWith('/api') && response.request().postDataJSON()?.operation === 'uploadMaterial');
  await page.locator('#app-dialog button[type="submit"]').click();
  const upload = await (await uploadPromise).json();
  expect(upload.ok).toBe(false);
  expect(upload.error.code).toBe('CONFIGURATION');
  await expect(page.locator('#app-dialog .form-error')).toContainText('Private Drive storage is not configured');
  await page.locator('#app-dialog .icon-button').click();
  const active = (await api(request, 'bootstrap', { campaignId: created.id })).activeCampaign;
  expect(active.materials).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#workspace [data-language-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
