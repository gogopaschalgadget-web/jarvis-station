// room-views.js - Room rendering at 3 zoom levels
// ES Module. No em-dashes. No credentials.

import { ROOMS, ROOM_COLORS, PROGRESSION_STATES, OP_STATUSES, TIER_COLORS } from './rooms.js';
import { gridToIso, getApiData, TILE_W, TILE_H, ZOOM_THRESHOLD_MID, ZOOM_THRESHOLD_MICRO } from './renderer.js';

// --- MAIN DRAW ENTRY ---
export function drawRooms(ctx, zoom) {
  drawGridConnections(ctx);
  for (const room of ROOMS) {
    drawRoom(ctx, room, zoom);
  }
}

// --- GRID CONNECTIONS (corridors between rooms) ---
function drawGridConnections(ctx) {
  ctx.save();
  ctx.strokeStyle = '#1a2535';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  // Horizontal and vertical neighbors
  const pairs = [
    [0, 1], [1, 2],  // row 0
    [3, 4], [4, 5],  // row 1 (rooms 6,5,4 in grid)
    [6, 7], [7, 8],  // row 2
    [0, 5], [1, 4], [2, 3],  // col links row 0-1 (Room1-6, Room2-5, Room3-4)
    [5, 6], [4, 7], [3, 8],  // col links row 1-2 (Room6-7, Room5-8, Room4-9)
  ];

  for (const [a, b] of pairs) {
    const ra = ROOMS[a], rb = ROOMS[b];
    const pa = gridToIso(ra.row, ra.col);
    const pb = gridToIso(rb.row, rb.col);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  ctx.restore();
}

// --- ROOM TILE ---
function drawRoom(ctx, room, zoom) {
  const pos = gridToIso(room.row, room.col);
  const colors = ROOM_COLORS[room.id];
  const apiData = getApiData();
  const roomState = apiData?.rooms?.[String(room.id)] || {};
  const progState = roomState.progression || 'blueprint';
  const opStatus = roomState.operational || 'offline';

  const hw = TILE_W * 0.5;
  const hh = TILE_H * 0.5;

  // Draw diamond tile
  ctx.save();
  ctx.translate(pos.x, pos.y);

  // Fill
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.lineTo(hw, 0);
  ctx.lineTo(0, hh);
  ctx.lineTo(-hw, 0);
  ctx.closePath();

  // Gradient fill based on progression state
  const alpha = progState === 'blueprint' ? 0.15 : progState === 'under_construction' ? 0.3 : 0.5;
  ctx.fillStyle = hexToRgba(colors.accent, alpha);
  ctx.fill();

  // Border - style from progression state
  const progDef = PROGRESSION_STATES[progState] || PROGRESSION_STATES.blueprint;
  ctx.strokeStyle = progDef.color || colors.accent;
  ctx.lineWidth = progState === 'operational' ? 2 : 1;
  if (progDef.border === 'dashed') ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Room accent glow for operational rooms
  if (progState === 'operational' || progState === 'under_construction') {
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(0, hh);
    ctx.lineTo(-hw, 0);
    ctx.closePath();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // --- MACRO LEVEL: name + status badge ---
  // Room number and name
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${room.id}`, 0, -hh * 0.45);

  ctx.fillStyle = '#c8d0dc';
  ctx.font = 'bold 10px -apple-system, system-ui, sans-serif';
  ctx.fillText(room.name, 0, -hh * 0.1);

  // Status badge
  const opDef = OP_STATUSES[opStatus] || OP_STATUSES.offline;
  ctx.fillStyle = opDef.color;
  ctx.beginPath();
  ctx.arc(-30, hh * 0.35, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = opDef.color;
  ctx.font = '600 8px SF Mono, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(opDef.label.toUpperCase(), -22, hh * 0.38);

  // --- MID LEVEL: detail text + equipment count ---
  if (zoom >= ZOOM_THRESHOLD_MID) {
    const detail = roomState.detail || room.desc;
    ctx.fillStyle = '#6b7a8d';
    ctx.font = '9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(truncText(detail, 28), 0, hh * 0.65);

    // Equipment count indicator
    const eqCount = room.equipment.length;
    const activeCount = room.equipment.filter(e => e.status === 'active' || e.status === 'online').length;
    ctx.fillStyle = '#4a5568';
    ctx.font = '8px SF Mono, Consolas, monospace';
    ctx.fillText(`${activeCount}/${eqCount} equip`, 0, hh * 0.85);
  }

  // --- MICRO LEVEL: equipment mini-bars ---
  if (zoom >= ZOOM_THRESHOLD_MICRO && room.equipment.length > 0) {
    const barY = -hh * 0.75;
    const barW = hw * 1.2;
    const barH = 3;
    const spacing = 5;

    for (let i = 0; i < Math.min(room.equipment.length, 7); i++) {
      const eq = room.equipment[i];
      const tier = eq.tier || 'basic';
      const tc = TIER_COLORS[tier] || '#444';
      const bx = -barW * 0.5;
      const by = barY - (i * spacing);

      // Tier bar background
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(bx, by, barW, barH);

      // Tier bar fill
      const tierIdx = ['offline', 'basic', 'enhanced', 'advanced', 'legendary'].indexOf(tier);
      const fillPct = Math.max(0.05, (tierIdx + 1) / 5);
      ctx.fillStyle = tc;
      ctx.fillRect(bx, by, barW * fillPct, barH);
    }
  }

  ctx.restore();
}

// --- HELPERS ---
export function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function truncText(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 2) + '..' : str;
}
