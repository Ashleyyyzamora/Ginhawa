import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmt } from '../format.js';
import { useTheme } from '../theme.js';

const TOKENS = ['--series-1', '--series-2', '--grid', '--axis', '--text-secondary', '--threshold', '--surface'];

/** Reads chart colours from CSS custom properties and follows light/dark changes. */
function useChartColors() {
  const read = () => {
    const css = getComputedStyle(document.documentElement);
    return Object.fromEntries(TOKENS.map((t) => [t.slice(2), css.getPropertyValue(t).trim()]));
  };
  const [colors, setColors] = useState(read);
  const { theme } = useTheme();
  // Re-read the tokens whenever the theme shown changes (system or manual toggle).
  useEffect(() => setColors(read()), [theme]);
  return colors;
}

function tickFormatter(spanMs) {
  if (spanMs <= 2 * 86400000) return (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChartTooltip({ active, payload, label, series, digits }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="muted">
        {new Date(label).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} className="chart-tooltip-row">
            <span className="legend-swatch" style={{ background: p?.color }} />
            {s.label}
            <strong>{fmt(p?.value, digits)}{s.unit ? ` ${s.unit}` : ''}</strong>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Time series for one metric group. Never mixes scales: each chart has a single y-axis.
 * series: [{ key, label, unit }]  (max 2; slot 1 = blue, slot 2 = orange)
 */
export function HistoryChart({ points, series, threshold, spanMs, digits = 1, height = 220 }) {
  const c = useChartColors();
  const data = points.map((p) => ({ ...p, t: new Date(p.t).getTime() }));
  const colorOf = (i) => (i === 0 ? c['series-1'] : c['series-2']);
  const Chart = series.length === 1 ? AreaChart : LineChart;

  if (!data.length) return <div className="chart-empty muted">No readings in this time range yet.</div>;

  return (
    <div>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s, i) => (
            <span key={s.key}>
              <span className="legend-swatch" style={{ background: colorOf(i) }} /> {s.label}
            </span>
          ))}
          {threshold != null && (
            <span>
              <span className="legend-dash" /> Alert threshold
            </span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorOf(0)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colorOf(0)} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={tickFormatter(spanMs)} stroke={c.axis} tick={{ fill: c['text-secondary'], fontSize: 11 }}
            tickLine={false} minTickGap={40}
          />
          <YAxis stroke={c.axis} tick={{ fill: c['text-secondary'], fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            content={<ChartTooltip series={series} digits={digits} />}
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
          />
          {threshold != null && (
            <ReferenceLine y={threshold} stroke={c.threshold} strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
          )}
          {series.map((s, i) =>
            series.length === 1 ? (
              <Area key={s.key} dataKey={s.key} type="monotone" stroke={colorOf(i)} strokeWidth={2}
                fill="url(#area-fill)" dot={false} isAnimationActive={false} connectNulls
                activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
            ) : (
              <Line key={s.key} dataKey={s.key} type="monotone" stroke={colorOf(i)} strokeWidth={2}
                dot={false} isAnimationActive={false} connectNulls
                activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

/** Average value per hour of day: reveals the busy (and polluted) hours. */
export function HourlyChart({ hours, metric, label, digits = 1, height = 180 }) {
  const c = useChartColors();
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const data = Array.from({ length: 24 }, (_, hour) => ({ hour, value: byHour.get(hour)?.[metric] ?? null }));
  const fmtHour = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="hour" tickFormatter={fmtHour} stroke={c.axis} tick={{ fill: c['text-secondary'], fontSize: 11 }}
          tickLine={false} interval={2} />
        <YAxis stroke={c.axis} tick={{ fill: c['text-secondary'], fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          cursor={{ fill: c.grid }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="chart-tooltip">
                <div className="muted">{fmtHour(payload[0].payload.hour)} – {fmtHour((payload[0].payload.hour + 1) % 24)}</div>
                <div className="chart-tooltip-row">
                  Avg {label} <strong>{fmt(payload[0].value, digits)}</strong>
                </div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="value" fill={c['series-1']} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
