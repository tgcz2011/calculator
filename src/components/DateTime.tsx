// Date/time mode UI. Three sub-views sharing two date inputs:
//   - Diff:    date A - date B = N days (+ weeks/months/years secondary)
//   - AddSub:  date + N days  = result date (+ weekday)
//   - Weekday: date -> weekday name (zh / en)
//
// ponytail: use Date at UTC noon for day-precision math to dodge DST edges.
// Local-midnight math can shift a day across DST transitions and produce
// off-by-one diffs. Date.UTC(noon) keeps both endpoints anchored in real time
// without TZ ambiguity for calendar arithmetic.

import { type CSSProperties, useState } from 'react';

type SubTab = 'diff' | 'addsub' | 'weekday';

const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function todayIso(): string {
  const d = new Date();
  return formatIso(d);
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!y || !mo || !da) return null;
  // Anchor at UTC noon so local-time shifts don't move the date.
  return new Date(Date.UTC(y, mo - 1, da, 12));
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

interface DiffParts {
  days: number;
  weeks: number;
  monthsApprox: number;
  yearsApprox: number;
}

function diffParts(a: Date, b: Date): DiffParts {
  const days = diffDays(a, b);
  const weeks = Math.trunc(days / 7);
  const remDays = days - weeks * 7;
  // Approximate months / years using 30.44-day average. Day-precision is what
  // users actually want; month/year display is illustrative only.
  const monthsApprox = Math.round((days / 30.44) * 10) / 10;
  const yearsApprox = Math.round((days / 365.25) * 10) / 10;
  void remDays;
  return { days, weeks, monthsApprox, yearsApprox };
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function DateTime() {
  const [tab, setTab] = useState<SubTab>('diff');
  const [a, setA] = useState(todayIso);
  const [b, setB] = useState(todayIso);
  const [offset, setOffset] = useState('7');

  const dateA = parseIso(a);
  const dateB = parseIso(b);
  const offsetNum = Number(offset);
  const validOffset = Number.isFinite(offsetNum) && Number.isInteger(offsetNum);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-4)',
        padding: 'var(--s-4) var(--s-4) 0',
        overflow: 'auto',
      }}
      data-testid="date-mode"
    >
      <div role="tablist" aria-label="Date sub-mode" style={subTabsStyle}>
        <SubTab active={tab === 'diff'} onClick={() => setTab('diff')}>
          差值
        </SubTab>
        <SubTab active={tab === 'addsub'} onClick={() => setTab('addsub')}>
          加减
        </SubTab>
        <SubTab active={tab === 'weekday'} onClick={() => setTab('weekday')}>
          星期
        </SubTab>
      </div>

      {tab === 'diff' && dateA && dateB && (
        <DiffView a={dateA} b={dateB} onA={setA} onB={setB} />
      )}
      {tab === 'diff' && (!dateA || !dateB) && (
        <ErrorBlock>请输入有效日期（YYYY-MM-DD）</ErrorBlock>
      )}

      {tab === 'addsub' && (
        <AddSubView
          base={a}
          offset={offsetNum}
          valid={validOffset}
          onBase={setA}
          onOffset={setOffset}
          onSetToday={() => setA(todayIso())}
        />
      )}

      {tab === 'weekday' && dateA && (
        <WeekdayView date={dateA} onDate={setA} onSetToday={() => setA(todayIso())} />
      )}
      {tab === 'weekday' && !dateA && (
        <ErrorBlock>请输入有效日期（YYYY-MM-DD）</ErrorBlock>
      )}
    </div>
  );
}

function DiffView({
  a,
  b,
  onA,
  onB,
}: {
  a: Date;
  b: Date;
  onA(s: string): void;
  onB(s: string): void;
}) {
  const parts = diffParts(a, b);
  const sign = parts.days > 0 ? '+' : '';
  return (
    <>
      <FieldRow label="日期 A">
        <input
          type="date"
          value={formatIso(a)}
          onChange={(e) => onA(e.target.value)}
          data-testid="date-a"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="日期 B">
        <input
          type="date"
          value={formatIso(b)}
          onChange={(e) => onB(e.target.value)}
          data-testid="date-b"
          style={inputStyle}
        />
      </FieldRow>
      <ResultCard testId="date-diff-result">
        <div style={primaryResultStyle} data-testid="date-diff-days">
          {sign}
          {parts.days} 天
        </div>
        <div style={secondaryResultStyle}>
          ≈ {parts.weeks} 周
          {' · '}
          {parts.monthsApprox} 月
          {' · '}
          {parts.yearsApprox} 年
        </div>
      </ResultCard>
    </>
  );
}

