'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, ChevronRight, ExternalLink, Search } from 'lucide-react';
import {
  HRMS_USER_MANUAL_TOPICS,
  MANUAL_CATEGORIES,
  findManualTopics,
  getManualTopicById,
  resolveManualHref,
  topicAllowedForRole,
  type ManualTopic,
} from '@/lib/hrmsUserManual';

function TopicDetail({ topic, href, onSelectRelated }: { topic: ManualTopic; href: string; onSelectRelated: (id: string) => void }) {
  const categoryName = MANUAL_CATEGORIES.find((c) => c.id === topic.category)?.name || topic.category;
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{categoryName}</p>
        <h1 className="text-2xl md:text-3xl font-black text-text-primary">{topic.title}</h1>
        <p className="text-text-secondary max-w-2xl">{topic.summary}</p>
      </header>
      <section className="rounded-2xl border border-border-base bg-bg-surface p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-black uppercase text-text-primary">Steps in the app</h2>
        <ol className="space-y-3">
          {topic.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-text-primary">{step.text}</p>
                {step.uiHint && <p className="text-xs text-text-secondary mt-1">UI: {step.uiHint}</p>}
              </div>
            </li>
          ))}
        </ol>
        <Link href={href} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
          Open in HRMS <ExternalLink className="w-4 h-4" />
        </Link>
      </section>
      {topic.tips?.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <h3 className="text-sm font-bold mb-2">Tips</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">{topic.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      ) : null}
      {topic.relatedTopicIds?.length ? (
        <section>
          <h3 className="text-sm font-bold mb-3">Related guides</h3>
          <div className="flex flex-wrap gap-2">
            {topic.relatedTopicIds.map((id) => {
              const rel = getManualTopicById(id);
              return rel ? (
                <button key={id} type="button" onClick={() => onSelectRelated(id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-indigo-300">
                  {rel.title}
                </button>
              ) : null;
            })}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export default function UserManualView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const role = user?.role || 'employee';
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const manualBase = pathname?.startsWith('/superadmin') ? '/superadmin/user-manual' : '/user-manual';
  const topics = useMemo(() => {
    const base = HRMS_USER_MANUAL_TOPICS.filter((t) => topicAllowedForRole(t, role));
    if (!search.trim()) return base;
    const ids = new Set(findManualTopics(search, role).map((t) => t.id));
    return base.filter((t) => ids.has(t.id));
  }, [role, search]);
  const selectedTopic = selectedId ? getManualTopicById(selectedId) : null;
  const selectedHref = selectedTopic ? resolveManualHref(selectedTopic, pathname) : '';
  useEffect(() => {
    const p = searchParams.get('topic');
    if (p && getManualTopicById(p)) setSelectedId(p);
  }, [searchParams]);
  useEffect(() => {
    if (!selectedId && topics[0]) setSelectedId(topics[0].id);
  }, [topics, selectedId]);
  const byCategory = useMemo(() => {
    const map = new Map<string, ManualTopic[]>();
    topics.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    });
    return map;
  }, [topics]);
  return (
    <div className="min-h-screen bg-bg-base pb-12">
      <div className="border-b border-border-base bg-bg-surface sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white"><BookOpen className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-black">HRMS User Manual</h1>
              <p className="text-sm text-text-secondary">How to use every module — step by step</p>
            </div>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guides..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-bg-base text-sm" />
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[280px_1fr] gap-6">
        <nav className="rounded-2xl border bg-bg-surface p-3 lg:sticky lg:top-28 max-h-[70vh] overflow-y-auto">
          {MANUAL_CATEGORIES.map((cat) => {
            const items = byCategory.get(cat.id);
            if (!items?.length) return null;
            return (
              <div key={cat.id} className="mb-4">
                <p className="px-2 text-[10px] font-black uppercase text-text-secondary">{cat.icon} {cat.name}</p>
                <ul>{items.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setSelectedId(t.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between ${selectedId === t.id ? 'bg-indigo-600 text-white' : ''}`}>
                      <span className="truncate">{t.title}</span>
                      {selectedId === t.id && <ChevronRight className="w-4 h-4" />}
                    </button>
                  </li>
                ))}</ul>
              </div>
            );
          })}
        </nav>
        <main>{selectedTopic ? <TopicDetail topic={selectedTopic} href={selectedHref} onSelectRelated={(id) => { setSelectedId(id); window.history.replaceState(null, '', `${manualBase}?topic=${id}`); }} /> : null}</main>
      </div>
    </div>
  );
}


