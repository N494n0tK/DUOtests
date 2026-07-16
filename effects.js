'use strict';

// ============================================================
//  FX ENGINE
//  パーティクル / 花火 / 紙吹雪 / シェイク / 浮遊テキスト
// ============================================================
const FX = (() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bgCanvas = document.getElementById('fx-bg');
    const fgCanvas = document.getElementById('fx-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');
    const TAU = Math.PI * 2;

    const PALETTES = {
        gold: ['#fddb00', '#ffe95c', '#ffc400', '#fff3a0', '#ffffff'],
        red: ['#ff5252', '#d31010', '#ff8a80', '#ff1744', '#ffcdd2'],
        party: ['#fddb00', '#ff5252', '#40c4ff', '#69f0ae', '#ffab40', '#ea80fc', '#ffffff'],
        blue: ['#40c4ff', '#80d8ff', '#ffffff', '#fddb00']
    };

    let particles = [];
    let motes = [];
    let running = false;
    let lastTime = 0;
    let dpr = 1;

    function rand(min, max) { return min + Math.random() * (max - min); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        [bgCanvas, fgCanvas].forEach(canvas => {
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
        });
        seedMotes();
        wake();
    }

    // ---------- 背景の浮遊する光の粒 ----------
    function spawnMote(anywhere) {
        return {
            x: Math.random() * window.innerWidth,
            y: anywhere ? Math.random() * window.innerHeight : window.innerHeight + 14,
            r: rand(0.8, 3.1),
            vy: -rand(7, 24),
            vx: rand(-4, 4),
            phase: Math.random() * TAU,
            twinkle: rand(1.1, 3.2),
            color: Math.random() < 0.68 ? '#9db8ff' : (Math.random() < 0.5 ? '#fddb00' : '#ffffff')
        };
    }

    function seedMotes() {
        if (reduceMotion) { motes = []; return; }
        const count = Math.min(52, Math.max(18, Math.floor(window.innerWidth / 26)));
        motes = Array.from({ length: count }, () => spawnMote(true));
    }

    function stepMotes(dt, now) {
        for (const m of motes) {
            m.y += m.vy * dt;
            m.x += m.vx * dt + Math.sin(now / 1400 + m.phase) * 8 * dt;
            if (m.y < -16) Object.assign(m, spawnMote(false));
        }
    }

    function drawMotes(now) {
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const m of motes) {
            const alpha = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(now / 1000 * m.twinkle + m.phase));
            bgCtx.globalAlpha = alpha;
            bgCtx.fillStyle = m.color;
            bgCtx.beginPath();
            bgCtx.arc(m.x, m.y, m.r, 0, TAU);
            bgCtx.fill();
        }
        bgCtx.globalAlpha = 1;
    }

    // ---------- 前面パーティクル ----------
    function push(p) {
        if (particles.length > 1000) particles.splice(0, particles.length - 1000);
        particles.push(p);
        wake();
    }

    function base(x, y, life) {
        return {
            x, y, vx: 0, vy: 0, life, maxLife: life, delay: 0,
            size: 4, color: '#ffffff', rot: rand(0, TAU), vr: rand(-7, 7),
            grav: 0, drag: 1, phase: rand(0, TAU), sway: 0
        };
    }

    function spark(x, y, colors, speed) {
        const angle = rand(0, TAU);
        const v = rand(speed * 0.25, speed);
        return Object.assign(base(x, y, rand(0.45, 1.0)), {
            type: 'spark',
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v,
            size: rand(1.6, 4.2),
            color: pick(colors),
            grav: 380, drag: 0.985
        });
    }

    function star(x, y, colors, speed) {
        const angle = rand(0, TAU);
        const v = rand(speed * 0.3, speed);
        return Object.assign(base(x, y, rand(0.7, 1.25)), {
            type: 'star',
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - 60,
            size: rand(6, 13),
            color: pick(colors),
            grav: 320, drag: 0.984
        });
    }

    function shard(x, y, colors, speed) {
        const angle = rand(0, TAU);
        const v = rand(speed * 0.35, speed);
        return Object.assign(base(x, y, rand(0.5, 0.95)), {
            type: 'shard',
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - 90,
            size: rand(5, 12),
            color: pick(colors),
            grav: 620, drag: 0.988
        });
    }

    function confetti(x, y, colors, opts = {}) {
        return Object.assign(base(x, y, rand(1.6, 3.0)), {
            type: 'confetti',
            vx: rand(-60, 60) + (opts.vx || 0),
            vy: (opts.vy != null ? opts.vy : rand(-320, -140)),
            size: rand(5, 9),
            color: pick(colors),
            grav: 240, drag: 0.99,
            sway: rand(2.2, 4.6),
            delay: opts.delay || 0
        });
    }

    function ringAt(x, y, color, maxR) {
        push(Object.assign(base(x, y, 0.55), {
            type: 'ring', r: 6, maxR: maxR || 130, color, width: 5
        }));
    }

    function explode(x, y, colors) {
        const n = Math.floor(rand(36, 54));
        for (let i = 0; i < n; i++) push(spark(x, y, colors, rand(260, 420)));
        for (let i = 0; i < 7; i++) push(star(x, y, colors, 260));
        ringAt(x, y, pick(colors), rand(110, 170));
    }

    // ---------- 更新・描画 ----------
    function stepParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            if (p.delay > 0) { p.delay -= dt; continue; }
            p.life -= dt;
            if (p.life <= 0) {
                if (p.type === 'rocket') explode(p.x, p.y, p.colors || PALETTES.party);
                particles.splice(i, 1);
                continue;
            }
            const drag = Math.pow(p.drag, dt * 60);
            p.vy += p.grav * dt;
            p.vx *= drag;
            p.vy *= drag;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            if (p.type === 'confetti') {
                p.phase += p.sway * dt;
                p.x += Math.sin(p.phase) * 46 * dt;
            }
            if (p.type === 'ring') p.r += (p.maxR - p.r) * Math.min(1, dt * 9);
            if (p.type === 'rocket' && Math.random() < 0.6) {
                push(Object.assign(base(p.x, p.y, rand(0.2, 0.4)), {
                    type: 'spark', size: rand(1, 2.4), color: pick(['#ffe95c', '#ffffff', '#ffc400']),
                    vx: rand(-24, 24), vy: rand(20, 90), grav: 60, drag: 0.99
                }));
            }
        }
    }

    function drawStarPath(ctx, r) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rad = i % 2 === 0 ? r : r * 0.44;
            const a = (i / 10) * TAU - Math.PI / 2;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
    }

    function drawParticles() {
        fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const p of particles) {
            if (p.delay > 0) continue;
            const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.42)));
            fgCtx.globalAlpha = alpha;
            fgCtx.fillStyle = p.color;
            switch (p.type) {
                case 'spark':
                    fgCtx.beginPath();
                    fgCtx.arc(p.x, p.y, p.size, 0, TAU);
                    fgCtx.fill();
                    break;
                case 'star':
                    fgCtx.save();
                    fgCtx.translate(p.x, p.y);
                    fgCtx.rotate(p.rot);
                    drawStarPath(fgCtx, p.size);
                    fgCtx.fill();
                    fgCtx.restore();
                    break;
                case 'shard':
                    fgCtx.save();
                    fgCtx.translate(p.x, p.y);
                    fgCtx.rotate(p.rot);
                    fgCtx.beginPath();
                    fgCtx.moveTo(0, -p.size);
                    fgCtx.lineTo(p.size * 0.62, p.size);
                    fgCtx.lineTo(-p.size * 0.62, p.size * 0.55);
                    fgCtx.closePath();
                    fgCtx.fill();
                    fgCtx.restore();
                    break;
                case 'confetti': {
                    fgCtx.save();
                    fgCtx.translate(p.x, p.y);
                    fgCtx.rotate(p.rot);
                    const squeeze = 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 1.4));
                    fgCtx.fillRect(-p.size / 2, -p.size * squeeze / 2, p.size, p.size * squeeze);
                    fgCtx.restore();
                    break;
                }
                case 'ring':
                    fgCtx.strokeStyle = p.color;
                    fgCtx.lineWidth = p.width * alpha + 0.5;
                    fgCtx.beginPath();
                    fgCtx.arc(p.x, p.y, p.r, 0, TAU);
                    fgCtx.stroke();
                    break;
                case 'rocket':
                    fgCtx.beginPath();
                    fgCtx.arc(p.x, p.y, 3, 0, TAU);
                    fgCtx.fill();
                    break;
                case 'text':
                    fgCtx.save();
                    fgCtx.translate(p.x, p.y);
                    const grow = 1 + (1 - p.life / p.maxLife) * 0.18;
                    fgCtx.scale(grow, grow);
                    fgCtx.font = p.font;
                    fgCtx.textAlign = 'center';
                    fgCtx.lineWidth = 5;
                    fgCtx.strokeStyle = 'rgba(0,0,0,0.75)';
                    fgCtx.strokeText(p.text, 0, 0);
                    fgCtx.fillText(p.text, 0, 0);
                    fgCtx.restore();
                    break;
            }
        }
        fgCtx.globalAlpha = 1;
    }

    // ---------- メインループ ----------
    function frame(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        stepMotes(dt, now);
        drawMotes(now);
        stepParticles(dt);
        drawParticles();
        if (particles.length === 0 && motes.length === 0) {
            running = false;
            fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            fgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            return;
        }
        requestAnimationFrame(frame);
    }

    function wake() {
        if (running) return;
        if (particles.length === 0 && motes.length === 0) return;
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(frame);
    }

    // ---------- 公開API ----------
    function correctBurst(x, y, combo = 1) {
        if (reduceMotion) return;
        const power = Math.min(1 + combo * 0.09, 2.4);
        const colors = combo >= 10 ? PALETTES.party : PALETTES.gold;
        ringAt(x, y, '#fddb00', 120 * power);
        for (let i = 0; i < Math.floor(22 * power); i++) push(spark(x, y, colors, 330 * power));
        for (let i = 0; i < Math.floor(6 + Math.min(combo, 14) * 0.8); i++) push(star(x, y, colors, 300 * power));
        if (combo >= 5) {
            for (let i = 0; i < 18; i++) push(confetti(x, y, PALETTES.party));
        }
        if (combo >= 10) ringAt(x, y, '#ffffff', 190 * power);
    }

    function wrongBurst(x, y) {
        if (reduceMotion) return;
        ringAt(x, y, '#ff1744', 140);
        for (let i = 0; i < 20; i++) push(shard(x, y, PALETTES.red, 400));
        for (let i = 0; i < 16; i++) push(spark(x, y, PALETTES.red, 320));
    }

    function floatText(x, y, text, color = '#fddb00', size = 30) {
        if (reduceMotion) return;
        push(Object.assign(base(x, y, 1.0), {
            type: 'text', text, color,
            font: `900 ${size}px Oswald, sans-serif`,
            vy: -75, vr: 0, drag: 0.98
        }));
    }

    function confettiRain(count = 110) {
        if (reduceMotion) return;
        for (let i = 0; i < count; i++) {
            push(confetti(rand(0, window.innerWidth), rand(-60, -10), PALETTES.party, {
                vy: rand(90, 220), delay: rand(0, 1.6)
            }));
        }
    }

    function fireworks(count = 6) {
        if (reduceMotion) return;
        for (let i = 0; i < count; i++) {
            push(Object.assign(base(rand(window.innerWidth * 0.12, window.innerWidth * 0.88), window.innerHeight + 10, rand(0.75, 1.15)), {
                type: 'rocket',
                vy: -rand(560, 760),
                vx: rand(-50, 50),
                color: '#fff3a0',
                colors: pick([PALETTES.party, PALETTES.gold, PALETTES.blue]),
                delay: i * 0.34 + rand(0, 0.22),
                drag: 0.995
            }));
        }
    }

    function shake(strong = false) {
        if (reduceMotion) return;
        const el = document.querySelector('.app-container');
        if (!el) return;
        el.classList.remove('fx-shake', 'fx-shake-strong');
        void el.offsetWidth;
        el.classList.add(strong ? 'fx-shake-strong' : 'fx-shake');
    }

    window.addEventListener('resize', resize);
    resize();

    return { correctBurst, wrongBurst, floatText, confettiRain, fireworks, shake };
})();

