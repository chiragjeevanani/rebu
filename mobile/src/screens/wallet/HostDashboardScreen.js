// Host earnings: balance, daily chart, breakdown by source and a full statement.
import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import {
  CircleHelp,
  Flag,
  Gift,
  MessageCircle,
  Phone,
  ReceiptText,
  Sparkles,
  Ticket,
  Video,
  Wallet,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import {
  ECONOMY,
  SOURCES,
  daysAgo,
  inr,
  split,
  timeLabel,
} from '../../data/economy';
import { num } from '../../utils/format';
import { canGoLive, hostIdLabel } from '../../utils/hosting';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Sheet from '../../components/Sheet';
import ListRow, { Card } from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const RANGES = [
  { key: 'today', label: 'Today', maxDays: 0 },
  { key: 'week', label: '7 days', maxDays: 6 },
  { key: 'month', label: '30 days', maxDays: 29 },
  { key: 'all', label: 'All time', maxDays: Infinity },
];
const ICONS = {
  video: Video,
  voice: Phone,
  chat: MessageCircle,
  gift: Gift,
  ticket: Ticket,
  bonus: Sparkles,
};
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'calls', label: 'Calls', match: s => s === 'video' || s === 'voice' },
  { key: 'chat', label: 'Chats', match: s => s === 'chat' },
  { key: 'gift', label: 'Gifts', match: s => s === 'gift' },
  { key: 'ticket', label: 'Tickets', match: s => s === 'ticket' },
  { key: 'bonus', label: 'Bonuses', match: s => s === 'bonus' },
];
const REPORT_REASONS = [
  'Call time is wrong',
  'Amount looks wrong',
  'Gift is missing',
  'Something else',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHART_H = 120;

function Row({ label, value, strong, color }) {
  return (
    <View style={styles.line}>
      <Txt variant={strong ? 'label' : 'small'}>{label}</Txt>
      <Txt variant="label" color={color}>
        {value}
      </Txt>
    </View>
  );
}

/** Last 7 days of net earnings, one bar per day (single series). */
function WeekChart({ earnings }) {
  const days = useMemo(() => {
    const out = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { ago: 6 - i, label: WEEKDAYS[d.getDay()], net: 0 };
    });
    for (const e of earnings) {
      const ago = daysAgo(e.ts);
      if (ago <= 6) out[6 - ago].net += split(e).net;
    }
    return out;
  }, [earnings]);
  const [sel, setSel] = useState(6);
  const max = Math.max(...days.map(d => d.net), 1);

  return (
    <Card>
      <View style={styles.chartHead}>
        <Txt variant="label">Daily earnings</Txt>
        <Txt variant="small">
          {days[sel].ago === 0 ? 'Today' : days[sel].label} ·{' '}
          <Txt variant="label">{inr(days[sel].net)}</Txt>
        </Txt>
      </View>
      <View style={styles.chart}>
        {days.map((d, i) => {
          const h = d.net ? Math.max(4, (d.net / max) * CHART_H) : 2;
          return (
            <Pressable
              key={i}
              style={styles.slot}
              onPress={() => setSel(i)}
              hitSlop={4}
            >
              <View style={styles.barArea}>
                <View
                  style={[
                    styles.bar,
                    { height: h },
                    !d.net && styles.barEmpty,
                    i !== sel && d.net ? styles.barDim : null,
                  ]}
                />
              </View>
              <Txt style={[styles.dayLabel, i === sel && styles.dayLabelOn]}>
                {d.ago === 0 ? 'Today' : d.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export default function HostDashboardScreen({ navigation }) {
  useSecureScreen();
  const { earnings, balance, hostAgency, reportEarning, user, config } =
    useApp();
  const [range, setRange] = useState('week');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [info, setInfo] = useState(false);

  const maxDays = RANGES.find(r => r.key === range).maxDays;
  const inRange = useMemo(
    () => earnings.filter(e => daysAgo(e.ts) <= maxDays),
    [earnings, maxDays],
  );
  const sum = useMemo(() => {
    const out = { gross: 0, commission: 0, agency: 0, net: 0, bySource: {} };
    for (const e of inRange) {
      const s = split(e);
      out.gross += s.gross;
      out.commission += s.commission;
      out.agency += s.agency;
      out.net += s.net;
      if (!out.bySource[e.source]) {
        out.bySource[e.source] = { net: 0, count: 0, qty: 0 };
      }
      const b = out.bySource[e.source];
      b.net += s.net;
      b.count += 1;
      b.qty += e.minutes || (e.source === 'chat' ? 1 : 0);
    }
    return out;
  }, [inRange]);
  const sources = Object.keys(SOURCES).filter(k => sum.bySource[k]);
  const topNet = Math.max(...sources.map(k => sum.bySource[k].net), 1);

  const f = FILTERS.find(x => x.key === filter);
  const statement = f.match ? inRange.filter(e => f.match(e.source)) : inRange;
  const selected = open && earnings.find(e => e.id === open);
  const sel = selected && split(selected);

  return (
    <Screen scroll>
      <Header
        title="Earnings"
        subtitle={`Host ID ${hostIdLabel(user)} · ${
          hostAgency ? `Agency ${hostAgency}` : 'Independent'
        }`}
        right={
          <Pressable onPress={() => setInfo(true)} hitSlop={8}>
            <CircleHelp size={24} color={colors.ink} />
          </Pressable>
        }
      />
      <View style={styles.body}>
        {/* Balance */}
        <View style={styles.hero}>
          <Txt style={styles.heroLabel}>Available to withdraw</Txt>
          <Txt style={styles.heroAmount}>{inr(balance.available)}</Txt>
          <View style={styles.heroRow}>
            <View>
              <Txt style={styles.heroSmallLabel}>On hold</Txt>
              <Txt style={styles.heroSmall}>{inr(balance.onHold)}</Txt>
            </View>
            <View>
              <Txt style={styles.heroSmallLabel}>Withdrawn</Txt>
              <Txt style={styles.heroSmall}>{inr(balance.withdrawn)}</Txt>
            </View>
            <View>
              <Txt style={styles.heroSmallLabel}>Lifetime</Txt>
              <Txt style={styles.heroSmall}>{inr(balance.lifetime)}</Txt>
            </View>
          </View>
          <Button
            title="Withdraw"
            icon={Wallet}
            variant="light"
            size="md"
            style={styles.withdraw}
            onPress={() => navigation.navigate('Withdraw')}
          />
        </View>

        {earnings.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Txt variant="h3" center>
              No earnings yet
            </Txt>
            <Txt variant="small" center style={styles.emptySub}>
              Turn on “Available for calls” or go live — every paid minute,
              message and gift shows up here.
            </Txt>
            {canGoLive(user, config) ? (
              <Button
                title="Go live"
                size="md"
                icon={Video}
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('GoLive')}
              />
            ) : null}
          </Card>
        ) : (
          <>
            <WeekChart earnings={earnings} />

            <View style={styles.ranges}>
              {RANGES.map(r => (
                <Chip
                  key={r.key}
                  label={r.label}
                  small
                  selected={r.key === range}
                  onPress={() => setRange(r.key)}
                />
              ))}
            </View>

            {/* Totals for the range */}
            <Card style={styles.summary}>
              <Txt variant="small">Net earnings</Txt>
              <Txt style={styles.net}>{inr(sum.net)}</Txt>
              <Txt variant="tiny">{inRange.length} payments</Txt>
              <View style={styles.sep} />
              <Row label="Users paid (gross)" value={inr(sum.gross)} />
              <Row
                label="REBU commission"
                value={`−${inr(sum.commission)}`}
                color={colors.danger}
              />
              {sum.agency ? (
                <Row
                  label={`Agency share (${ECONOMY.agencyCut}%)`}
                  value={`−${inr(sum.agency)}`}
                  color={colors.danger}
                />
              ) : null}
              <View style={styles.sepThin} />
              <Row
                label="You earned"
                value={inr(sum.net)}
                strong
                color={colors.success}
              />
            </Card>

            {/* By source */}
            <Txt variant="h3" style={styles.h}>
              Where it came from
            </Txt>
            <Card>
              {sources.length === 0 ? (
                <Txt variant="small" center>
                  Nothing in this period.
                </Txt>
              ) : (
                sources.map((k, i) => {
                  const b = sum.bySource[k];
                  const Icon = ICONS[k];
                  return (
                    <View key={k} style={[styles.src, i > 0 && styles.srcGap]}>
                      <View style={styles.srcIcon}>
                        <Icon size={18} color={colors.ink} />
                      </View>
                      <View style={styles.flex}>
                        <View style={styles.srcHead}>
                          <Txt variant="label">{SOURCES[k].label}</Txt>
                          <Txt variant="label">{inr(b.net)}</Txt>
                        </View>
                        <View style={styles.srcTrack}>
                          <View
                            style={[
                              styles.srcFill,
                              { width: `${(b.net / topNet) * 100}%` },
                            ]}
                          />
                        </View>
                        <Txt variant="tiny">
                          {b.count} {b.count === 1 ? 'payment' : 'payments'}
                          {b.qty && SOURCES[k].unit
                            ? ` · ${num(b.qty)} ${SOURCES[k].unit}`
                            : ''}
                        </Txt>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>

            {/* Statement */}
            <Txt variant="h3" style={styles.h}>
              Statement
            </Txt>
            <View style={styles.filters}>
              {FILTERS.map(x => (
                <Chip
                  key={x.key}
                  label={x.label}
                  small
                  selected={filter === x.key}
                  onPress={() => setFilter(x.key)}
                />
              ))}
            </View>
            <Card padded={false}>
              {statement.length === 0 ? (
                <Txt variant="small" center style={styles.emptyRow}>
                  Nothing here for this period.
                </Txt>
              ) : (
                statement.map((e, i) => {
                  const Icon = ICONS[e.source];
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setOpen(e.id)}
                      style={[
                        styles.item,
                        i < statement.length - 1 && styles.divider,
                      ]}
                    >
                      {e.photo ? (
                        <Image
                          source={{ uri: e.photo }}
                          style={styles.itemAvatar}
                        />
                      ) : (
                        <View style={[styles.itemAvatar, styles.srcIcon]}>
                          <Icon size={18} color={colors.ink} />
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Txt variant="label" numberOfLines={1}>
                          {e.from}
                        </Txt>
                        <Txt variant="small" numberOfLines={1}>
                          {SOURCES[e.source].label} · {timeLabel(e.ts)}
                        </Txt>
                      </View>
                      <View style={styles.itemRight}>
                        <Txt variant="label" color={colors.success}>
                          +{inr(split(e).net)}
                        </Txt>
                        {e.status === 'review' ? (
                          <Txt style={styles.review}>Under review</Txt>
                        ) : (
                          <Txt variant="tiny">{num(e.coins)} coins</Txt>
                        )}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </Card>
          </>
        )}

        <Card padded={false} style={styles.links}>
          <ListRow
            icon={Wallet}
            title="Withdrawals & payout accounts"
            onPress={() => navigation.navigate('Withdraw')}
          />
          <ListRow
            icon={ReceiptText}
            title="How earnings work"
            onPress={() => setInfo(true)}
            last
          />
        </Card>
      </View>

      {/* One earning in detail */}
      <Sheet
        visible={!!selected}
        onClose={() => {
          setOpen(null);
          setReporting(false);
        }}
        title={selected ? SOURCES[selected.source].label.replace(/s$/, '') : ''}
      >
        {selected ? (
          <>
            <Row label="From" value={selected.from} />
            <Row label="When" value={timeLabel(selected.ts)} />
            {selected.detail ? (
              <Row label="Details" value={selected.detail} />
            ) : null}
            <Row
              label={`User paid (${num(selected.coins)} coins)`}
              value={inr(sel.gross)}
            />
            <Row
              label={`REBU commission (${
                ECONOMY.commission[selected.source]
              }%)`}
              value={`−${inr(sel.commission)}`}
              color={colors.danger}
            />
            {sel.agency ? (
              <Row
                label={`Agency share (${ECONOMY.agencyCut}%)`}
                value={`−${inr(sel.agency)}`}
                color={colors.danger}
              />
            ) : null}
            <View style={styles.sepThin} />
            <Row
              label="You earned"
              value={inr(sel.net)}
              strong
              color={colors.success}
            />

            {selected.status === 'review' ? (
              <View style={styles.reviewBox}>
                <ReceiptText size={18} color={colors.warning} />
                <Txt variant="small" style={styles.flex}>
                  Reported: “{selected.reportReason}”. Our team will check it
                  within 48 hours; the amount is on hold until then.
                </Txt>
              </View>
            ) : reporting ? (
              <View style={styles.reasons}>
                <Txt variant="label">What’s wrong?</Txt>
                <View style={styles.filters}>
                  {REPORT_REASONS.map(r => (
                    <Chip
                      key={r}
                      label={r}
                      small
                      onPress={() => {
                        reportEarning(selected.id, r);
                        setReporting(false);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <ListRow
                icon={Flag}
                title="Report a problem"
                subtitle="Wrong time, amount or a missing gift"
                last
                onPress={() => setReporting(true)}
              />
            )}
          </>
        ) : null}
      </Sheet>

      {/* How it works */}
      <Sheet
        visible={info}
        onClose={() => setInfo(false)}
        title="How earnings work"
      >
        <Txt variant="small">
          Users pay in coins. Each coin is worth {inr(ECONOMY.coinInr)} to you
          before commission.
        </Txt>
        <View style={styles.table}>
          {Object.keys(SOURCES).map(k => (
            <Row
              key={k}
              label={SOURCES[k].label}
              value={`You keep ${100 - ECONOMY.commission[k]}%`}
            />
          ))}
        </View>
        <Txt variant="small">
          Agency hosts share {ECONOMY.agencyCut}% of their part with their
          agency. Withdrawals: minimum {inr(ECONOMY.minWithdraw)}, fee{' '}
          {ECONOMY.withdrawFee}%, paid in {ECONOMY.payoutTime}. Reported
          earnings are on hold until reviewed.
        </Txt>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md, paddingBottom: 24 },
  hero: { borderRadius: radius.xl, padding: 20, backgroundColor: colors.ink },
  heroLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  heroAmount: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 44,
    color: colors.white,
    marginTop: 4,
  },
  heroRow: { flexDirection: 'row', gap: 26, marginTop: 10 },
  heroSmallLabel: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.6)',
  },
  heroSmall: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  withdraw: { marginTop: 16 },
  emptyCard: { marginTop: 14, alignItems: 'center', paddingVertical: 22 },
  emptySub: { marginTop: 6, paddingHorizontal: 8 },
  emptyBtn: { marginTop: 16, alignSelf: 'stretch' },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  slot: { flex: 1, alignItems: 'center' },
  barArea: {
    height: CHART_H,
    justifyContent: 'flex-end',
    width: '100%',
    alignItems: 'center',
  },
  bar: {
    width: '62%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: colors.primary,
  },
  barDim: { opacity: 0.35 },
  barEmpty: { backgroundColor: colors.surfaceMuted },
  dayLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  dayLabelOn: { fontFamily: fonts.bold, color: colors.ink },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  summary: { marginTop: 12 },
  net: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  sepThin: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  h: { marginTop: 22, marginBottom: 10 },
  src: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  srcGap: { marginTop: 14 },
  srcIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcHead: { flexDirection: 'row', justifyContent: 'space-between' },
  srcTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    marginVertical: 5,
    overflow: 'hidden',
  },
  srcFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  emptyRow: { padding: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemAvatar: { width: 42, height: 42, borderRadius: 21 },
  itemRight: { alignItems: 'flex-end', gap: 2 },
  review: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.warning },
  reviewBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: '#FFF8E8',
  },
  reasons: { marginTop: 14, gap: 10 },
  links: { marginTop: 18 },
  table: { marginVertical: 10 },
});
