// Date/time mode UI. Three sub-views sharing two date inputs:
//   - Diff:    date A - date B = N days (+ weeks/months/years secondary)
//   - AddSub:  date + N days  = result date (+ weekday)
//   - Weekday: date -> weekday name (zh / en)
//
// ponytail: use Date at UTC noon for day-precision math to dodge DST edges.
// Local-midnight math can shift a day across DST transitions and produce
// off-by-one diffs. Date.UTC(noon) keeps both endpoints anchored in real time
// without TZ ambiguity for calendar arithmetic.

import { useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { Chip, ChipSegment } from './Chip';
import { Panel, Pill } from './Panel';

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
  // Approximate months / years using 30.44-day average. Day-precision is what
  // users actually want; month/year display is illustrative only.
  const monthsApprox = Math.round((days / 30.44) * 10) / 10;
  const yearsApprox = Math.round((days / 365.25) * 10) / 10;
  return { days, weeks, monthsApprox, yearsApprox };
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function DateTime() {
  const { t } = useI18n();
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
      <ChipSegment role="tablist" ariaLabel="Date sub-mode" layout="fill" shape="card">
        <SubTab active={tab === 'diff'} onClick={() => setTab('diff')}>
          {t('date.sub.diff')}
        </SubTab>
        <SubTab active={tab === 'addsub'} onClick={() => setTab('addsub')}>
          {t('date.sub.addsub')}
        </SubTab>
        <SubTab active={tab === 'weekday'} onClick={() => setTab('weekday')}>
          {t('date.sub.weekday')}
        </SubTab>
      </ChipSegment>

      {tab === 'diff' && dateA && dateB && (
        <DiffView a={dateA} b={dateB} onA={setA} onB={setB} />
      )}
      {tab === 'diff' && (!dateA || !dateB) && (
        <ErrorBlock>{t('date.invalid')}</ErrorBlock>
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
        <ErrorBlock>{t('date.invalid')}</ErrorBlock>
      )}
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
    <Chip active={active} onClick={onClick} fill>
      {children}
    </Chip>
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
  const { t } = useI18n();
  const parts = diffParts(a, b);
  const sign = parts.days > 0 ? '+' : '';
  return (
    <>
      <FieldRow label={t('date.field.a')}>
        <input
          type="date"
          value={formatIso(a)}
          onChange={(e) => onA(e.target.value)}
          data-testid="date-a"
          className="ui-field-input"
        />
      </FieldRow>
      <FieldRow label={t('date.field.b')}>
        <input
          type="date"
          value={formatIso(b)}
          onChange={(e) => onB(e.target.value)}
          data-testid="date-b"
          className="ui-field-input"
        />
      </FieldRow>
      <Panel testId="date-diff-result">
        <div className="ui-result-primary" data-testid="date-diff-days">
          {sign}
          {t('date.diff.days', { n: parts.days })}
        </div>
        <div className="ui-result-secondary">
          {t('date.diff.summary', { weeks: parts.weeks, months: parts.monthsApprox, years: parts.yearsApprox })}
        </div>
      </Panel>
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
  const { t, locale } = useI18n();
  const date = parseIso(base);
  if (!date) return <ErrorBlock>{t('date.invalid')}</ErrorBlock>;
  const result = valid ? addDays(date, offset) : null;
  // ponytail: the note labels the *base* date string, so its weekday must be
  // the base date's, not the result's. Old code used result.getUTCDay() when
  // result existed, printing e.g. "注: 2025-01-01 (星期五)" even though
  // 2025-01-01 is Wednesday (Friday was the result's day).
  const baseWeekday = WEEKDAYS_ZH[date.getUTCDay()];
  return (
    <>
      <FieldRow label={t('date.field.base')}>
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <input
            type="date"
            value={base}
            onChange={(e) => onBase(e.target.value)}
            data-testid="date-base"
            className="ui-field-input"
            style={{ flex: 1 }}
          />
          <Pill onClick={onSetToday} testId="date-today" ariaLabel={t('date.today')}>
            {t('date.today')}
          </Pill>
        </div>
      </FieldRow>
      <FieldRow label={t('date.offset.label')}>
        <input
          type="number"
          value={offset}
          onChange={(e) => onOffset(e.target.value)}
          step="1"
          data-testid="date-offset"
          className="ui-field-input"
        />
      </FieldRow>
      {result && valid && (
        <Panel testId="date-addsub-result">
          <div className="ui-result-primary" data-testid="date-addsub-result-iso">
            {formatIso(result)}
          </div>
          <div className="ui-result-secondary" data-testid="date-addsub-weekday">
            {(locale === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN)[result.getUTCDay()]}
          </div>
        </Panel>
      )}
      {!valid && (
        <ErrorBlock>{t('date.offset.invalid')}</ErrorBlock>
      )}
      <div className="ui-result-secondary">{t('date.note', { date: base, weekday: baseWeekday })}</div>
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
  const { t, locale } = useI18n();
  const dow = date.getUTCDay();
  const weekday = (locale === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN)[dow];
  return (
    <>
      <FieldRow label={t('date.field.input')}>
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <input
            type="date"
            value={formatIso(date)}
            onChange={(e) => onDate(e.target.value)}
            data-testid="date-weekday-input"
            className="ui-field-input"
            style={{ flex: 1 }}
          />
          <Pill onClick={onSetToday} testId="date-today" ariaLabel={t('date.today')}>
            {t('date.today')}
          </Pill>
        </div>
      </FieldRow>
      <Panel testId="date-weekday-result">
        <div
          className="ui-result-primary"
          data-testid={locale === 'zh' ? 'date-weekday-zh' : 'date-weekday-en'}
        >
          {weekday}
        </div>
      </Panel>
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
    </label>
  );
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <Panel variant="danger">
      <span style={{ fontSize: 14 }}>{children}</span>
    </Panel>
  );
}