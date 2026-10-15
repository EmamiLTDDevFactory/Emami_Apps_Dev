import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { getCurrentUserEmail } from '../shared/api.js';
import { CATEGORIES, FAQS, POPULAR_IDS } from './faqData.js';
import {
  SendIcon, PlusIcon, GridIcon, BarChartIcon, UploadCloudIcon, ShieldIcon, DatabaseIcon, InfoIcon,
  SearchIcon, ChevronDownIcon, ChevronRightIcon, HeadsetIcon, LightbulbIcon, StarIcon,
} from '../shared/icons.jsx';

// Same hub-wide support address the main Emami Apps Help screen uses (src/screens/HelpScreen.tsx)
// — reused here instead of inventing a separate Change Control Board & CR Tracker inbox nobody actually reads.
const SUPPORT_EMAIL = 'indranil.banerjee@emamigroup.com';
const SUPPORT_CC = 'sayontan.das@emamigroup.com';

const CATEGORY_ICONS = { SendIcon, PlusIcon, GridIcon, BarChartIcon, UploadCloudIcon, ShieldIcon, DatabaseIcon, InfoIcon };

function contactSupportHref() {
  return `mailto:${SUPPORT_EMAIL}?cc=${SUPPORT_CC}&subject=${encodeURIComponent('Change Control Board & CR Tracker — Support request')}`;
}
function suggestQuestionHref() {
  const body = "Question I'd like added to QA Support:\n\n\nWhy it would help:\n";
  return `mailto:${SUPPORT_EMAIL}?cc=${SUPPORT_CC}&subject=${encodeURIComponent('Change Control Board & CR Tracker QA Support — Suggested question')}&body=${encodeURIComponent(body)}`;
}

export default function QaSupport() {
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, [], [], profileName);

  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState(() => new Set([FAQS[0].id]));
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const itemRefs = useRef({});

  useEffect(() => {
    if (!email) window.location.href = '/';
  }, [email]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [search]);

  const popularArticles = useMemo(() => POPULAR_IDS.map((id) => FAQS.find((f) => f.id === id)).filter(Boolean), []);
  const activeCategoryMeta = CATEGORIES.find((c) => c.key === activeCategory);
  const activeCategoryRows = useMemo(() => FAQS.filter((f) => f.category === activeCategory), [activeCategory]);

  function toggleOpen(id) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function goToCategory(key) {
    setSearch('');
    setActiveCategory(key);
  }

  function goToQuestion(faq) {
    setSearch('');
    setActiveCategory(faq.category);
    setOpenIds((cur) => new Set(cur).add(faq.id));
    // Wait a tick for the newly-selected category's section to render before scrolling to it.
    setTimeout(() => itemRefs.current[faq.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  }

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="qaSupport" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

        <div className="page-header-row">
          <div>
            <h1 className="page-title">QA Support</h1>
            <p className="page-header-sub">Find quick answers to common questions about Change Control Board & CR Tracker.</p>
            <p className="page-header-sub">Guides, explanations and help to make your work easier.</p>
          </div>
          <div className="qa-header-note" aria-hidden="true">
            <div className="qa-header-badge"><ShieldIcon size={22} /></div>
            <div className="qa-header-tagline">Questions today,<br />smoother delivery tomorrow.</div>
          </div>
        </div>

        <div className="qa-layout">
          <div className="card qa-categories-card">
            <div className="qa-categories-title">Categories</div>
            {CATEGORIES.map((c) => {
              const IconComp = CATEGORY_ICONS[c.icon];
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`qa-category-btn${activeCategory === c.key && !search ? ' active' : ''}`}
                  onClick={() => goToCategory(c.key)}
                >
                  <IconComp size={14} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          <div className="qa-main">
            {searchResults ? (
              <div className="card qa-section-card">
                <div className="qa-section-head">
                  <div>
                    <div className="qa-section-title">Search results</div>
                    <div className="qa-section-sub">{searchResults.length} match{searchResults.length === 1 ? '' : 'es'} for "{search}"</div>
                  </div>
                </div>
                {searchResults.map((f, i) => (
                  <FaqRow key={f.id} faq={f} index={i + 1} open={openIds.has(f.id)} onToggle={() => toggleOpen(f.id)} setRef={(el) => (itemRefs.current[f.id] = el)} />
                ))}
                {!searchResults.length && <div className="empty-state">No FAQ matches "{search}" — try a different word, or Suggest a Question below.</div>}
              </div>
            ) : (
              <div className="card qa-section-card">
                <div className="qa-section-head">
                  <div>
                    <div className="qa-section-title">{activeCategoryMeta.label}</div>
                    <div className="qa-section-sub">{activeCategoryMeta.blurb}</div>
                  </div>
                  <span className="qa-section-count">{activeCategoryRows.length} Question{activeCategoryRows.length === 1 ? '' : 's'}</span>
                </div>
                {activeCategoryRows.map((f, i) => (
                  <FaqRow key={f.id} faq={f} index={i + 1} open={openIds.has(f.id)} onToggle={() => toggleOpen(f.id)} setRef={(el) => (itemRefs.current[f.id] = el)} />
                ))}
              </div>
            )}
          </div>

          <div className="qa-rail">
            <div className="card qa-rail-card">
              <div className="qa-rail-title">Search FAQ</div>
              <div className="search-by-id qa-search-box">
                <SearchIcon size={14} />
                <input
                  type="text"
                  placeholder="Type a question (e.g. add item, export, utilisation…)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="card qa-rail-card">
              <div className="qa-rail-title"><StarIcon size={13} className="qa-rail-title-icon" /> Popular Articles</div>
              <div className="qa-popular-list">
                {popularArticles.map((f) => (
                  <button type="button" key={f.id} className="qa-popular-row" onClick={() => goToQuestion(f)}>
                    <span>{f.q}</span>
                    <ChevronRightIcon size={13} />
                  </button>
                ))}
              </div>
            </div>

            <div className="card qa-rail-card qa-tone-green">
              <div className="qa-rail-icon-circle tone-green"><HeadsetIcon size={17} /></div>
              <div className="qa-rail-card-title">Still Need Help?</div>
              <div className="qa-rail-card-text">Can't find what you're looking for? Reach out to the Change Control Board & CR Tracker support team.</div>
              <a className="btn btn-ghost btn-sm qa-rail-btn" href={contactSupportHref()}>Contact Support</a>
            </div>

            <div className="card qa-rail-card qa-tone-purple">
              <div className="qa-rail-icon-circle tone-purple"><LightbulbIcon size={17} /></div>
              <div className="qa-rail-card-title">Suggest a Question</div>
              <div className="qa-rail-card-text">Have a question that's not listed here? Help us improve by suggesting it.</div>
              <a className="btn btn-ghost btn-sm qa-rail-btn" href={suggestQuestionHref()}>Suggest Now</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function FaqRow({ faq, index, open, onToggle, setRef }) {
  return (
    <div className={`qa-faq-item${open ? ' open' : ''}`} ref={setRef}>
      <button type="button" className="qa-faq-question" onClick={onToggle}>
        <span className="qa-faq-number">{index}</span>
        <span className="qa-faq-question-text">{faq.q}</span>
        <ChevronDownIcon size={14} className="qa-faq-caret" />
      </button>
      {open && <div className="qa-faq-answer">{faq.a}</div>}
    </div>
  );
}
