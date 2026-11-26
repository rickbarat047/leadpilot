import { SiteNav, SiteFooter } from '@/components/site';
function Page({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (<><SiteNav /><main className="container section"><h2>{title}</h2><p className="sub">{sub}</p>{children}</main><SiteFooter /></>);
}
export function SimpleList({ items }: { items: [string, string][] }) {
  return (<div className="grid-2">{items.map(([t, d]) => (<div className="card pad" key={t}><div style={{ fontWeight: 800 }}>{t}</div><div style={{ color: 'var(--muted)' }}>{d}</div></div>))}</div>);
}
export { Page };
