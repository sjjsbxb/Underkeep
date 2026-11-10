"use strict";

const combatFx = (() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const styles = {
    slash:     { color: "#d9b67c", light: "#fff0cb", life: 460 },
    bash:      { color: "#cf9b4b", light: "#fff1b5", life: 470 },
    thrust:    { color: "#72b0b1", light: "#dcfff0", life: 460 },
    ember:     { color: "#e8753c", light: "#ffe2a4", life: 500 },
    guard:     { color: "#859ba3", light: "#e0e8d4", life: 360 },
    blocked:   { color: "#ab9563", light: "#ffdf9e", life: 460 },
    potion:    { color: "#87af70", light: "#ddffad", life: 520 },
    damage:    { color: "#a34d38", light: "#ffb49a", life: 420 },
    heavy:     { color: "#c35338", light: "#ffc488", life: 560 },
    charge:    { color: "#a75935", light: "#ffd489", life: 510 },
    armor:     { color: "#d98446", light: "#ffe7b3", life: 580 },
    interrupt: { color: "#69a8ab", light: "#d8ffec", life: 580 },
  };
  let started = 0;
  let events = [];
  let impact = null;

  function clear() {
    events = [];
    impact = null;
  }

  function begin() {
    clear();
    started = performance.now();
  }

  function emit(kind, value, delay = 0) {
    events.push({ kind, value, start: started + delay });
  }

  function hit(enemy, kind, damage) {
    emit(kind, damage);
    impact = { enemy, defeated: enemy.life === 0 };
  }

  function active(now) {
    events = events.filter(({ kind, start }) => now - start < styles[kind].life);
    if (now - started >= 320) impact = null;
    return Boolean(events.length || impact);
  }

  function pose(enemy, now) {
    if (impact?.enemy !== enemy) return null;
    const t = Math.max(0, (now - started) / 320);
    if (t >= 1) return null;
    const recoil = Math.sin(Math.min(1, t * 2.7) * Math.PI) * (1 - t);
    return {
      x: reducedMotion.matches ? 0 : Math.round(recoil * 7),
      y: reducedMotion.matches ? 0 : Math.round(impact.defeated ? t * t * 22 : recoil * 3),
      alpha: impact.defeated ? Math.min(1, (1 - t) * 1.55) : 1,
    };
  }

  function cameraKick(now) {
    if (reducedMotion.matches) return 0;
    const heavy = events.find((event) => event.kind === "heavy");
    if (!heavy) return 0;
    const t = (now - heavy.start) / 165;
    const amount = heavy.value == null ? .008 : .017;
    return t >= 0 && t < 1 ? Math.sin(t * 17) * (1 - t) ** 2 * amount : 0;
  }

  function box(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), size, size);
  }

  function swipe(ctx, x, y, kind, color, light, t) {
    const thrust = kind === "thrust";
    const heavy = kind === "heavy";
    const spread = heavy ? 185 : thrust ? 83 : 72;
    const leading = Math.min(1, t * 4 + .22);
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      if (u > leading || u < leading - .8) continue;
      const dx = (u - .5) * spread;
      const dy = (u - .5) * (thrust ? -28 : heavy ? -91 : -69) + Math.sin(u * Math.PI) * (thrust ? 0 : 18);
      const size = Math.round(2 + Math.sin(Math.PI * u) * (heavy ? 11 : 7));
      box(ctx, x + dx, y + dy + 3, size + 2, color);
      box(ctx, x + dx + 1, y + dy, size, light);
    }
  }

  function crest(ctx, x, y, color, light) {
    for (let row = 0; row < 9; row++) {
      const half = row < 4 ? 19 : 19 - (row - 3) * 3;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x - half), Math.round(y - 18 + row * 4), half * 2, 4);
      box(ctx, x - half, y - 18 + row * 4, 3, light);
      box(ctx, x + half - 3, y - 18 + row * 4, 3, light);
    }
    ctx.fillStyle = light;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 10), 4, 18);
    ctx.fillRect(Math.round(x - 7), Math.round(y - 4), 14, 4);
  }

  function motes(ctx, x, y, color, light, t, rising) {
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.39996;
      const distance = (11 + (i * 11 % 34)) * (1 - (1 - t) ** 2);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance * .7 - (rising ? t * 28 : 0);
      box(ctx, x + dx, y + dy, i % 4 === 0 ? 4 : 2, i % 3 ? color : light);
    }
  }

  function flame(ctx, x, y, color, light, t) {
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 15;
      const base = y + 19 - t * (18 + i * 4);
      const peak = i === 1 ? 7 : 5;
      for (let row = 0; row < peak; row++) {
        const span = (peak - row) * 2;
        const curl = Math.round(Math.sin(row * .55 + t * 4 + i) * row);
        ctx.fillStyle = row < 2 ? light : color;
        ctx.fillRect(Math.round(x + dx + curl - span / 2), Math.round(base - row * 4), span, 4);
      }
    }
  }

  function remedy(ctx, x, y, color, light) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - 3), Math.round(y - 10), 6, 20);
    ctx.fillRect(Math.round(x - 10), Math.round(y - 3), 20, 6);
    box(ctx, x - 2, y - 2, 4, light);
  }

  function label(ctx, text, x, y, color) {
    ctx.font = 'bold 17px "Microsoft YaHei UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#19130e";
    ctx.fillStyle = color;
    ctx.strokeText(text, Math.round(x), Math.round(y));
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  function draw(ctx, now, width, height) {
    const reduced = reducedMotion.matches;
    const cx = width * .5;
    const cy = height * .5;
    for (const { kind, value, start } of events) {
      const { color, light, life } = styles[kind];
      const age = now - start;
      if (age < 0 || age >= life) continue;
      const t = age / life;
      const motion = reduced ? .35 : t;
      const fade = Math.min(1, (1 - t) * 2.8);
      ctx.save();
      ctx.globalAlpha = fade;
      if (kind === "slash" || kind === "thrust" || kind === "heavy") {
        swipe(ctx, cx, cy + (kind === "heavy" ? 17 : 0), kind, color, light, motion);
      } else if (kind === "bash" || kind === "guard" || kind === "blocked") {
        crest(ctx, cx, cy + (kind === "bash" ? 0 : 27), color, light);
      } else if (kind === "ember") {
        flame(ctx, cx, cy, color, light, motion);
      } else if (kind === "potion") {
        remedy(ctx, cx - 31, cy + 37 - motion * 23, color, light);
      }
      if (!reduced && (kind === "damage" || kind === "heavy") && t < .46) {
        ctx.globalAlpha = (1 - t / .46) * (kind === "heavy" ? .52 : .32);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 10, height);
        ctx.fillRect(width - 10, 0, 10, height);
        ctx.fillRect(0, height - 6, width, 6);
        ctx.globalAlpha = fade;
      }
      if (!reduced && kind !== "damage") {
        motes(ctx, cx, cy + (kind === "potion" ? 38 : 0), color, light, motion, kind === "ember" || kind === "potion" || kind === "charge");
      }
      if (typeof value === "string") {
        label(ctx, value, cx, cy + 49 - motion * 15, light);
      } else if (value != null) {
        const incoming = kind === "damage" || kind === "heavy" || kind === "blocked";
        const x = cx + (incoming || kind === "potion" ? -64 : 57);
        const y = cy + (incoming ? 53 : kind === "potion" ? 28 : -18);
        label(ctx, kind === "potion" ? `+${value}` : `−${value}`, x, y - motion * 28, light);
      }
      ctx.restore();
    }
  }

  return { begin, clear, emit, hit, active, pose, cameraKick, draw };
})();
