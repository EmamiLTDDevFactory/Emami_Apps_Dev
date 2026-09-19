// QA Support's FAQ content. Every answer here describes real, current app behavior (see the
// module/page each entry references) rather than generic placeholder copy — keep this file in
// sync when that behavior changes, instead of letting it drift into stale advice.

export const CATEGORIES = [
  { key: 'gettingStarted', label: 'Getting Started', icon: 'SendIcon', blurb: 'Basics about Delivery Command Center and how to navigate through it.' },
  { key: 'addItem', label: 'Add Item', icon: 'PlusIcon', blurb: 'Learn how to create and manage assignments.' },
  { key: 'dashboard', label: 'Dashboard', icon: 'GridIcon', blurb: 'Board vs. table view, filters, and exporting.' },
  { key: 'resourceUtilization', label: 'Resource Utilization', icon: 'BarChartIcon', blurb: 'How allocation and utilization are actually calculated.' },
  { key: 'importExport', label: 'Import & Export', icon: 'UploadCloudIcon', blurb: 'Bulk-loading assignments and getting data out.' },
  { key: 'qaSupport', label: 'QA Support', icon: 'ShieldIcon', blurb: 'About this help center itself.' },
  { key: 'masterData', label: 'Master Data', icon: 'DatabaseIcon', blurb: 'Managing dropdown values (admin only).' },
  { key: 'general', label: 'General', icon: 'InfoIcon', blurb: 'Access, notifications, and everything else.' },
];

