// Sync UI state. Owns the SyncManager lifecycle + persisted config (NOT
// passphrase). Status derived from manager.lastSync + transient connect state.
//
// ponytail: passphrase is held in component state only - never localStorage,
// never sessionStorage, never URL. The user's E2E key dies with the settings
// panel (or page reload). On reconnect they retype. This is the same model
// 1Password / Bitwarden use for the master password.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { setSyncPush, history, type HistoryEntry } from '../history/api';
import {
  createWebDavProvider,
  createSyncManager,
  type SyncManager,
  type WebDavConfig,
  type SyncResult,
} from '../sync';

export type ProviderId = 'jianguoyun' | 'webdav' | 'icloud';

export interface SyncConfig {
  provider: ProviderId;
  endpoint: string;
  username: string;
  path: string;
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; lastSync: number; entries: number }
  | { kind: 'error'; message: string };

interface State {
  config: SyncConfig;
  status: SyncStatus;
  manager: SyncManager | null;
}

type Action =
  | { kind: 'set-config'; config: Partial<SyncConfig> }
  | { kind: 'status'; status: SyncStatus }
  | { kind: 'attach'; manager: SyncManager | null; lastSync: number; entries: number };

const LS_CONFIG_KEY = 'calc:sync-config';

const DEFAULT_CONFIG: SyncConfig = {
  provider: 'jianguoyun',
  endpoint: 'https://dav.jianguoyun.com/dav/',
  username: '',
  path: '/calc/sync.bin',
};

function loadConfig(): SyncConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      provider: (parsed.provider as ProviderId) ?? DEFAULT_CONFIG.provider,
      endpoint: parsed.endpoint ?? DEFAULT_CONFIG.endpoint,
      username: parsed.username ?? '',
      path: parsed.path ?? DEFAULT_CONFIG.path,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(c: SyncConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(c));
  } catch {
    // ignore quota / private mode
  }
}

function reducer(state: State, a: Action): State {
  switch (a.kind) {
    case 'set-config':
      return { ...state, config: { ...state.config, ...a.config } };
    case 'status':
      return { ...state, status: a.status };
    case 'attach':
      return {
        ...state,
        manager: a.manager,
        status:
          a.manager
            ? { kind: 'connected', lastSync: a.lastSync, entries: a.entries }
            : { kind: 'idle' },
      };
  }
}

function initial(): State {
  return {
    config: loadConfig(),
    status: { kind: 'idle' },
    manager: null,
  };
}

export interface UseSync {
  config: SyncConfig;
  status: SyncStatus;
  connected: boolean;
  setConfig(c: Partial<SyncConfig>): void;
  connect(password: string, passphrase: string): Promise<void>;
  disconnect(): Promise<void>;
  syncNow(): Promise<SyncResult>;
}

export function useSync(): UseSync {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const passwordRef = useRef<string>('');

  useEffect(() => {
    saveConfig(state.config);
  }, [state.config]);

  const setConfig = useCallback((c: Partial<SyncConfig>) => dispatch({ kind: 'set-config', config: c }), []);

  const buildManager = useCallback((config: SyncConfig, password: string, passphrase: string): SyncManager => {
    if (config.provider === 'webdav' || config.provider === 'jianguoyun') {
      const webdav: WebDavConfig = {
        endpoint: config.endpoint,
        username: config.username,
        password,
        path: config.path,
      };
      return createSyncManager(createWebDavProvider(webdav), {
        getLocal: () => history.list(),
        setLocal: (entries: HistoryEntry[]) => {
          // Clear + re-record to preserve the public sync API + LocalStorage path.
          history.clear();
          for (const e of entries.reverse()) history.record(e.expression, e.result);
        },
        passphrase,
      });
    }
    if (config.provider === 'icloud') {
      // iCloud provider is a stub until native bridge lands. We still build a
      // manager (it'll throw on pull/push); surface a friendly error on connect.
      throw new Error('iCloud 同步待原生支持');
    }
    throw new Error(`Unknown provider: ${config.provider as string}`);
  }, []);

  const connect = useCallback(
    async (password: string, passphrase: string) => {
      dispatch({ kind: 'status', status: { kind: 'connecting' } });
      try {
        const mgr = buildManager(state.config, password, passphrase);
        const result = await mgr.sync();
        if (!result.ok) {
          dispatch({ kind: 'status', status: { kind: 'error', message: result.error ?? '连接失败' } });
          return;
        }
        setSyncPush(() => mgr.schedulePush());
        passwordRef.current = password;
        dispatch({
          kind: 'attach',
          manager: mgr,
          lastSync: mgr.lastSync,
          entries: history.list().length,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ kind: 'status', status: { kind: 'error', message: msg } });
      }
    },
    [buildManager, state.config],
  );

  const disconnect = useCallback(async () => {
    const mgr = state.manager;
    if (mgr) {
      try {
        await mgr.flushAndCancel();
      } catch {
        // ignore - we still want to detach
      }
    }
    setSyncPush(null);
    passwordRef.current = '';
    dispatch({ kind: 'attach', manager: null, lastSync: 0, entries: 0 });
  }, [state.manager]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    const mgr = state.manager;
    if (!mgr) return { ok: false, error: '未连接' };
    const r = await mgr.sync();
    if (r.ok) {
      dispatch({
        kind: 'attach',
        manager: mgr,
        lastSync: mgr.lastSync,
        entries: history.list().length,
      });
    } else {
      dispatch({ kind: 'status', status: { kind: 'error', message: r.error ?? '同步失败' } });
    }
    return r;
  }, [state.manager]);

  return {
    config: state.config,
    status: state.status,
    connected: state.manager !== null,
    setConfig,
    connect,
    disconnect,
    syncNow,
  };
}