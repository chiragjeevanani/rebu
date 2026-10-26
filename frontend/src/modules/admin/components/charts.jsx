// Charts. One series → brand colour; several → the validated categorical
// palette in fixed order (blue, orange, aqua), always with a legend.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../hooks/useTheme'

const PALETTE = {
  light: { brand: '#d81b60', series: ['#2a78d6', '#eb6834', '#1baf7a'], grid: 'rgba(0,0,0,0.06)', axis: '#6e6e73' },
  dark: { brand: '#ec407a', series: ['#3987e5', '#d95926', '#199e70'], grid: 'rgba(255,255,255,0.07)', axis: '#a1a1a6' },
}

function Tip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null
  return (
    <div className="a-chart-tip">
      <div className="a-muted" style={{ marginBottom: 4 }}>
        {label}
      </div>
      {payload.map(p => (
        <div key={p.dataKey} className="a-row" style={{ gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span className="a-muted">{p.name}</span>
          <b style={{ marginLeft: 'auto', paddingLeft: 12 }}>{format(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

/**
 * type: area | line | bar
 * series: [{ key, label }]
 */
export function TrendChart({ data, xKey = 'label', series, type = 'area', height = 260, format = v => v, yFormat }) {
  const { theme } = useTheme()
  const c = PALETTE[theme] || PALETTE.light
  const colors = series.length === 1 ? [c.brand] : c.series
  const axis = { stroke: c.axis, fontSize: 11.5, tickLine: false, axisLine: false }
  const common = { data, margin: { top: 8, right: 8, left: 0, bottom: 0 } }
  const children = [
    <CartesianGrid key="g" stroke={c.grid} vertical={false} />,
    <XAxis key="x" dataKey={xKey} {...axis} minTickGap={18} />,
    <YAxis key="y" {...axis} width={56} tickFormatter={yFormat || format} />,
    <Tooltip key="t" content={<Tip format={format} />} cursor={{ stroke: c.axis, strokeOpacity: 0.3, fill: c.grid }} />,
    series.length > 1 ? (
      <Legend key="l" iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
    ) : null,
  ]

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        {type === 'bar' ? (
          <BarChart {...common} barCategoryGap="28%">
            {children}
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart {...common}>
            {children}
            {series.map((s, i) => (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        ) : (
          <AreaChart {...common}>
            {children}
            {series.map((s, i) => (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={colors[i]}
                strokeWidth={2}
                fill={colors[i]}
                fillOpacity={series.length === 1 ? 0.1 : 0.06}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal proportional bars with labels + values (breakdowns, top-N). */
export function BarList({ items, format = v => v }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="a-stack" style={{ gap: 12 }}>
      {items.map(i => (
        <div key={i.label}>
          <div className="a-row between" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{i.label}</span>
            <b className="a-strong">{format(i.value)}</b>
          </div>
          <div className="a-progress">
            <div style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
