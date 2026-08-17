// tests/qa/boss-portraits.mjs — what does each boss look like FROM THE GAME?
//
//   node tests/qa/boss-portraits.mjs                  → all fourteen
//   node tests/qa/boss-portraits.mjs --only=01        → one, for a single sitting
//   node tests/qa/boss-portraits.mjs --set=after      → docs/media/bosses/after/
//
// WHY THIS EXISTS, WHEN THERE ARE ALREADY 44 CERTIFICATION CAPTURES
//
// Those shoot a ROOM. A boss occupies a fifth of one, at the top of frame,
// half-cut by the HUD's boss bar, at whatever angle the fight happened to leave
// it — which is a fine picture of a room and a useless picture of a monster.
// Every judgement this project has made about boss LOOKS has been made from
// those, and the judgement it produced ("they are all blobs") turned out to be
// wrong in both directions: the Skeletal Mantis reads instantly, and the
// Obsidian Arachnid has eight legs nobody could see.
//
// THE SHADOW TEST IS THE POINT, AND IT IS THE SECOND IMAGE
//
// Every boss is rendered twice: lit, and again as a flat black shape on white.
// The second one is the test. This game has exactly one camera — 56° above,
// looking down — so what a player reads is a FOOTPRINT, not a portrait: mass
// that extends outward becomes the silhouette and mass that hangs downward
// vanishes under whatever is above it. If you cannot name the boss from its
// black shape, the player cannot find it in a fight, and no amount of colour,
// emissive or detail on the lit version will fix that.
//
// Both views are shot at the game's real pitch rather than straight down, for
// the same reason `voxRing` lies flat: the answer has to be measured where the
// player is standing, not where the geometry is easiest to look at.
//
// THE CAMERA IS READ FROM `index.js`, NEVER TYPED HERE
//
// The first version of this probe hardcoded a 56° pitch, taken from a sentence
// in `AAA.md` describing a rig at height 18 / back 12. That rig is gone: the
// game runs `CAM_HEIGHT = 17.5` with `back = 0.35 * height`, which is **70.7°**
// — far closer to overhead. So every boss judgement made through this probe's
// first outing was made at an angle the game does not use, and the parts that
// looked load-bearing from 56° (a fin seen edge-on, a leg seen side-on) are not
// the parts a player sees. An instrument's constants are hypotheses; this one
// was a hypothesis copied out of prose about a build that had moved on.
//
// AND IT IS SHOT AT GAMEPLAY SIZE TOO, WHICH IS THE HARDER TEST
//
// A boss rendered to fill 700px is not the boss anyone fights. At the real
// camera distance the frame spans ~24 world units, so a 6-unit boss is about a
// quarter of the width — and detail that carries a portrait can disappear
// entirely at that scale, or worse, dissolve into shimmer. This project has
// made that mistake before in the other direction: an outline that improved
// every number and looked worse, on a character too small to afford it. The
// `-ingame` frame is the one to trust when the two disagree.
//
// PRINT-ONLY, AND NOT A GATE. "Can you name this shape" is a judgement by a
// person, which is exactly the kind of thing `REVIEW.md` §4.6 says must not be
// promoted into a threshold — a gate here would only teach whoever hit it to
// lower the number. It writes pictures; you look at them.

import fs from 'node:fs';
import path from 'node:path';
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