// ============================================================
//  SFX ENGINE - WebAudio によるレトロゲーム風効果音
// ============================================================
const SFX = (() => {
    let audioCtx = null;
    let enabled = localStorage.getItem('duoSfxEnabled') !== 'off';

    function ctx() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            audioCtx = new AC();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function tone({ freq = 440, to = null, time = 0, dur = 0.1, type = 'square', vol = 0.08 }) {
        const ac = ctx();
        if (!ac) return;
        const t0 = ac.currentTime + time;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.06);
    }

    const bank = {
        click: () => tone({ freq: 1250, dur: 0.05, type: 'triangle', vol: 0.045 }),
        start: () => {
            tone({ freq: 523, dur: 0.09, vol: 0.07 });
            tone({ freq: 659, time: 0.09, dur: 0.09, vol: 0.07 });
            tone({ freq: 784, time: 0.18, dur: 0.2, vol: 0.07 });
        },
        correct: (combo = 1) => {
            const step = Math.pow(1.0595, Math.min(combo - 1, 12));
            tone({ freq: 660 * step, dur: 0.08, vol: 0.065 });
            tone({ freq: 880 * step, time: 0.07, dur: 0.14, vol: 0.065 });
            if (combo >= 5) tone({ freq: 1320 * step, time: 0.14, dur: 0.16, type: 'triangle', vol: 0.06 });
        },
        wrong: () => {
            tone({ freq: 196, dur: 0.18, type: 'sawtooth', vol: 0.075 });
            tone({ freq: 147, time: 0.09, dur: 0.28, type: 'sawtooth', vol: 0.075 });
        },
        tick: () => tone({ freq: 1568, dur: 0.045, vol: 0.04 }),
        fanfare: () => {
            [523, 659, 784, 1047].forEach((f, i) =>
                tone({ freq: f, time: i * 0.115, dur: i === 3 ? 0.5 : 0.12, vol: 0.075 }));
        },
        perfect: () => {
            [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
                tone({ freq: f, time: i * 0.1, dur: i >= 4 ? 0.45 : 0.11, vol: 0.075 }));
        },
        gameover: () => {
            [392, 330, 262, 196].forEach((f, i) =>
                tone({ freq: f, time: i * 0.15, dur: i === 3 ? 0.5 : 0.17, type: 'sawtooth', vol: 0.065 }));
        }
    };

    return {
        get enabled() { return enabled; },
        toggle() {
            enabled = !enabled;
            localStorage.setItem('duoSfxEnabled', enabled ? 'on' : 'off');
            return enabled;
        },
        play(name, ...args) {
            if (!enabled || !bank[name]) return;
            try { bank[name](...args); } catch (e) { /* AudioContext unavailable */ }
        }
    };
})();
