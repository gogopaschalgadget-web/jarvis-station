// rooms.js - Station room and equipment definitions (ES Module)
// Static data only. Live status comes from /api/station/status.
// Equipment names follow 7-stage loop (Session V reconciliation).
// No em-dashes. No credentials.

export const ROOM_COLORS = {
  1: { accent: '#d4a853', bg: '#1c1508', glow: 'rgba(212,168,83,0.15)', name: 'amber' },
  2: { accent: '#22d3ee', bg: '#081c1c', glow: 'rgba(34,211,238,0.15)', name: 'cyan' },
  3: { accent: '#22c55e', bg: '#081c08', glow: 'rgba(34,197,94,0.15)', name: 'green' },
  4: { accent: '#3b82f6', bg: '#08101c', glow: 'rgba(59,130,246,0.15)', name: 'blue' },
  5: { accent: '#a855f7', bg: '#14081c', glow: 'rgba(168,85,247,0.20)', name: 'violet' },
  6: { accent: '#ef4444', bg: '#1c0808', glow: 'rgba(239,68,68,0.12)', name: 'red' },
  7: { accent: '#a0845c', bg: '#1c1810', glow: 'rgba(160,132,92,0.12)', name: 'tungsten' },
  8: { accent: '#f97316', bg: '#1c1208', glow: 'rgba(249,115,22,0.12)', name: 'orange' },
  9: { accent: '#94a3b8', bg: '#0a1018', glow: 'rgba(148,163,184,0.10)', name: 'cold-blue' },
};

export const PROGRESSION_STATES = {
  blueprint:            { label: 'Blueprint',            color: '#333', border: 'dashed' },
  under_construction:   { label: 'Under Construction',   color: '#555', border: 'solid' },
  awaiting_activation:  { label: 'Awaiting Activation',  color: '#777', border: 'solid' },
  operational:          { label: 'Operational',           color: null,   border: 'solid' },
};

export const OP_STATUSES = {
  producing:   { label: 'Producing',   color: '#22c55e' },
  operational: { label: 'Operational', color: '#22c55e' },
  equipped:    { label: 'Equipped',    color: '#eab308' },
  manual_ops:  { label: 'Manual Ops',  color: '#eab308' },
  on_demand:   { label: 'On Demand',   color: '#3b82f6' },
  offline:     { label: 'Offline',     color: '#ef4444' },
};

export const TIER_LABELS = ['offline', 'basic', 'enhanced', 'advanced', 'legendary'];
export const TIER_COLORS = {
  offline: '#444', basic: '#888', enhanced: '#22c55e', advanced: '#3b82f6', legendary: '#d4a853',
};

// 3x3 grid layout:
//   Row 0: Revenue(1)    Content(2)    Traffic(3)
//   Row 1: Research(6)   Vault(5)      Agent Bay(4)
//   Row 2: Crew(7)       Workshop(8)   Observation(9)

