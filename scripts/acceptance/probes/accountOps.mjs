import { until } from '../harness.mjs';

const JOB_ID = '0123456789abcdef0123456789abcdef';
const JOB = { id: JOB_ID, instance: 'clouvider', kind: 'record', source: 'manual', state: 'succeeded', phase: 'persist_verify', reason: 'recorded', created: 1792470000, updated: 1792470001, allowed_actions: [] };

export function accountOpsFixtures() {
  return [
    [(url) => url.pathname.endsWith('/account-ops/capabilities'), () => ({ protocol_version: 1, instance: 'clouvider', worker_available: true, history: true, imports: true, record_only: true, browser: false, proxy: false, human_takeover: false, schedule_owner: 'legacy', synthetic: false })],
    [(url) => url.pathname.endsWith('/account-ops/accounts'), () => ({ items: [] })],
    [(url, method) => method === 'POST' && url.pathname.endsWith('/account-ops/imports/preview'), () => ({ draft_id: 'draft-fixture', instance: 'clouvider', expires_at: 1792473600, rows: [{ index: 0, email: 'synthetic+alias@example.com', order_id: 'ORDER-FIXTURE', amount_cents: 7700, expires_at: null, issues: [], has_credentials: true }] })],
    [(url) => url.pathname.endsWith(`/account-ops/jobs/${JOB_ID}/events`), () => ({ items: [{ cursor: 1, job_id: JOB_ID, kind: 'record', phase: 'persist_verify', reason: 'recorded', source: 'manual', time: 1792470001 }], next_cursor: 1, has_more: false })],
    [(url) => url.pathname.endsWith(`/account-ops/jobs/${JOB_ID}`), () => JOB],
    [(url, method) => ['GET', 'POST'].includes(method) && url.pathname.endsWith('/account-ops/jobs'), (_url, method) => method === 'POST' ? JOB : ({ items: [JOB], next_cursor: null })],
  ];
}

export async function accountOpsPage({ base, page, check }) {
  await page.goto(`${base}/account-ops?tab=import`, { waitUntil: 'domcontentloaded' });
  const region = page.getByTestId('account-ops-page');
  await region.locator('textarea').waitFor();
  const password = 'synthetic-password-for-browser-test';
  await region.locator('textarea').fill(`synthetic+alias@example.com----${password}----JBSWY3DPEHPK3PXP`);
  await region.getByRole('button', { name: /解析预览|Preview/ }).click();
  await region.getByText('synthetic+alias@example.com', { exact: true }).waitFor();
  check('the import preview clears the secret input', await region.locator('textarea').inputValue() === '');
  check('the preview has the email and fixed-point amount', (await region.textContent()).includes('¥77.00'));
  const persistence = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  check('secrets are absent from DOM and persistent browser storage', !(await page.locator('body').textContent()).includes(password) && !persistence.includes(password));
  await region.getByRole('button', { name: /提交任务|Submit job/ }).click();
  await page.locator('.ant-drawer').getByText(JOB_ID, { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ant-drawer').getByText(JOB_ID, { exact: true }).waitFor();
  check('a reload restores the same task detail', new URL(page.url()).searchParams.get('job') === JOB_ID);
  await until(async () => await page.getByTestId('account-ops-page').count() === 1, { label: 'account operations page' });
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  check('the operations page stays within the viewport', geometry.scroll <= geometry.width + 2, JSON.stringify(geometry));
}
