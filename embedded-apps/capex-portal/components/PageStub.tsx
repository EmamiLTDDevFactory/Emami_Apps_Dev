'use client';
import { PageHeader, Card } from './ui';
/** Placeholder until the screen is built. Replaced per screen. */
export default function PageStub({ title, fiori }: { title: string; fiori: string }) {
  return (<><PageHeader title={title} /><Card><p className="text-[12px] text-sap-muted">Screen not built yet. Fiori source: <code>{fiori}</code>.</p></Card></>);
}