// Derived from the game's own source, so a rig change cannot leave this probe
// quietly photographing a camera angle nobody uses. It already did once.
const INDEX = fs.readFileSync('src/game/index.js', 'utf8');
const num = (re, what) => {
    const m = INDEX.match(re);
    if (!m) throw new Error(`cannot read ${what} from src/game/index.js`);
    return parseFloat(m[1]);
};
const CAM_FOV = num(/camera\.fov\s*=\s*([\d.]+)/, 'camera.fov');
const CAM_HEIGHT = num(/const CAM_HEIGHT\s*=\s*([\d.]+)/, 'CAM_HEIGHT');
const CAM_BACK_RATIO = num(/back:\s*CAM_HEIGHT\s*\*\s*([\d.]+)/, 'camera back ratio');
const CAM_BACK = CAM_HEIGHT * CAM_BACK_RATIO;
const CAM_DIST = Math.hypot(CAM_HEIGHT, CAM_BACK);
const CAM_PITCH = Math.atan2(CAM_HEIGHT, CAM_BACK);

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SET = arg('set') || 'current';
const ONLY = arg('only') || '';
const OUT = path.join('docs', 'media', 'bosses', SET);

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8794);
const browser = await puppeteer.default.launch({
    executablePath: chrome.path,
    headless: 'new',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const errors = [];
try {
    const page = await browser.newPage();
    await disableGamepads(page);
    await page.setViewport({ width: 700, height: 700 });
    page.on('pageerror', (e) => errors.push(String(e.message || e)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    // The import map lives in index.html, so module resolution needs the real
    // page. Waiting on the debug hook proves the graph loaded before anything
    // below tries to import a piece of it.
    await page.waitForFunction(() => !!window.__sovereignScar, { timeout: 60000 });
    await sleep(400);

    const shots = await page.evaluate(async (only, cam) => {
        const THREE = await import('three');
        const R = await import('/src/game/bosses/roster.js');
        const { SandSpur } = await import('/src/game/bosses/sand-spur.js');
        const { KineticCore } = await import('/src/game/bosses/kinetic-core.js');
        const { CollisionWorld } = await import('/src/engine/collision.js');

        const scene = () => new THREE.Scene();
        const at = { x: 0, z: 0 };
        const ring = [{ x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 }];

        // Same constructors, same order, as tests/qa/boss-silhouette.mjs. Two
        // probes asking different questions of the identical roster is fine;
        // two probes disagreeing about what the roster IS would not be.
        const ROSTER = [
            ['01', 'crypt-warden', () => new R.CryptWarden(scene(), { ...at })],
            ['02', 'tri-compiler', () => new R.TriCompiler(scene(), ring.slice(0, 3))],
            ['03', 'sand-spur', () => new SandSpur(scene(), new CollisionWorld(), null, ring)],
            ['04', 'kinetic-core', () => new KineticCore(scene(), new CollisionWorld(), { ...at }, {})],
            ['05', 'the-proxy', () => new R.ProxyBoss(scene(), { x: 0, y: 1.5, z: 0 })],
            ['06', 'obsidian-arachnid', () => new R.ObsidianArachnid(scene(), { ...at })],
            ['07', 'hydroid-cloud', () => new R.HydroidCloud(scene(), { ...at })],
            ['08', 'skeletal-mantis', () => new R.SkeletalMantis(scene(), { ...at })],
            ['09', 'phantasm', () => new R.PhantasmBoss(scene(), { ...at })],
            ['10', 'frost-and-fuel', () => new R.FrostAndFuel(scene(), { ...at })],
            ['11', 'sludge-golem', () => new R.SludgeGolem(scene(), { ...at })],
            ['12', 'magma-wyrm', () => new R.MagmaWyrm(scene(), { ...at })],
            ['13', 'gumoi-witness', () => new R.GumoiWitness(scene(), { ...at })],
            ['14', 'leviathan-core', () => new R.LeviathanBoss(scene(), { ...at })],
        ].filter(([n]) => !only || n === only);

        // Own renderer, own canvas, `preserveDrawingBuffer` so toDataURL comes
        // back with pixels in it. Reading the GAME's canvas would race its own
        // rAF loop and return either a frame of the title screen or nothing.
        const canvas = document.createElement('canvas');
        canvas.width = 700; canvas.height = 700;
        const renderer = new THREE.WebGLRenderer({
            canvas, antialias: true, preserveDrawingBuffer: true,
        });
        renderer.setSize(700, 700, false);
        renderer.setPixelRatio(1);

        const PITCH = cam.pitch;

        const out = [];
        for (const [num, slug, make] of ROSTER) {
            let boss;
            try { boss = make(); } catch (e) { out.push({ num, slug, error: e.message }); continue; }
            const root = boss.root || boss.mesh;
            if (!root) { out.push({ num, slug, error: 'no root' }); continue; }

            // Run it before shooting it, and run it against a player that
            // MOVES. Five bosses assemble at the origin and only fly apart on
            // the first tick — the Hydroid Cloud builds all twelve orbs in the
            // same place — so a portrait taken cold is a picture of a boss
            // nobody fights. The Magma Wyrm is the sharper case: it is a chain
            // that trails through a wake buffer, so against a STATIONARY player
            // it never swims, the six segments collapse onto each other, and it
            // photographs as one lumpy ball. That is not the boss either; it is
            // an artefact of the harness standing still, and judging the model
            // from it would send the redesign after a problem it does not have.
            const player = {
                root: { position: { x: 0, y: 1.95, z: 4 } },
                health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
                state: { facingVec: { x: 0, z: -1 } },
            };
            boss._awake = true;
            for (let i = 0; i < 150; i++) {
                // Orbit the player so movement-driven bosses actually move.
                const a = (i / 150) * Math.PI * 1.6;
                player.root.position.x = Math.sin(a) * 4.5;
                player.root.position.z = Math.cos(a) * 4.5;
                try { boss.tickAI?.(1 / 60, player, null); } catch (_) { /* needs fuller ctx */ }
                boss.t = (boss.t || 0) + 1 / 60;
            }
            // THEN BRING THE PLAYER TO THE CAMERA AND LET THE BOSS TURN.
            //
            // In a fight the camera sits behind the player, so a boss that
            // faces the player is facing the CAMERA — the player sees bosses
            // front-on, essentially always. Leaving the orbit wherever it
            // stopped photographed every turning boss at whatever
            // three-quarter angle the loop happened to end on, and three of
            // these redesigns have been judged from that. Parking the player
            // between the boss and the lens for the last half-second is what
            // the fight actually looks like.
            // Relative to where the boss ACTUALLY ended up, not to the world
            // origin: these things move while they are ticked, and a player
            // parked at a fixed point leaves the boss facing off into the room.
            player.root.position.x = root.position.x;
            player.root.position.z = root.position.z + 4.5;
            for (let i = 0; i < 40; i++) {
                try { boss.tickAI?.(1 / 60, player, null); } catch (_) { /* needs fuller ctx */ }
                boss.t = (boss.t || 0) + 1 / 60;
            }

            const shotScene = new THREE.Scene();
            shotScene.add(root);

            const box = new THREE.Box3().setFromObject(root);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const extent = Math.max(size.x, size.y, size.z, 1);

            const fov = 35;
            const dist = (extent / (2 * Math.tan((fov * Math.PI) / 360))) * 1.75;
            const shotCam = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
            // In FRONT of the boss: bodies are built head-forward along +Z
            // (`faceToward` says so), so a camera on -Z photographs its back.
            const place = (camera, d) => {
                camera.position.set(
                    c.x,
                    c.y + Math.sin(PITCH) * d,
                    c.z + Math.cos(PITCH) * d,
                );
                camera.lookAt(c);
            };
            place(shotCam, dist);

            const key = new THREE.DirectionalLight(0xffffff, 2.6);
            key.position.set(4, 9, 6);
            const rim = new THREE.DirectionalLight(0xa8c0ff, 1.1);
            rim.position.set(-5, 3, -4);
            const amb = new THREE.HemisphereLight(0xcfd6e4, 0x2a2a32, 1.15);
            shotScene.add(key, rim, amb);
            shotScene.background = new THREE.Color(0x2a2d34);
            renderer.render(shotScene, shotCam);
            const lit = canvas.toDataURL('image/png');

            // AT GAMEPLAY SIZE. The real camera: its fov, its distance, and a
            // 16:9 frame — so the boss subtends exactly the fraction of the
            // screen it does in a fight. Detail that survives the portrait and
            // dies here is detail the player never receives.
            renderer.setSize(1280, 720, false);
            const gameCam = new THREE.PerspectiveCamera(cam.fov, 1280 / 720, 0.1, 400);
            place(gameCam, cam.dist);
            renderer.render(shotScene, gameCam);
            const ingame = canvas.toDataURL('image/png');
            renderer.setSize(700, 700, false);

            // THE TEST. Every material flat black, background white. Swapped
            // rather than recoloured, and the originals are put back after, so
            // a boss shot later in the same run is not left painted black.
            const saved = [];
            const flat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            root.traverse((o) => {
                if (!o.isMesh) return;
                saved.push([o, o.material]);
                o.material = flat;
            });
            shotScene.background = new THREE.Color(0xffffff);
            renderer.render(shotScene, shotCam);
            const shadow = canvas.toDataURL('image/png');
            for (const [o, m] of saved) o.material = m;

            out.push({
                num, slug, lit, shadow, ingame,
                w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2),
                // What fraction of the frame's width the boss actually covers.
                frac: +(size.x / (2 * cam.dist * Math.tan((cam.fov * Math.PI) / 360)
                    * (1280 / 720))).toFixed(3),
            });
        }
        renderer.dispose();
        return out;
    }, ONLY, { pitch: CAM_PITCH, fov: CAM_FOV, dist: CAM_DIST });

    fs.mkdirSync(OUT, { recursive: true });
    const write = (file, dataUrl) =>
        fs.writeFileSync(path.join(OUT, file),
            Buffer.from(dataUrl.split(',')[1], 'base64'));

    console.log('\n=== BOSS PORTRAITS ===');
    console.log(`  camera read from index.js: fov ${CAM_FOV}°, height ${CAM_HEIGHT},`
        + ` back ${CAM_BACK.toFixed(2)} → pitch ${(CAM_PITCH * 180 / Math.PI).toFixed(1)}°,`
        + ` dist ${CAM_DIST.toFixed(2)}`);
    console.log('  lit + shadow framed on the boss; -ingame at true gameplay size\n');
    for (const s of shots) {
        if (s.error) { console.log(`  ${s.num} ${s.slug.padEnd(20)} ERROR ${s.error}`); continue; }
        write(`${s.num}-${s.slug}.png`, s.lit);
        write(`${s.num}-${s.slug}-shadow.png`, s.shadow);
        write(`${s.num}-${s.slug}-ingame.png`, s.ingame);
        console.log(`  ${s.num} ${s.slug.padEnd(20)} ${String(s.w).padStart(6)} w ·`
            + ` ${String(s.h).padStart(6)} h · ${String(s.d).padStart(6)} d`
            + ` · covers ${(s.frac * 100).toFixed(0)}% of frame width`);
    }
    console.log(`\n  → ${OUT}/  (${shots.filter((s) => !s.error).length * 2} images)`);
    console.log(`  page errors: ${errors.length}`);
    if (errors.length) for (const e of errors.slice(0, 5)) console.log(`    ${e}`);
} finally {
    await browser.close();
    await server.close();
}