export const FAQS = [
  // --- Getting Started ---------------------------------------------------
  {
    id: 'gs-1', category: 'gettingStarted',
    q: 'What is Delivery Command Center?',
    a: "Delivery Command Center is Emami Apps' internal tool for tracking SAP development and change requests end to end — from requirement discussion through FS preparation, development, testing, hypercare and completion — so an item's stage, owner and dates live in one place instead of scattered across emails and spreadsheets.",
  },
  {
    id: 'gs-2', category: 'gettingStarted',
    q: "Who can use Delivery Command Center, and what's the difference between a User and an Admin?",
    a: "Access is granted per person from the hub's Manage Access screen. A User can view and manage assignments on the Dashboard, and use QA Support, Evaluation and Settings. An Admin additionally gets Master Data (managing dropdown values) and Import Center (bulk-loading assignments from Excel). If a page you expect is missing from the sidebar, ask an admin to check your role.",
  },
  {
    id: 'gs-3', category: 'gettingStarted',
    q: 'What are the main sections in Delivery Command Center?',
    a: 'Home (overview), Dashboard (create/manage assignments in Board or Table view), Master Data (admin: dropdown values), QA Support (this page), Import Center (admin: bulk import), Evaluation and Settings — all reachable from the same left sidebar on every page.',
  },
  {
    id: 'gs-4', category: 'gettingStarted',
    q: 'How do I navigate through the application?',
    a: "Use the left sidebar — it's identical on every page, with your current page highlighted. Admin-only entries (Master Data, Import Center) only appear if you've been granted the Admin role for Delivery Command Center; everyone else simply won't see them listed.",
  },
  {
    id: 'gs-5', category: 'gettingStarted',
    q: 'Where can I get support if I face any issues?',
    a: "Start here — search or browse by category. If your question isn't answered, use \"Suggest a Question\" to flag what's missing, or \"Contact Support\" to reach the Delivery Command Center team directly.",
  },

  // --- Add Item ------------------------------------------------------------
  {
    id: 'ai-1', category: 'addItem',
    q: 'How do I create a new assignment (Add Item)?',
    a: 'From the Dashboard toolbar, click "+ New Item", fill in the form, and click Save. The new item appears immediately in whichever view (Board or Table) you had open.',
  },
  {
    id: 'ai-2', category: 'addItem',
    q: 'What fields are mandatory while creating a new item?',
    a: 'Title (Development/Item Title), Status, Functional Area/Process, Module and Priority are always required. On top of that, whichever Status you pick also requires its own matching date field — see the next question.',
  },
  {
    id: 'ai-3', category: 'addItem',
    q: 'Why does the form suddenly ask for a date after I pick a Status?',
    a: 'Every status has exactly one required "reached this stage on" date — e.g. "In Progress" requires a Development date, "Completed" requires a Completed date. This keeps every item\'s timeline accurate, not just the ones someone remembered to date by hand.',
  },
  {
    id: 'ai-4', category: 'addItem',
    q: 'What is "Revised Target Date", and how is it different from Target Date?',
    a: 'Target Date is the original deadline you set. Revised Target Date is that same date plus any Rework days logged — e.g. 3 days of rework pushes it 3 days later automatically. Every "is this overdue" or "days left" figure elsewhere in the app (Dashboard, Resource Utilization) uses the revised date, not the original.',
  },
  {
    id: 'ai-5', category: 'addItem',
    q: 'Can I delete an assignment, and is that reversible?',
    a: "Yes — open the item and use Delete inside its panel; you'll be asked to confirm since it can't be undone. Every field change is also logged to that item's own History (visible in the same panel) up until the point it's deleted.",
  },
  {
    id: 'ai-6', category: 'addItem',
    q: 'What do the different statuses mean (Not Started, In Development, Testing, etc.)?',
    a: 'They follow the delivery pipeline in order: Not Started → Requirement Discussion → FS Preparation → In Progress (development) → IT Testing → User Testing → Completed. Hypercare, On Hold and Cancelled sit outside that straight line — Hypercare typically follows Completed, while On Hold or Cancelled can happen from any stage. The Dashboard groups several of these into wider board columns (e.g. "In Discussion" covers both Requirement Discussion and FS Preparation) so the board reads cleanly, but each item still remembers its own exact status underneath.',
  },

  // --- Dashboard -----------------------------------------------------------
  {
    id: 'db-1', category: 'dashboard',
    q: 'What is the difference between Board View and Table View?',
    a: 'Board View is a Kanban board — six columns (Not Started, In Discussion, In Development, Testing, Hypercare, Completed) — drag a card to a new column to change its status. Table View is a flat, sortable, filterable list of every item; better for scanning many items at once or comparing dates side by side.',
  },
  {
    id: 'db-2', category: 'dashboard',
    q: 'How do I filter what shows on the Dashboard?',
    a: 'The filter row above the board/table covers Module, Owner, Priority, Status, a date range, and an "Overdue only" toggle. "More Filters" adds Business Impact, Technical Complexity, Dev Factory and Reason for Delay. These apply to both Board and Table view.',
  },
  {
    id: 'db-3', category: 'dashboard',
    q: 'How do I export data, and does it export just what I\'ve filtered?',
    a: '"Export CSV" in the Dashboard toolbar downloads every field for every item in the system — it is not limited by your current filters. If you need only a subset, filter the Table view first and copy what you need, or use Resource Utilization\'s own Export for allocation-specific data.',
  },
  {
    id: 'db-4', category: 'dashboard',
    q: 'How does Delivery Command Center decide an item is "Overdue"?',
    a: "An item is overdue the moment its Revised Target Date is in the past and its status isn't Completed or Cancelled — checked live against today's date, so nothing needs manual flagging. Overdue always shows in red, overriding whatever color its status would normally have.",
  },
  {
    id: 'db-6', category: 'dashboard',
    q: 'How do I see just my own assignments on the Dashboard?',
    a: "Use the Owner filter and pick your own name — every list, count and export on the page then reflects just your items. There's no separate \"My Assignments\" view; the Owner filter is how everyone, including you, narrows down to their own work.",
  },
  {
    id: 'db-5', category: 'dashboard',
    q: 'Who decides what color a Status or Priority pill shows?',
    a: 'Status, Module and Priority all ship with sensible default colors, but an Admin can override any of them from Master Data — so the exact shade you see can differ from another company\'s Delivery Command Center. Overdue red is the one exception: it always wins, regardless of the status\'s own color.',
  },

  // --- Resource Utilization --------------------------------------------------
  {
    id: 'ru-1', category: 'resourceUtilization',
    q: "How is a resource's Utilization % actually calculated?",
    a: "It's capacity math, not headcount. For your selected date range, Delivery Command Center sums how many man-days of work overlap that range across all of a person's assignments, then divides by the number of working days (Mon–Fri) in that same range. E.g. 8 overlapping man-days in a 20-working-day month = 8 ÷ 20 = 40% utilized.",
  },
  {
    id: 'ru-2', category: 'resourceUtilization',
    q: 'If an assignment runs longer than my selected period, how much of its effort counts?',
    a: "Only the proportional share inside the period. An assignment's total man-days are spread evenly across its own working-day span (Start Date → Revised Target Date); only the days that overlap your selected range are counted. A 10-day, 10-man-day assignment that's half inside the period contributes 5 man-days, not all 10.",
  },
  {
    id: 'ru-3', category: 'resourceUtilization',
    q: 'Who counts as a "resource" on this page — is there a separate roster?',
    a: "No separate roster exists — anyone who appears as a Developer or Functional SPOC on at least one assignment, ever, counts as a resource. This is deliberate: it's why someone with zero current assignments still shows up correctly as Bench instead of disappearing, as long as they've had an assignment in the past.",
  },
  {
    id: 'ru-4', category: 'resourceUtilization',
    q: 'Can one assignment consume two different people\'s capacity at once?',
    a: "Yes — an assignment allocates capacity against both its Developer and its Functional SPOC simultaneously, since both are genuinely working on it. The one exception is Cancelled items: cancelled work never consumes capacity for anyone.",
  },
  {
    id: 'ru-5', category: 'resourceUtilization',
    q: 'What do the resource statuses "Bench", "Active" and "Over Allocated" mean?',
    a: "They're checked in priority order. Over Allocated (utilization over 100%) always wins first. Otherwise, Active means at least one non-completed, non-cancelled assignment overlaps your selected period. If neither applies, the resource shows as Bench — available capacity with nothing currently assigned in that window.",
  },
  {
    id: 'ru-6', category: 'resourceUtilization',
    q: 'What do the utilization bands (Under-utilised, Moderate, Well utilised, Near capacity, Over allocated) mean?',
    a: 'Under 50% = Under-utilised, 50–70% = Moderate, 70–90% = Well utilised, 90–100% = Near capacity, and anything over 100% = Over allocated. These same bands drive both the color coding on every row and the Utilization Distribution donut chart.',
  },
  {
    id: 'ru-7', category: 'resourceUtilization',
    q: "What's the difference between a resource's Utilization % and one assignment's Allocation %?",
    a: "Utilization % (shown per resource) is that person's total workload across every assignment they hold. Allocation % (shown per row in the Allocation Table) is how much of that person's capacity just that one assignment alone is using — useful for spotting which single task is driving someone's workload up.",
  },
  {
    id: 'ru-8', category: 'resourceUtilization',
    q: 'How is "Allocation by Module" worked out?',
    a: "It totals man-days per module across everything overlapping your selected period. If none of those overlapping assignments have a usable man-days figure, it falls back to a plain count of allocations per module instead — and the chart's title switches to \"Allocations by Module\" so it's clear it's now a count, not effort.",
  },
  {
    id: 'ru-9', category: 'resourceUtilization',
    q: 'Does utilization account for public holidays or approved leave?',
    a: 'No — "working day" means Monday–Friday only. There is no holiday calendar or leave data anywhere in Delivery Command Center today, so utilization can read slightly optimistic around holiday-heavy periods. This is a known, documented limitation rather than a bug.',
  },
  {
    id: 'ru-10', category: 'resourceUtilization',
    q: "Why is someone showing as Bench when I know they're actually busy?",
    a: "Three usual causes: their assignment's dates don't overlap the period you've selected, their only work is logged as Cancelled, or their name is spelled slightly differently across items — resources are matched by the exact text in the Developer/Functional SPOC field, not a shared employee ID, so \"Abinash Sahoo\" and \"A. Sahoo\" would count as two different people.",
  },

  // --- Import & Export -------------------------------------------------------
  {
    id: 'ie-1', category: 'importExport',
    q: 'How do I import existing assignments using Excel?',
    a: 'From Import Center (admin only): Step 1, download the Excel template — it carries the same fields as the New Item form. Step 2, fill it in and drop it (or Choose File) into the upload area. Delivery Command Center validates every row and imports whichever ones pass immediately.',
  },
  {
    id: 'ie-2', category: 'importExport',
    q: 'What happens to rows that fail validation during an import?',
    a: "They're skipped, not imported — the rest of the file still goes through. Each failed row's reason (a missing title, or a dropdown value that isn't a real Master Data option) is recorded and viewable from that run's \"view\" icon in Recent Imports, or downloadable as a CSV error report.",
  },
  {
    id: 'ie-3', category: 'importExport',
    q: "Will the template always have my company's current dropdown values?",
    a: 'Yes, as of whenever you download it — the template\'s second sheet, "Dropdown Values", reflects whatever is currently active in Master Data at that moment. Re-download it if those values have changed since your last import.',
  },
  {
    id: 'ie-4', category: 'importExport',
    q: 'How do I export data out of Delivery Command Center?',
    a: "Dashboard's Export CSV downloads every assignment's full field set. Resource Utilization's Export downloads the current Allocation Table (resource, assignment, man-days, allocation % and status) for whatever period and filters you have selected.",
  },
  {
    id: 'ie-5', category: 'importExport',
    q: 'Is a bulk import reversible if I import the wrong file?',
    a: "Not automatically — Import Center logs every run so a bad batch can be traced, but there's no one-click undo. Rows imported by mistake need to be deleted individually from the Dashboard, the same as any other item.",
  },

  // --- QA Support ------------------------------------------------------------
  {
    id: 'qa-1', category: 'qaSupport',
    q: 'What is this QA Support page for?',
    a: "A self-serve help center for Delivery Command Center itself — answers to \"how do I…\" and \"why does…\" questions about every other page, organized by category and searchable, so you're not stuck asking a colleague for basics.",
  },
  {
    id: 'qa-2', category: 'qaSupport',
    q: "I searched and couldn't find my answer — what now?",
    a: 'Use "Suggest a Question" to flag what\'s missing, or "Contact Support" to reach the Delivery Command Center team directly. Suggestions are exactly how new FAQ entries get added here.',
  },
  {
    id: 'qa-3', category: 'qaSupport',
    q: 'Are these answers kept up to date as Delivery Command Center changes?',
    a: "They're maintained alongside the app — when a page's behavior changes, its FAQ entries here should change with it. If you spot one that's stale, that's exactly what \"Suggest a Question\" is for.",
  },

  // --- Master Data (admin) ----------------------------------------------------
  {
    id: 'md-1', category: 'masterData',
    q: 'What is Master Data, and who can access it?',
    a: 'It\'s where an Admin manages every dropdown option used across Delivery Command Center — Status, Module/Area, Priority, Business Impact, Technical Complexity, Dev Factory and Reason for Delay. Only users granted the Admin role for Delivery Command Center can see or open this page.',
  },
  {
    id: 'md-2', category: 'masterData',
    q: 'Can I delete a dropdown value once it exists?',
    a: "No — values are deactivated, not deleted, on purpose. An old value might still be sitting on existing items, and deleting it outright would leave those items pointing at nothing. Deactivating hides it from new dropdowns while every existing item keeps working exactly as before.",
  },
  {
    id: 'md-3', category: 'masterData',
    q: 'Which categories support custom colors?',
    a: 'Status, Module/Area and Priority. Business Impact, Technical Complexity, Dev Factory and Reason for Delay are plain text options with no color picker.',
  },
  {
    id: 'md-4', category: 'masterData',
    q: 'If I rename a value, what happens to items already using the old name?',
    a: "They update automatically — renaming edits that value in place rather than creating a new one, so every item referencing it shows the new name immediately, with nothing to re-save on the item itself.",
  },

  // --- General ------------------------------------------------------------
  {
    id: 'gen-1', category: 'general',
    q: "Where do the notification bell's alerts come from?",
    a: "Two kinds, computed live — there's no separate notifications database. First, someone else changed a field on one of your assignments. Second, one of your active assignments has its revised target date due today, tomorrow, or within 2 days. Which ones you've read or cleared is remembered locally in your own browser.",
  },
  {
    id: 'gen-2', category: 'general',
    q: 'Does Delivery Command Center work well on a phone?',
    a: "The layout adapts down to phone width (the sidebar collapses into a horizontal strip), but it's built and tested primarily for desktop use — Excel import/export and the Resource Utilization timeline are both easiest on a larger screen.",
  },
  {
    id: 'gen-3', category: 'general',
    q: 'Is my data private to me, or shared with the team?',
    a: 'Assignments, Master Data and Resource Utilization are shared — everyone with Delivery Command Center access sees the same underlying data, shaped only by whatever filters they personally apply. The one private thing is your notification read/cleared state, which lives only in your own browser.',
  },
  {
    id: 'gen-4', category: 'general',
    q: 'Who do I contact for an access request or a role change?',
    a: "An Admin can grant or change your Delivery Command Center role from the hub's Manage Access screen. If you're not sure who that is for your team, use Contact Support below and it'll get routed to someone who can.",
  },
];

// Handpicked shortcuts for the "Popular Articles" rail — ids must exist above.
export const POPULAR_IDS = ['ai-1', 'ru-1', 'ie-1', 'db-6', 'db-1', 'db-3', 'ai-6'];