function AddSubView({
  base,
  offset,
  valid,
  onBase,
  onOffset,
  onSetToday,
}: {
  base: string;
  offset: number;
  valid: boolean;
  onBase(s: string): void;
  onOffset(s: string): void;
  onSetToday(): void;
}) {
  const date = parseIso(base);
  if (!date) return <ErrorBlock>请输入有效日期（YYYY-MM-DD）</ErrorBlock>;
  const result = valid ? addDays(date, offset) : null;
  const weekday = WEEKDAYS_ZH[result ? result.getUTCDay() : date.getUTCDay()];
  return (
    <>
      <FieldRow label="基准日期">
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <input
            type="date"
            value={base}
            onChange={(e) => onBase(e.target.value)}
            data-testid="date-base"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={onSetToday} style={todayBtnStyle} data-testid="date-today">
            今天
          </button>
        </div>
      </FieldRow>
      <FieldRow label="天数（负数往前推）">
        <input
          type="number"
          value={offset}
          onChange={(e) => onOffset(e.target.value)}
          step="1"
          data-testid="date-offset"
          style={inputStyle}
        />
      </FieldRow>
      {result && valid && (
        <ResultCard testId="date-addsub-result">
          <div style={primaryResultStyle} data-testid="date-addsub-result-iso">
            {formatIso(result)}
          </div>
          <div style={secondaryResultStyle}>
            {WEEKDAYS_ZH[result.getUTCDay()]} · {WEEKDAYS_EN[result.getUTCDay()]}
          </div>
        </ResultCard>
      )}
      {!valid && (
        <ErrorBlock>天数必须是整数</ErrorBlock>
      )}
      <div style={secondaryResultStyle}>{`注: ${base} (${weekday})`}</div>
    </>
  );
}

function WeekdayView({
  date,
  onDate,
  onSetToday,
}: {
  date: Date;
  onDate(s: string): void;
  onSetToday(): void;
}) {
  const dow = date.getUTCDay();
  return (
    <>
      <FieldRow label="日期">
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <input
            type="date"
            value={formatIso(date)}
            onChange={(e) => onDate(e.target.value)}
            data-testid="date-weekday-input"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={onSetToday} style={todayBtnStyle} data-testid="date-today">
            今天
          </button>
        </div>
      </FieldRow>
      <ResultCard testId="date-weekday-result">
        <div style={primaryResultStyle} data-testid="date-weekday-zh">
          {WEEKDAYS_ZH[dow]}
        </div>
        <div style={secondaryResultStyle} data-testid="date-weekday-en">
          {WEEKDAYS_EN[dow]}
        </div>
      </ResultCard>
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function ResultCard({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: 'var(--s-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-1)',
      }}
    >
      {children}
    </div>
  );
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 'var(--s-3)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--danger-soft)',
        color: 'var(--danger)',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 0',
        borderRadius: 'var(--radius-md)',
        fontSize: 14,
        fontWeight: 600,
        background: active ? 'var(--text)' : 'transparent',
        color: active ? 'var(--bg-elevated)' : 'var(--fg)',
        transition: 'background-color var(--dur) var(--ease-apple), color var(--dur) var(--ease-apple)',
      }}
    >
      {children}
    </button>
  );
}

const subTabsStyle: CSSProperties = {
  display: 'flex',
  background: 'var(--key-fn-bg)',
  borderRadius: 'var(--radius-md)',
  padding: 4,
};

const inputStyle: CSSProperties = {
  padding: 'var(--s-3)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--hairline)',
  color: 'var(--fg)',
  fontSize: 16,
  fontFamily: 'inherit',
};

const primaryResultStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 300,
  letterSpacing: '-0.02em',
  color: 'var(--fg)',
  fontVariantNumeric: 'tabular-nums',
};

const secondaryResultStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--fg-tertiary)',
};

const todayBtnStyle: CSSProperties = {
  padding: 'var(--s-3) var(--s-3)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--key-fn-bg)',
  color: 'var(--key-fn-fg)',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};