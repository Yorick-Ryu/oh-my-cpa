import React from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Table, Tabs, Typography } from 'antd';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { accountOps, type OpsEvent, type OpsJob, type OpsPreferences, type OpsPreview } from '../../api/accountOps';
import { PageHeader } from '../../components/common/PageHeader';
import { Panel } from '../../components/common/Panel';
import { AppDrawer } from '../../components/common/AppDrawer';
import { LoadFailure, Notice, useToast } from '../../components/feedback';
import { useT } from '../../i18n';
import { isDemoMode } from '../../types/demoMode';
import styles from './AccountOpsPage.module.css';

export const AccountOpsPage: React.FC = () => {
  const t = useT();
  const isDemo = isDemoMode();
  const toast = useToast();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'jobs';
  const jobId = params.get('job');
  const capabilities = useQuery({ queryKey: ['account-ops', 'capabilities'], queryFn: accountOps.capabilities, retry: false, enabled: !isDemo });
  const isAvailable = capabilities.data?.worker_available === true;
  const jobs = useInfiniteQuery({ queryKey: ['account-ops', 'jobs'], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => accountOps.jobs(pageParam), getNextPageParam: page => typeof page.next_cursor === 'string' ? page.next_cursor : undefined, enabled: isAvailable && tab === 'jobs', refetchInterval: 5000 });
  const monitor = useQuery({ queryKey: ['account-ops', 'monitor'], queryFn: accountOps.monitor, enabled: isAvailable && tab === 'monitor', refetchInterval: 15000 });
  const records = useInfiniteQuery({ queryKey: ['account-ops', 'records', params.get('account')], initialPageParam: 0, queryFn: ({ pageParam }) => accountOps.records(pageParam, params.get('account') || undefined), getNextPageParam: page => page.has_more && typeof page.next_cursor === 'number' ? page.next_cursor : undefined, enabled: isAvailable && tab === 'records' });
  const accounts = useQuery({ queryKey: ['account-ops', 'accounts'], queryFn: accountOps.accounts, enabled: isAvailable });
  const preferences = useQuery({ queryKey: ['account-ops', 'preferences'], queryFn: accountOps.preferences, enabled: isAvailable && tab === 'preferences' });
  const detail = useQuery({ queryKey: ['account-ops', 'job', jobId], queryFn: () => accountOps.job(jobId!), enabled: !!jobId && isAvailable, refetchInterval: 3000 });
  const events = useQuery({ queryKey: ['account-ops', 'events', jobId], queryFn: () => accountOps.events(jobId!), enabled: !!jobId && isAvailable, refetchInterval: 3000 });
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState<OpsPreview>();
  const [mode, setMode] = React.useState(params.get('mode') === 'reauth' ? 'reauth' : 'record');
  const [selectedAccount, setSelectedAccount] = React.useState<string>();
  const [password, setPassword] = React.useState('');
  const [totp, setTotp] = React.useState('');
  const [confirmedAmount, setConfirmedAmount] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [edited, setEdited] = React.useState<OpsPreferences>();
  React.useEffect(() => {
    const email = params.get('email');
    if (!email) return;
    const matched = (accounts.data?.items || []).filter(account => account.email.toLowerCase() === email.toLowerCase());
    if (matched.length === 1) setSelectedAccount(matched[0].id);
  }, [accounts.data, params]);
  const currentAccount = accounts.data?.items?.find(account => account.id === selectedAccount);
  React.useEffect(() => { setPassword(''); setTotp(''); }, [selectedAccount, mode]);
  const idempotency = React.useRef(new Map<string, string>());
  const time = (value?: number) => value ? new Date(value * 1000).toLocaleString() : t('ops.unknown');
  const label = (value: string) => t(`ops.code.${value}`);
  const navigate = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value === null ? next.delete(key) : next.set(key, value));
    setParams(next);
  };
  const refresh = () => cache.invalidateQueries({ queryKey: ['account-ops'] });
  const act = async (work: () => Promise<unknown>) => {
    setIsBusy(true);
    try { await work(); await refresh(); } catch (error) { toast.error(t('ops.load_failed'), { error }); } finally { setIsBusy(false); }
  };
  const open = (job: OpsJob) => navigate({ job: job.id, tab: 'jobs' });
  const submit = (body: Record<string, unknown>) => act(async () => {
    const fingerprint = JSON.stringify(body);
    let key = idempotency.current.get(fingerprint);
    if (!key) { key = crypto.randomUUID(); idempotency.current.set(fingerprint, key); }
    open(await accountOps.submit({ ...body, instance: capabilities.data?.instance || 'clouvider' }, key));
  });
  const eventColumns = [
    { title: t('ops.time'), key: 'time', render: (_: unknown, row: OpsEvent) => time(row.time) },
    { title: t('ops.type'), dataIndex: 'kind', render: label },
    { title: t('ops.phase'), dataIndex: 'phase', render: label },
    { title: t('ops.result'), dataIndex: 'reason', render: label },
    { title: t('ops.source'), dataIndex: 'source', render: label },
  ];
  return <div className={styles['page']} data-testid="account-ops-page">
    <PageHeader title={t('ops.title')} subtitle={capabilities.data?.instance ? `${t('ops.target')} ${capabilities.data.instance}` : t('ops.target')} actions={<Button onClick={() => void refresh()}>{t('common.refresh')}</Button>} />
    {isDemo && <Notice tone="info" title={t('ops.unavailable')} data-testid="account-ops-demo" />}
    {capabilities.isError && <LoadFailure title={t('ops.unavailable')} error={capabilities.error} onRetry={() => void capabilities.refetch()} />}
    {capabilities.data?.synthetic && <Notice tone="warning" title={t('ops.synthetic')} />}
    <Tabs activeKey={tab} onChange={value => navigate({ tab: value })} items={['jobs', 'monitor', 'records', 'import', 'preferences'].map(key => ({ key, label: t(`ops.tab.${key}`) }))} />
    {isAvailable && tab === 'jobs' && <Panel>
      {jobs.isError ? <LoadFailure title={t('ops.load_failed')} error={jobs.error} onRetry={() => void jobs.refetch()} /> : <Table<OpsJob> rowKey="id" dataSource={jobs.data?.pages.flatMap(page => page.items || []) || []} loading={jobs.isPending} pagination={false} scroll={{ x: true }} columns={[
        { title: t('ops.type'), dataIndex: 'kind', render: label },
        { title: t('ops.state'), dataIndex: 'state', render: label },
        { title: t('ops.phase'), dataIndex: 'phase', render: label },
        { title: t('ops.result'), dataIndex: 'reason', render: label },
        { title: t('ops.time'), key: 'created', render: (_, row) => time(row.created) },
        { title: t('common.details'), key: 'details', render: (_, row) => <Button onClick={() => open(row)}>{t('common.details')}</Button> },
      ]} />}
      {jobs.hasNextPage && <Button loading={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>{t('common.more')}</Button>}
    </Panel>}
    {isAvailable && tab === 'monitor' && <>
      <Notice tone="info" title={t('ops.history_incomplete')} />
      {monitor.isError && <LoadFailure title={t('ops.load_failed')} error={monitor.error} onRetry={() => void monitor.refetch()} />}
      <Panel><Table rowKey="kind" pagination={false} loading={monitor.isPending} dataSource={monitor.data?.sources || []} scroll={{ x: true }} columns={[
        { title: t('ops.source'), dataIndex: 'kind', render: label },
        { title: t('ops.state'), key: 'available', render: (_, row) => t(row.available ? 'ops.available' : 'ops.no_history') },
        { title: t('ops.time'), key: 'last', render: (_, row) => time(row.last_run) },
        { title: t('ops.notifications'), dataIndex: 'pending_notifications' },
      ]} /></Panel>
      <Typography.Paragraph>{t('ops.notifications')}: {monitor.data?.notifications?.pending ?? 0} · {t('ops.next_retry')}: {time(monitor.data?.notifications?.next_retry)}</Typography.Paragraph>
      <Panel><Table rowKey="kind" pagination={false} dataSource={monitor.data?.schedules || []} scroll={{ x: true }} columns={[
        { title: t('ops.type'), dataIndex: 'kind', render: label },
        { title: t('ops.owner'), dataIndex: 'owner', render: label },
        { title: t('ops.enabled'), key: 'enabled', render: (_, row) => t(row.enabled ? 'ops.yes' : 'ops.no') },
        { title: t('ops.running'), key: 'running', render: (_, row) => row.running == null ? t('ops.unknown') : t(row.running ? 'ops.yes' : 'ops.no') },
        { title: t('ops.next_run'), key: 'next', render: (_, row) => time(row.next_run) },
        { title: t('ops.interval'), key: 'interval', render: (_, row) => `${row.interval_seconds / 60} ${t('ops.minutes')}` },
      ]} /></Panel>
    </>}
    {isAvailable && tab === 'records' && <Panel>
      {records.isError && <LoadFailure title={t('ops.load_failed')} error={records.error} onRetry={() => void records.refetch()} />}
      <Table<OpsEvent> rowKey="cursor" dataSource={records.data?.pages.flatMap(page => page.items || []) || []} columns={eventColumns} loading={records.isPending} scroll={{ x: true }} />
      {records.hasNextPage && <Button loading={records.isFetchingNextPage} onClick={() => void records.fetchNextPage()}>{t('common.more')}</Button>}
    </Panel>}
    {isAvailable && tab === 'import' && <Panel>
      {!capabilities.data?.browser && <Notice tone="info" title={t('ops.browser_unavailable')} />}
      <Space orientation="vertical" className={styles['form']}>
        <Select aria-label={t('ops.mode')} value={mode} onChange={value => { setMode(value); setPreview(undefined); }} options={['record', 'login', 'reauth', 'apply_preferences'].map(value => ({ value, label: label(value), disabled: value !== 'record' && !capabilities.data?.browser }))} />
        {mode === 'reauth' || mode === 'apply_preferences' ? <>
          <Select aria-label={t('ops.account')} value={selectedAccount} onChange={setSelectedAccount} options={(accounts.data?.items || []).map(account => ({ value: account.id, label: `${account.email} · ${account.workspace || t('ops.unknown')}` }))} />
          {mode === 'reauth' && selectedAccount && <><Typography.Text>{t(currentAccount?.has_credentials ? 'ops.credentials_saved' : 'ops.credentials_required')}</Typography.Text>
            <Input.Password value={password} autoComplete="new-password" aria-label={t('ops.password')} placeholder={t('ops.password')} onChange={event => setPassword(event.target.value)} />
            <Input.Password value={totp} autoComplete="off" aria-label={t('ops.totp')} placeholder={t('ops.totp')} onChange={event => setTotp(event.target.value)} />
            <Button disabled={!password || !totp} loading={isBusy} onClick={() => void act(async () => { await accountOps.credentials(selectedAccount, password, totp); setPassword(''); setTotp(''); })}>{t('ops.save_credentials')}</Button></>}
          <Button type="primary" disabled={!selectedAccount || !capabilities.data?.browser || (mode === 'reauth' && !currentAccount?.has_credentials)} loading={isBusy} onClick={() => void submit({ kind: mode, account_id: selectedAccount })}>{t('ops.submit')}</Button>
        </> : <>
          <Input.TextArea value={text} onChange={event => setText(event.target.value)} rows={7} autoComplete="off" spellCheck={false} aria-label={t('ops.paste')} placeholder={t('ops.paste')} />
          <Button loading={isBusy} disabled={!text.trim()} onClick={() => void act(async () => { setPreview(await accountOps.preview(text, capabilities.data?.instance || 'clouvider')); setText(''); setConfirmedAmount(false); })}>{t('ops.preview')}</Button>
          {preview && <><Checkbox checked={confirmedAmount} onChange={event => setConfirmedAmount(event.target.checked)}>{t('ops.confirm_amount')}</Checkbox><Button loading={isBusy} disabled={preview.rows.some(row => row.issues.some(issue => issue !== 'missing_credentials' && !(issue === 'confirm_per_account_amount' && confirmedAmount)) || (mode === 'login' && !row.has_credentials))} onClick={() => void submit({ kind: mode, draft_id: preview.draft_id, confirm_amount: confirmedAmount })}>{t('ops.submit_batch')}</Button><Table rowKey="index" dataSource={preview.rows} pagination={false} scroll={{ x: true }} columns={[
            { title: t('ops.account'), dataIndex: 'email' },
            { title: t('ops.order'), dataIndex: 'order_id' },
            { title: t('ops.amount'), key: 'amount', render: (_, row) => row.amount_cents == null ? t('ops.unknown') : `¥${(row.amount_cents / 100).toFixed(2)}` },
            { title: t('ops.expiry'), dataIndex: 'expires_at' },
            { title: t('ops.result'), key: 'issues', render: (_, row) => row.issues.map(label).join(' · ') },
            { title: t('ops.submit'), key: 'submit', render: (_, row) => <Button loading={isBusy} disabled={row.issues.some(issue => issue !== 'missing_credentials' && !(issue === 'confirm_per_account_amount' && confirmedAmount)) || (mode === 'login' && !row.has_credentials)} onClick={() => void submit({ kind: mode, draft_id: preview.draft_id, row_index: row.index, confirm_amount: confirmedAmount })}>{t('ops.submit')}</Button> },
          ]} /></>}
        </>}
      </Space>
    </Panel>}
    {isAvailable && tab === 'preferences' && <Panel>
      {preferences.isError && <LoadFailure title={t('ops.load_failed')} error={preferences.error} onRetry={() => void preferences.refetch()} />}
      {preferences.data && <Space orientation="vertical" className={styles['form']}>
        <Typography.Text>{t('ops.preference_hint')}</Typography.Text>
        <Checkbox checked={(edited || preferences.data.value).websockets} onChange={event => setEdited({ ...(edited || preferences.data!.value), websockets: event.target.checked })}>{t('ops.websockets')}</Checkbox>
        <label>{t('ops.priority')} <InputNumber min={-100} max={100} value={(edited || preferences.data.value).priority} onChange={value => setEdited({ ...(edited || preferences.data!.value), priority: value || 0 })} /></label>
        <Typography.Text>{t('ops.quality_hint')}</Typography.Text>
        <Select aria-label={t('ops.proxy_policy')} value={(edited || preferences.data.value).proxy_policy} onChange={value => setEdited({ ...(edited || preferences.data!.value), proxy_policy: value })} options={['preserve', 'independent_ipv6'].map(value => ({ value, label: t(`ops.proxy.${value}`), disabled: value === 'independent_ipv6' && !capabilities.data?.proxy }))} />
        <Checkbox disabled={capabilities.data?.instance !== 'clouvider'} checked={(edited || preferences.data.value).auto_enroll} onChange={event => setEdited({ ...(edited || preferences.data!.value), auto_enroll: event.target.checked })}>{t('ops.auto_enroll')}</Checkbox>
        <Button type="primary" disabled={!edited} loading={isBusy} onClick={() => void act(async () => { await accountOps.savePreferences(preferences.data!.version, edited!); setEdited(undefined); })}>{t('common.save')}</Button>
      </Space>}
    </Panel>}
    <AppDrawer title={t('common.details')} open={!!jobId} onClose={() => navigate({ job: null })} width="wide">
      {detail.isError && <LoadFailure title={t('ops.load_failed')} error={detail.error} onRetry={() => void detail.refetch()} />}
      {detail.data && <Space orientation="vertical" className={styles['form']}>
        <Typography.Text code>{detail.data.id}</Typography.Text>
        <Typography.Text>{label(detail.data.state)} · {label(detail.data.phase)} · {label(detail.data.reason)}</Typography.Text>
        {detail.data.snapshot?.order && <Typography.Text>{detail.data.snapshot.order.order_id} · {detail.data.snapshot.order.amount_cents == null ? t('ops.unknown') : `¥${(detail.data.snapshot.order.amount_cents / 100).toFixed(2)}`} · {detail.data.snapshot.order.expires_at}</Typography.Text>}
        {detail.data.children && <Table rowKey="row_index" pagination={false} dataSource={detail.data.children} scroll={{ x: true }} columns={[{ title: t('ops.account'), dataIndex: 'row_index', render: value => value + 1 }, { title: t('ops.state'), render: (_, row) => label(row.job.state) }, { title: t('common.details'), render: (_, row) => <Button onClick={() => open(row.job)}>{t('common.details')}</Button> }]} />}
        <Space>{(detail.data.allowed_actions || []).filter(action => action === 'cancel' || action === 'resume').map(action => <Button key={action} loading={isBusy} onClick={() => void act(async () => { await accountOps.action(jobId!, action as 'cancel' | 'resume'); })}>{t(`ops.${action}`)}</Button>)}</Space>
        {events.isError && <LoadFailure title={t('ops.load_failed')} error={events.error} onRetry={() => void events.refetch()} />}
        <Table<OpsEvent> rowKey="cursor" dataSource={events.data?.items || []} columns={eventColumns} pagination={false} scroll={{ x: true }} />
      </Space>}
    </AppDrawer>
  </div>;
};
