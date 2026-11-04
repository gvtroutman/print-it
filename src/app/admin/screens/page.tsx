import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Kicker } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { screenSizeReport } from "@/lib/screen-size-store";
import { SCREEN_PAGES, screenShare, type ScreenPage } from "@/lib/screen-sizes";
import styles from "./screens.module.css";

export const dynamic = "force-dynamic";

const number = (value: number) => value.toLocaleString("en-US");
const count = (row: { _sum: { views: number | null } }) => row._sum.views ?? 0;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.panel}>
    <h2 className={styles.panelTitle}>{title}</h2>
    {children}
  </section>;
}

function Breakdown({ rows, total }: { rows: { label: string; views: number; href?: string }[]; total: number }) {
  return <ul className={styles.breakdown}>
    {rows.map(row => <li key={row.label}>
      <div className={styles.row}>
        {row.href ? <Link href={row.href} className={`${styles.rowLabel} ${styles.rowLink}`}>{row.label}</Link> :
          <span className={styles.rowLabel}>{row.label}</span>}
        <span className={styles.rowCount}>{number(row.views)} · {screenShare(row.views, total)}</span>
      </div>
      <div aria-hidden className={styles.bar}>
        <div className={styles.fill} style={{ width: screenShare(row.views, total) }} />
      </div>
    </li>)}
  </ul>;
}

export default async function ScreensPage({ searchParams }: {
  searchParams: Promise<{ days?: string; page?: string; width?: string; height?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const days = params.days === "7" ? 7 : 30;
  const page = (SCREEN_PAGES as readonly string[]).includes(params.page ?? "") ? params.page as ScreenPage : undefined;
  const width = Number(params.width);
  const height = Number(params.height);
  const size = Number.isInteger(width) && Number.isInteger(height) &&
    width >= 100 && width <= 10000 && height >= 100 && height <= 10000 ? { width, height } : undefined;
  const report = await screenSizeReport(days, page, size);
  const top = report.sizes[0];
  const phoneViews = report.devices.find(row => row.device === "Phone");
  const href = (next: { page?: string; width?: number; height?: number }) => {
    const query = new URLSearchParams({ days: String(days) });
    if (next.page) query.set("page", next.page);
    if (next.width && next.height) { query.set("width", String(next.width)); query.set("height", String(next.height)); }
    return `/admin/screens?${query}`;
  };

  return <>
    <AppHeader user={admin} active="/admin/screens" />
    <main className={styles.main}>
      <Kicker>Admin · your audience</Kicker>
      <h1 className={styles.title}>Device &amp; screen sizes</h1>
      <p className={styles.intro}>
        See the browser sizes people use, then give the most common layouts a closer look.
        Sizes are width × height in CSS pixels, measured when a page opens.
      </p>

      <form action="/admin/screens" method="get" className={styles.filters}>
        <label className={styles.label}>
          Period<select name="days" defaultValue={days} className={styles.control}>
            <option value="30">Last 30 days</option><option value="7">Last 7 days</option>
          </select>
        </label>
        <label className={styles.label}>
          Page<select name="page" defaultValue={page ?? ""} className={styles.control}>
            <option value="">All pages</option>
            {SCREEN_PAGES.map(path => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        {size && <><input type="hidden" name="width" value={size.width} /><input type="hidden" name="height" value={size.height} /></>}
        <button type="submit" className={`${styles.control} ${styles.submit}`}>Update report</button>
        {size && <Link href={href({ page })} className={styles.clear}>
          Clear {size.width} × {size.height} filter
        </Link>}
      </form>

      <div data-screen-stats className={styles.stats}>
        {[
          { label: "Page views", value: number(report.total), detail: `Last ${days} calendar days · UTC` },
          { label: "Most common size", value: top ? `${top.width} × ${top.height}` : "—", detail: top ? `${screenShare(count(top), report.total)} of page views` : "Waiting for the first page view" },
          { label: "Phone views", value: screenShare(phoneViews ? count(phoneViews) : 0, report.total), detail: `${number(phoneViews ? count(phoneViews) : 0)} page views on phones` },
        ].map(stat => <div key={stat.label} className={styles.stat}>
          <p className={styles.statLabel}>{stat.label}</p>
          <p className={styles.statValue}>{stat.value}</p>
          <p className={styles.statDetail}>{stat.detail}</p>
        </div>)}
      </div>

      {report.total === 0 ? <Panel title="No screen sizes recorded yet">
        <p className={styles.empty}>
          New page views will appear here after tracking is deployed. Try a different page or period if you have a filter selected.
          Browsers with Do Not Track or Global Privacy Control enabled are excluded.
        </p>
      </Panel> : <>
        <Panel title="Most common browser sizes">
          <p className={styles.explanation}>
            Select a size to see its pages and browser mix below. Use these dimensions in your browser&rsquo;s responsive preview to check the layout.
          </p>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <caption className="sr-only">Top 20 viewport dimensions ranked by page views</caption>
              <thead>
                <tr>{["Browser size", "Width ÷ height", "Page views", "Share"].map(label => <th key={label} scope="col">{label}</th>)}</tr>
              </thead>
              <tbody>{report.sizes.map(row => <tr key={`${row.width}x${row.height}`}>
                <th scope="row">
                  <Link className={styles.sizeLink} href={href({ page, width: row.width, height: row.height })}>
                    {row.width} × {row.height}
                  </Link>
                </th>
                <td>{(row.width / row.height).toFixed(2)}:1</td>
                <td>{number(count(row))}</td>
                <td>{screenShare(count(row), report.total)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className={styles.tableNote}>Showing up to 20 sizes. Shares use all page views in the selected filters.</p>
        </Panel>
        <div className={styles.panels}>
          <Panel title="Devices"><Breakdown total={report.total} rows={report.devices.map(row => ({ label: row.device, views: count(row) }))} /></Panel>
          <Panel title="Browsers"><Breakdown total={report.total} rows={report.browsers.map(row => ({ label: row.browser, views: count(row) }))} /></Panel>
          <Panel title="Operating systems"><Breakdown total={report.total} rows={report.systems.map(row => ({ label: row.os, views: count(row) }))} /></Panel>
          <Panel title={size ? `Pages at ${size.width} × ${size.height}` : "Pages"}>
            <Breakdown total={report.total} rows={report.pages.map(row => ({ label: row.page, views: count(row), href: href({ page: row.page, ...size }) }))} />
          </Panel>
        </div>
      </>}
      <p className={styles.footnote}>
        Anonymous totals for the last 30 days. Counts are page views, so repeat visits count again.
        Device types are estimates. No names, IP addresses, visitor identifiers, raw browser strings, or private link details are saved.
        Known bots and browsers requesting tracking protection are excluded. Each page view records its opening size; resizing alone does not add views.
      </p>
    </main>
  </>;
}