export const ROOMS = [
  {
    id: 1, name: 'Revenue Room', type: 'production',
    row: 0, col: 0,
    desc: 'Product optimization and financial tracking',
    equipment: [
      { stage: 1, name: 'The Mint',              sub: 'Product Optimizer',    tier: 'basic',   status: 'idle' },
      { stage: 2, name: 'The Credit Line',        sub: 'Transport',           tier: 'basic',   status: 'standby' },
      { stage: 3, name: 'The Auditor',            sub: 'QC Gate',             tier: 'basic',   status: 'idle' },
      { stage: 4, name: 'The Ledger Board',       sub: 'Queue',              tier: 'basic',   status: 'idle' },
      { stage: 5, name: 'The Controller',         sub: 'Approval',           tier: 'basic',   status: 'manual' },
      { stage: 6, name: 'The Disbursement Press', sub: 'Execution',          tier: 'offline', status: 'offline' },
      { stage: 7, name: 'The Revenue Gauge',      sub: 'Metrics',            tier: 'offline', status: 'future' },
    ],
  },
  {
    id: 2, name: 'Content Engine', type: 'production',
    row: 0, col: 1,
    desc: 'Autonomous content generation and publishing',
    equipment: [
      { stage: 1, name: 'The Forge',       sub: 'Content Generator',       tier: 'basic', status: 'active' },
      { stage: 2, name: 'The Conveyor',    sub: 'Transport',               tier: 'basic', status: 'online' },
      { stage: 3, name: 'The Inspector',   sub: 'QC Gate',                 tier: 'basic', status: 'active' },
      { stage: 4, name: 'The Job Board',   sub: 'Queue',                   tier: 'basic', status: 'active' },
      { stage: 5, name: 'The Foreman',     sub: 'Telegram Approval',       tier: 'basic', status: 'active' },
      { stage: 6, name: 'The Press',       sub: 'X Post Agent',            tier: 'basic', status: 'active' },
      { stage: 7, name: 'The Gauge Panel', sub: 'Metrics',                 tier: 'offline', status: 'future' },
    ],
  },
  {
    id: 3, name: 'Traffic Control', type: 'production',
    row: 0, col: 2,
    desc: 'SEO monitoring and social distribution',
    equipment: [
      { stage: 1, name: 'The Signal Tower',     sub: 'Discovery',          tier: 'basic', status: 'scanning' },
      { stage: 2, name: 'The Data Stream',       sub: 'Transport',         tier: 'basic', status: 'online' },
      { stage: 3, name: 'The Filter',            sub: 'QC Gate',           tier: 'basic', status: 'active' },
      { stage: 4, name: 'The Campaign Rack',     sub: 'Queue',            tier: 'basic', status: 'idle' },
      { stage: 5, name: 'The Traffic Lead',      sub: 'Approval',         tier: 'basic', status: 'manual' },
      { stage: 6, name: 'The Distribution Hub',  sub: 'Execution',        tier: 'basic', status: 'active' },
      { stage: 7, name: 'The Analytics Wall',    sub: 'Metrics',          tier: 'offline', status: 'future' },
    ],
  },
  {
    id: 4, name: 'Agent Bay', type: 'support',
    row: 1, col: 2,
    desc: 'Orchestration and mission dispatch',
    equipment: [
      { name: 'Directive Table',    sub: 'Cassian command surface', status: 'active' },
      { name: 'Dispatch Board',     sub: 'Mission queue',           status: 'online' },
      { name: 'Mission Spine',      sub: 'Priority chain',          status: 'active' },
      { name: 'Cross-Room Monitor', sub: 'Service coordination',    status: 'online' },
    ],
  },
  {
    id: 5, name: 'Vault Room', type: 'production',
    row: 1, col: 1,
    desc: 'Persistent memory and knowledge management',
    equipment: [
      { stage: 1, name: 'Memory Core',        sub: 'Brain Capture Agent',  tier: 'basic',    status: 'online' },
      { stage: 2, name: 'Archive Pipe',        sub: 'Transport',            tier: 'basic',    status: 'active' },
      { stage: 3, name: 'Integrity Scanner',   sub: 'QC Gate',              tier: 'basic',    status: 'active' },
      { stage: 4, name: 'Commit Queue',        sub: 'Queue',               tier: 'basic',    status: 'active' },
      { stage: 5, name: 'The Archivist',       sub: 'Approval',            tier: 'enhanced', status: 'active' },
      { stage: 6, name: 'Commit Press',        sub: 'Execution',           tier: 'basic',    status: 'online' },
      { stage: 7, name: 'Knowledge Graph',     sub: 'Metrics',             tier: 'basic',    status: 'active' },
    ],
  },
  {
    id: 6, name: 'Research Lab', type: 'production',
    row: 1, col: 0,
    desc: 'Competitive intelligence and market analysis',
    equipment: [
      { stage: 1, name: 'Hypothesis Forge',      sub: 'CI Agent',          tier: 'basic', status: 'idle' },
      { stage: 2, name: 'Sample Tube',            sub: 'Transport',        tier: 'basic', status: 'standby' },
      { stage: 3, name: 'Analyzer',               sub: 'QC Gate',          tier: 'basic', status: 'idle' },
      { stage: 4, name: 'Test Queue',             sub: 'Queue',            tier: 'basic', status: 'idle' },
      { stage: 5, name: 'Scientist',              sub: 'Approval',         tier: 'basic', status: 'manual' },
      { stage: 6, name: 'Experiment Chamber',     sub: 'Execution',        tier: 'basic', status: 'idle' },
      { stage: 7, name: 'Results Wall',           sub: 'Metrics',          tier: 'offline', status: 'future' },
    ],
  },
  {
    id: 7, name: 'Crew Quarters', type: 'support',
    row: 2, col: 0,
    desc: 'Service health monitoring and agent status',
    equipment: [
      { name: 'Crew Bunks',   sub: 'NSSM service monitors', status: 'active' },
      { name: 'Status Board', sub: 'Agent uptime tracker',   status: 'active' },
      { name: 'Alert Panel',  sub: 'Telegram + ntfy alerts', status: 'online' },
    ],
  },
  {
    id: 8, name: 'Workshop', type: 'support',
    row: 2, col: 1,
    desc: 'Build, debug, and infrastructure maintenance',
    equipment: [
      { name: 'Drafting Table',    sub: 'Blueprint design',   status: 'active' },
      { name: 'Fabrication Bench', sub: 'Code construction',  status: 'active' },
      { name: 'Test Rack',         sub: 'Layer 1 review',     status: 'active' },
      { name: 'Push Gate',         sub: 'Deploy control',     status: 'active' },
    ],
  },
  {
    id: 9, name: 'Observation Deck', type: 'support',
    row: 2, col: 2,
    desc: 'Strategic overview and milestone tracking',
    equipment: [
      { name: 'Viewing Window',  sub: 'Station exterior',   status: 'online' },
      { name: 'Milestone Board', sub: 'Phase tracker',       status: 'active' },
      { name: 'Deadline Gauge',  sub: 'Kill date countdown', status: 'active' },
      { name: 'Budget Display',  sub: 'Financial overview',  status: 'active' },
    ],
  },
];

export const NAV_ITEMS = [
  { id: 'station',      label: 'Station',      icon: '⬡', active: true },
  { id: 'missions',     label: 'Missions',     icon: '◎', active: true },
  { id: 'content-review', label: 'Review',  icon: '✎', active: true },
  { id: 'agents',       label: 'Agents',       icon: '⚙', active: true },
  { id: 'log',          label: 'Log',           icon: '▤', active: true },
  { id: 'settings',     label: 'Settings',      icon: '☸', active: true },
  { id: 'store',        label: 'Store',         icon: '◆', active: false, future: 'First $100 MRR' },
  { id: 'achievements', label: 'Achievements',  icon: '★', active: false, future: 'First sale event' },
  { id: 'inventory',    label: 'Inventory',      icon: '▦', active: false, future: '5+ agent vault notes' },
];
