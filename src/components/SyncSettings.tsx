// Sync settings panel. Lets user pick a provider preset, fill in credentials,
// enter a passphrase for E2E, and connect/disconnect. Persists config (no
// secrets) to localStorage; passphrase lives only in this component's state.
//
// ponytail: provider + endpoint + username are the only fields persisted.
// Passwords and passphrase never touch localStorage / sessionStorage - they're
// held in React state and lost on page reload. User must retype to reconnect.
// This is the standard password-manager pattern (1Password master pw, Bitwarden
// vault pw). Forces explicit reconnect after each session.

import { type CSSProperties, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { useSync, type ProviderId } from '../hooks/useSync';
import {
  JIANGUOYUN_PRESET,
  GENERIC_WEBDAV_PRESET,
  type WebDavPreset,
} from '../sync';
import { Field, Modal, Pill, Section } from './Panel';

interface Props {
  open: boolean;
  onClose(): void;
}

const PRESETS: Record<ProviderId, WebDavPreset | null> = {
  jianguoyun: JIANGUOYUN_PRESET,
  webdav: GENERIC_WEBDAV_PRESET,
  icloud: null,
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  jianguoyun: '坚果云',
  webdav: 'WebDAV',
  icloud: 'iCloud',
};

export function SyncSettings({ open, onClose }: Props) {
  const { t } = useI18n();
  const sync = useSync();
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  function applyPreset(provider: ProviderId) {
    const preset = PRESETS[provider];
    sync.setConfig({
      provider,
      endpoint: preset?.endpoint ?? '',
      path: preset?.path ?? '/calc/sync.bin',
    });
    setPassword('');
  }

  async function onConnect() {
    if (sync.config.provider !== 'icloud' && !sync.config.endpoint) return;
    if (!password) return;
    if (passphrase.length < 8) return;
    if (passphrase !== confirmPassphrase) return;
    // ponytail: capture status before the await; after, sync.status reflects the
    // outcome. Only clear the entered credentials on success — a failed connect
    // used to wipe the password + passphrase, forcing a full retype to retry.
    await sync.connect(password, passphrase);
    if (sync.status.kind === 'connected') {
      setPassword('');
      setPassphrase('');
      setConfirmPassphrase('');
    }
  }

  const preset = PRESETS[sync.config.provider];
  const canSubmit =
    !!sync.config.username &&
    !!password &&
    passphrase.length >= 8 &&
    passphrase === confirmPassphrase &&
    (sync.config.provider === 'icloud' || !!sync.config.endpoint);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={t('common.syncSettings')} testId="sync-settings">
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{t('sync.title')}</h2>
        <Pill onClick={onClose} ariaLabel={t('common.close')}>
          {'\u2715'}
        </Pill>
      </div>

      <div style={bodyStyle}>
        {/* Status banner */}
        <StatusBanner status={sync.status} onSyncNow={sync.syncNow} connected={!!sync.connected} />

        {/* Provider selection */}
        <Section title={t('sync.section.service')}>
          <div role="radiogroup" aria-label={t('sync.section.service')} style={radioGroupStyle}>
            {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
              <label key={id} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="provider"
                  value={id}
                  checked={sync.config.provider === id}
                  onChange={() => applyPreset(id)}
                  disabled={!!sync.connected}
                />
                <span>{PROVIDER_LABELS[id]}</span>
              </label>
            ))}
          </div>
          {preset && (
            <p style={hintStyle}>
              {preset.usernameHint}
              <br />
              <span style={{ color: 'var(--accent)' }}>{preset.passwordHint}</span>
            </p>
          )}
          {sync.config.provider === 'icloud' && (
            <p style={hintStyle}>
              {t('sync.icloud.placeholder')}
            </p>
          )}
        </Section>

        {/* WebDAV config */}
        {sync.config.provider !== 'icloud' && (
          <Section title={t('sync.section.server')}>
            <Field
              label={t('sync.field.endpoint')}
              hint={undefined}
            >
              <input
                type="text"
                value={sync.config.endpoint}
                onChange={(e) => sync.setConfig({ endpoint: e.target.value })}
                placeholder="https://dav.jianguoyun.com/dav/"
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-endpoint"
              />
            </Field>
            <Field label={t('sync.field.username')}>
              <input
                type="text"
                value={sync.config.username}
                onChange={(e) => sync.setConfig({ username: e.target.value })}
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-username"
              />
            </Field>
            <Field
              label={t('sync.field.password')}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-password"
              />
            </Field>
            <Field label={t('sync.field.path')}>
              <input
                type="text"
                value={sync.config.path}
                onChange={(e) => sync.setConfig({ path: e.target.value })}
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-path"
              />
            </Field>
          </Section>
        )}

        {/* Passphrase */}
        {sync.config.provider !== 'icloud' && (
          <Section title={t('sync.section.encryption')}>
            <Field
              label={t('sync.field.passphrase')}
              hint={t('sync.field.passphrase.hint')}
            >
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-passphrase"
              />
            </Field>
            <Field
              label={t('sync.field.passphrase.confirm')}
              error={confirmPassphrase && passphrase !== confirmPassphrase ? t('sync.field.passphrase.mismatch') : undefined}
            >
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                disabled={!!sync.connected}
                autoComplete="off"
                className="ui-field-input"
                data-testid="sync-passphrase-confirm"
              />
            </Field>
          </Section>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)' }}>
          {!sync.connected ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={!canSubmit}
              style={{
                ...primaryBtnStyle,
                opacity: canSubmit ? 1 : 0.5,
              }}
              data-testid="sync-connect"
            >
              {t('sync.action.connect')}
            </button>
          ) : (
            <button
              type="button"
              onClick={sync.disconnect}
              style={dangerBtnStyle}
              data-testid="sync-disconnect"
            >
              {t('sync.action.disconnect')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StatusBanner({
  status,
  onSyncNow,
  connected,
}: {
  status: ReturnType<typeof useSync>['status'];
  onSyncNow(): Promise<unknown>;
  connected: boolean;
}) {
  const { t } = useI18n();
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    idle: { bg: 'var(--bg-elevated)', fg: 'var(--text-secondary)', label: t('sync.status.idle') },
    connecting: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: t('sync.status.connecting') },
    connected: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: t('sync.status.connected') },
    error: { bg: 'var(--danger-soft)', fg: 'var(--danger)', label: t('sync.status.error') },
  };
  const tone = palette[status.kind] ?? palette.idle;
  let label = tone.label;
  if (status.kind === 'connected') {
    label = t('sync.status.connected.summary', { time: formatTime(status.lastSync), count: status.entries });
  } else if (status.kind === 'error') {
    label = `${tone.label}: ${status.message}`;
  }

  return (
    <div
      style={{
        padding: 'var(--s-3) var(--s-4)',
        borderRadius: 'var(--radius-md)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--s-3)',
        marginBottom: 'var(--s-4)',
      }}
      data-status={status.kind}
      data-testid="sync-status"
    >
      <span>{label}</span>
      {connected && (
        <button
          type="button"
          onClick={() => onSyncNow()}
          style={linkBtnStyle}
          data-testid="sync-now"
        >
          {t('sync.action.syncNow')}
        </button>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--s-4) var(--s-5)',
  borderBottom: '0.5px solid var(--hairline)',
};

const bodyStyle: CSSProperties = {
  padding: 'var(--s-4) var(--s-5)',
  overflowY: 'auto',
  flex: 1,
};

const radioGroupStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--s-3)',
  marginBottom: 'var(--s-3)',
};

const radioLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--s-1)',
  padding: 'var(--s-2) var(--s-3)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--hairline)',
  cursor: 'pointer',
  fontSize: 14,
};

const hintStyle: CSSProperties = {
  display: 'block',
  marginTop: 'var(--s-1)',
  fontSize: 12,
  color: 'var(--text-tertiary)',
  lineHeight: 1.4,
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--s-3) var(--s-4)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  fontSize: 16,
  fontWeight: 600,
};

const dangerBtnStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--s-3) var(--s-4)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--danger-soft)',
  color: 'var(--danger)',
  fontSize: 16,
  fontWeight: 600,
};

const linkBtnStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--accent)',
  fontWeight: 600,
};