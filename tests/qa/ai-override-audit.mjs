// Which authored enemies have had their kind's defining behaviour overridden?
import { BEAT_LIST } from '../game/_beat-defs.mjs';
const DEFAULT = { sentinel:'chase', scarab:'charge', frost:'ranged',
  bulwark:'chase', mote:'drift', lancer:'lunge', brood:'charge' };
const bad = [];
for (const def of BEAT_LIST) for (const [rid, room] of Object.entries(def.rooms))
  for (const e of room.enemies || []) {
    const k = e.kind || 'sentinel';
    if (e.ai && e.ai !== DEFAULT[k]) bad.push({ beat: def.id, room: rid, kind: k, ai: e.ai, shouldBe: DEFAULT[k] });
  }
console.table(bad);
const byKind = {};
for (const b of bad) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
console.log('total overridden:', bad.length, byKind);

// Does every dungeon show each of its kinds doing its OWN thing at least once?
const viol = [];
for (const def of BEAT_LIST) {
  const seen = new Map(); // kind -> {total, onDefault}
  for (const room of Object.values(def.rooms)) for (const e of room.enemies || []) {
    const k = e.kind || 'sentinel';
    const r = seen.get(k) || { total: 0, onDefault: 0 };
    r.total++; if (!e.ai || e.ai === DEFAULT[k]) r.onDefault++;
    seen.set(k, r);
  }
  for (const [k, r] of seen) if (r.onDefault === 0) viol.push(`${def.id}: ${k} never behaves like a ${k} (${r.total} instances)`);
}
console.log('\nkind-identity violations:', viol.length ? '\n  ' + viol.join('\n  ') : 'none');
