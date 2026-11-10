"use strict";

const layout = [
  "###############",
  "#....#..#.....#",
  "#.#..#..#.....#",
  "#.#.....#.....#",
  "#...#...#.....#",
  "###.#...###D###",
  "#...#...#.....#",
  "#.....#.......#",
  "###.#.#.#####.#",
  "#...#.#.......#",
  "#.#.#.#####.#.#",
  "#.....#.....#.#",
  "#.....#.......#",
  "###############",
];
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const headings = ["↑ 北", "→ 东", "↓ 南", "← 西"];
const roster = [
  { name: "赫岚", role: "盾卫", art: "guard", hp: 31, focus: 4, attack: 5, skill: "盾击", description: "盾击 7 伤害，并替全队挡下部分反击" },
  { name: "苔鸦", role: "斥候", art: "scout", hp: 24, focus: 4, attack: 6, skill: "破绽", description: "破绽 8 伤害，下两次攻击额外 +3" },
  { name: "墨灯", role: "咒师", art: "mage", hp: 21, focus: 4, attack: 4, skill: "余火", description: "余火 12 伤害，对守陵者也有效" },
  { name: "阿弥", role: "司祭", art: "priest", hp: 25, focus: 4, attack: 5, skill: "净光", description: "净光治疗伤势最重的队友 12 点" },
];
const encounters = [
  { x: 3, y: 8, name: "墓道骸兵", hp: 27, art: "skeleton", damage: 8 },
  { x: 7, y: 7, name: "巡墓亡卒", hp: 41, art: "skeleton", damage: 12 },
  { x: 11, y: 11, name: "失火侍从", hp: 38, art: "warden", damage: 10 },
  { x: 11, y: 3, name: "灰誓守陵者", hp: 78, art: "warden", damage: 16 },
];
const landmarks = [
  { x: 1, y: 1, type: "key", art: "chest", title: "守火人的遗匣" },
  { x: 5, y: 11, type: "cache", art: "chest", title: "遗落的药箱" },
  { x: 1, y: 11, type: "secret", art: "plaque", title: "松动的石板" },
  { x: 9, y: 7, type: "riddle", art: "altar", title: "三印石台" },
  { x: 13, y: 11, type: "shrine", art: "altar", title: "回响圣龛" },
  { x: 11, y: 1, type: "exit", art: "portal", title: "余烬封印" },
];
const torches = [
  [3.12, 11.35], [3.82, 9.45], [3.65, 6.5], [3.28, 2.35], [1.45, 1.28],
  [7.69, 7.32], [9.49, 6.28], [11.65, 6.23], [12.72, 11.65],
  [10.28, 4.3], [12.70, 3.27], [11.72, 1.33], [7.72, 3.25],
];
const $ = (selector) => document.querySelector(selector);
const controls = [...document.querySelectorAll("[data-action]")];
const viewport = $("#view");
const ctx = viewport.getContext("2d", { alpha: false });
const map = $("#map").getContext("2d");
const width = viewport.width;
const height = viewport.height;
const focal = width * .72;
const pixels = ctx.createImageData(width, height);
const pixelData = new Uint32Array(pixels.data.buffer);
const depths = new Float32Array(width);
const drawables = {};
const actorPanels = [];
let game;
let camera;
let motion;
let flash;
let audio;
let sound = false;
let modalOptions = [];
let focusBeforeModal;

function freshGame() {
  game = {
    x: 3, y: 12, facing: 0, steps: 0, potions: 2, sword: false,
    party: roster.map((member) => ({ ...member, life: member.hp, energy: member.focus })),
    enemies: encounters.map((enemy) => ({ ...enemy, life: enemy.hp })),
    visited: new Set(), seen: new Set(), used: new Set(), battle: null, ended: false,
    door: false, logs: [],
  };
  camera = { x: 3.5, y: 12.5, angle: -Math.PI / 2 };
  motion = null;
  flash = null;
  closeModal(false);
  reveal();
  note("石门在身后合拢。沿着火光，寻找余烬封印。");
  update();
}

function tile(x, y) {
  return layout[y]?.[x] ?? "#";
}

function solid(x, y) {
  return tile(x, y) === "#" || (tile(x, y) === "D" && !game.door);
}

function key(x, y) {
  return y * layout[0].length + x;
}

function enemyAt(x, y) {
  return game.enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.life > 0);
}

function landmarkAt(x, y) {
  return landmarks.find((item) => item.x === x && item.y === y && !game.used.has(item.type));
}

function ahead() {
  const [dx, dy] = directions[game.facing];
  return [game.x + dx, game.y + dy];
}

function reveal() {
  game.visited.add(key(game.x, game.y));
  for (const [dx, dy] of directions) {
    for (let distance = 1; distance <= 2; distance++) {
      const x = game.x + dx * distance;
      const y = game.y + dy * distance;
      game.seen.add(key(x, y));
      if (solid(x, y)) break;
    }
  }
  game.seen.add(key(game.x, game.y));
}

function note(copy, emphasis = false) {
  game.logs.unshift({ copy, emphasis });
  game.logs.length = Math.min(game.logs.length, 35);
}

function openModal(tag, title, copy, options) {
  if ($("#overlay").hidden) focusBeforeModal = document.activeElement;
  $("#overlay-tag").textContent = tag;
  $("#overlay-title").textContent = title;
  $("#overlay-copy").textContent = copy;
  modalOptions = options;
  $("#overlay-options").replaceChildren(...options.map(([label, action]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }));
  $("#overlay").hidden = false;
  $("#overlay-options button").focus();
}

function closeModal(restore = true) {
  $("#overlay").hidden = true;
  modalOptions = [];
  if (restore) focusBeforeModal?.focus();
  focusBeforeModal = null;
}

function describe(title, copy) {
  openModal("地牢发现", title, copy, [["继续探索", () => closeModal()]]);
}

function finish(won) {
  game.ended = true;
  game.battle = null;
  const title = won ? "余烬重燃" : "火光熄灭";
  const copy = won
    ? `你把手覆在封印上。地窟深处传来一声长叹，墓道的火焰一盏接一盏亮起。\n本次远征走过 ${game.visited.size} 格，击败 ${game.enemies.filter((enemy) => !enemy.life).length} 名守墓者。`
    : "最后一支火把落在石阶上。地窟记住了你们的脚步。";
  note(title, true);
  openModal(won ? "远征完成" : "远征结束", title, copy, [["再进地窟", freshGame]]);
  tone(won ? "win" : "hurt");
}

function useLandmark(item) {
  switch (item.type) {
    case "key":
      game.used.add("key");
      game.potions++;
      note("从遗匣取出黄铜钥匙与一瓶药剂。", true);
      describe(item.title, "一把黄铜钥匙压着一片烧焦的纸。上面写着：\n「木已烧尽，烟已散去。守火人的誓言留在余烬里。」");
      break;
    case "cache":
      game.used.add("cache");
      game.potions += 2;
      note("拾得两瓶治疗药剂。", true);
      describe(item.title, "皮扣一碰就断，里面的两只药瓶仍然完好。");
      break;
    case "secret":
      game.used.add("secret");
      game.sword = true;
      note("赫岚换上守火人之刃，普通攻击 +3。", true);
      describe(item.title, "你从石板背后的凹槽抽出一柄短剑。剑刃仍带着温度。");
      break;
    case "riddle":
      openModal("墓窟机关", item.title, "碑上刻着一句话：「烈焰熄灭以后，什么还记得火？」\n石台上有三枚可以按下的印记。", [
        ["枯木", () => wrongSeal(item)],
        ["烟雾", () => wrongSeal(item)],
        ["余烬", () => {
          game.used.add("riddle");
          note("余烬印亮了，北侧铁门的暗锁弹开。", true);
          tone("win");
          update();
          describe("印记亮起", "一道暖光沿石缝向北爬去。那里还有一扇需要黄铜钥匙才能开启的铁门。");
        }],
        ["退后", () => closeModal()],
      ]);
      break;
    case "shrine":
      game.used.add("shrine");
      for (const member of game.party) {
        member.life = member.hp;
        member.energy = member.focus;
      }
      note("圣龛恢复了整支小队的生命与专注。", true);
      describe(item.title, "你们借圣龛里的旧火歇息。火苗慢慢变蓝，随后静静熄灭。");
      break;
    case "exit":
      if (game.enemies.at(-1).life > 0) {
        describe(item.title, "符文锁在守陵者的誓言上。击败守陵者后才能触碰封印。");
      } else {
        finish(true);
      }
      break;
  }
}

function wrongSeal(item) {
  note("印记陷了下去，机关纹丝未动。", true);
  update();
  describe(item.title, "石缝里飘出一缕冷烟。你想起守火人或许留下过线索。");
}

function interact() {
  const [x, y] = ahead();
  const enemy = enemyAt(x, y);
  const item = landmarkAt(x, y) ?? landmarkAt(game.x, game.y);
  if (enemy) {
    startBattle(enemy);
  } else if (tile(x, y) === "D" && !game.door) {
    if (game.used.has("key") && game.used.has("riddle")) {
      game.door = true;
      reveal();
      note("钥匙转动，铁门向暗处滑开。", true);
      tone("win");
    } else {
      const needs = !game.used.has("key") ? "锁孔需要一把黄铜钥匙。" : "";
      const seal = !game.used.has("riddle") ? "门后有一道暗锁，纹样与东厅的三印石台相同。" : "";
      describe("墓窟铁门", needs + seal);
    }
  } else if (item) {
    useLandmark(item);
  } else {
    note("伸手摸过去，只有湿冷的石头。");
  }
}

function startBattle(enemy) {
  const enemyDirection = directions.findIndex(([dx, dy]) => game.x + dx === enemy.x && game.y + dy === enemy.y);
  if (enemyDirection !== -1) game.facing = enemyDirection;
  game.battle = { enemy, actor: game.party.findIndex((member) => member.life > 0), round: 1, guard: new Set(), ward: false, exposed: 0 };
  note(`${enemy.name}挡住了去路。`, true);
  tone("hurt");
}

function wound(member, damage, battle) {
  if (battle.ward) damage = Math.ceil(damage * .6);
  if (battle.guard.has(member.name)) damage = Math.ceil(damage * .45);
  member.life = Math.max(0, member.life - damage);
  note(`${member.name}受到 ${damage} 点伤害${member.life ? "。" : "，倒下了。"}`);
}

function retaliation(battle) {
  const { enemy, round } = battle;
  const living = game.party.filter((member) => member.life > 0);
  if (enemy === game.enemies.at(-1) && round % 2 === 0) {
    note("守陵者劈下燃烧的长刃。", true);
    for (const member of living) wound(member, 9, battle);
  } else {
    const front = living.find((member) => member.role === "盾卫") ?? living[(round - 1) % living.length];
    wound(front, enemy.damage, battle);
  }
  flash = { start: performance.now(), color: "red" };
  tone("hurt");
  if (!game.party.some((member) => member.life > 0)) {
    finish(false);
    return;
  }
  battle.round++;
  battle.actor = game.party.findIndex((member) => member.life > 0);
  battle.ward = false;
  battle.guard.clear();
}

function attack(enemy, damage, name, battle) {
  if (battle.exposed > 0) {
    damage += 3;
    battle.exposed--;
  }
  enemy.life = Math.max(0, enemy.life - damage);
  note(`${name}造成 ${damage} 点伤害。`);
  flash = { start: performance.now(), color: "gold" };
  tone("hit");
}

function injuredMember() {
  return game.party.filter((member) => member.life > 0 && member.life < member.hp)
    .sort((a, b) => (a.life / a.hp) - (b.life / b.hp))[0];
}

function heal(member, amount, name) {
  const restored = Math.min(amount, member.hp - member.life);
  member.life += restored;
  note(`${name}让${member.name}恢复了 ${restored} 点生命。`);
  tone("win");
}

function battleAction(action) {
  const battle = game.battle;
  const { enemy, actor } = battle;
  const member = game.party[actor];
  const target = injuredMember();
  if (action === "attack") {
    attack(enemy, member.attack + (game.sword && actor === 0 ? 3 : 0), member.name, battle);
  } else if (action === "guard") {
    battle.guard.add(member.name);
    member.energy = Math.min(member.focus, member.energy + 1);
    note(`${member.name}架起防御，恢复 1 点专注。`);
  } else if (action === "potion" && game.potions && target) {
    game.potions--;
    heal(target, 16, "治疗药剂");
  } else if (action === "skill" && member.energy && (actor !== 3 || target)) {
    member.energy--;
    switch (actor) {
      case 0:
        attack(enemy, 7, "盾击", battle);
        battle.ward = true;
        break;
      case 1:
        attack(enemy, 8, "破绽", battle);
        battle.exposed = 2;
        break;
      case 2:
        attack(enemy, 12, "余火", battle);
        break;
      case 3:
        heal(target, 12, "净光");
        break;
    }
  } else {
    return;
  }
  if (!enemy.life) {
    game.battle = null;
    for (const survivor of game.party) {
      if (survivor.life) survivor.energy = Math.min(survivor.focus, survivor.energy + 1);
    }
    note(`击败${enemy.name}。存活队员各恢复 1 点专注。`, true);
    if (enemy === game.enemies.at(-1)) note("守陵者的誓言消散了。去触碰北面的封印。", true);
    tone("win");
    return;
  }
  const next = game.party.findIndex((candidate, index) => index > actor && candidate.life > 0);
  if (next < 0) retaliation(battle);
  else battle.actor = next;
}

function easeCamera() {
  const angle = game.facing * Math.PI / 2 - Math.PI / 2;
  const turn = Math.atan2(Math.sin(angle - camera.angle), Math.cos(angle - camera.angle));
  if (Math.abs(turn) < .001 && camera.x === game.x + .5 && camera.y === game.y + .5) return;
  motion = {
    start: performance.now(), from: { ...camera }, turn,
    x: game.x + .5, y: game.y + .5,
  };
}

function dispatch(action) {
  if (game.ended || modalOptions.length) return;
  if (game.battle) {
    battleAction(action);
  } else if (action === "left" || action === "right") {
    game.facing = (game.facing + (action === "left" ? 3 : 1)) % 4;
    easeCamera();
  } else if (action === "interact") {
    interact();
    easeCamera();
  } else {
    const offset = { forward: 0, back: 2, strafeLeft: 3, strafeRight: 1 }[action];
    if (offset === undefined) return;
    const [dx, dy] = directions[(game.facing + offset) % 4];
    const x = game.x + dx;
    const y = game.y + dy;
    const enemy = enemyAt(x, y);
    if (enemy) {
      startBattle(enemy);
    } else if (solid(x, y)) {
      if (tile(x, y) === "D") describe("墓窟铁门", "面向铁门后按 F，看看锁孔和门上的印记。");
      else tone("wall");
    } else {
      if (motion) {
        // Begin the next step from the current grid cell, even during rapid input.
        camera.x = game.x + .5;
        camera.y = game.y + .5;
      }
      game.x = x;
      game.y = y;
      game.steps++;
      reveal();
      tone("step");
    }
    easeCamera();
  }
  update();
}

function goal() {
  if (game.ended) return [game.party.some((member) => member.life) ? "封印已重燃" : "远征结束", "可以从石门入口重新出发。"];
  if (!game.used.has("key")) return ["寻找黄铜钥匙", "沿墓道向北，在西侧墓室寻找守火人的遗匣。"];
  if (!game.used.has("riddle")) return ["解开三印石台", "找到通往东厅的路，留意遗匣里那张烧焦的纸。"];
  if (!game.door) return ["打开墓窟铁门", "用黄铜钥匙开启东厅北面的铁门。"];
  if (game.enemies.at(-1).life) return ["击败灰誓守陵者", "守陵者在铁门后的墓室。留意它的横扫预告。"];
  return ["触碰余烬封印", "朝墓室最北端前进，面向封印互动。"];
}

function areaName() {
  if (game.y <= 4 && game.x >= 9) return "灰誓墓室";
  if (game.x >= 12 && game.y >= 9) return "圣龛侧廊";
  if (game.x >= 8) return "东厅";
  if (game.x < 4 && game.y <= 3) return "守火人的墓室";
  return game.y >= 11 ? "石门入口" : "守火人墓道";
}

function update() {
  const [title, detail] = goal();
  $("#goal").textContent = title;
  $("#goal-detail").textContent = detail;
  $("#area").textContent = areaName();
  $("#compass").textContent = headings[game.facing];
  $("#supplies").textContent = `药剂 ×${game.potions}${game.sword ? "　·　守火人之刃" : ""}`;
  $("#step-count").textContent = `${game.steps} 步`;
  const battle = game.battle;
  $("#encounter").hidden = !battle;
  $("#explore-actions").hidden = Boolean(battle);
  $("#battle-actions").hidden = !battle;
  $("#mode").textContent = battle ? `第 ${battle.round} 回合` : "探索";
  if (battle) {
    const actor = game.party[battle.actor];
    $("#enemy-name").textContent = battle.enemy.name;
    $("#enemy-life").textContent = `${battle.enemy.life} / ${battle.enemy.hp}`;
    $(".enemy-meter i").style.width = `${battle.enemy.life / battle.enemy.hp * 100}%`;
    $("#mode-detail").textContent = `${actor.name}行动 · ${actor.description}`;
    $("#prompt").textContent = battle.enemy === game.enemies.at(-1) && battle.round % 2 === 0
      ? "守陵者拖起长刃 · 本回合将横扫全队" : "选择行动 · 全队行动后敌人反击";
    $("[data-action=skill]").disabled = !actor.energy || (battle.actor === 3 && !injuredMember());
    $("[data-action=potion]").disabled = !game.potions || !injuredMember();
  } else {
    const [x, y] = ahead();
    const nearby = enemyAt(x, y) ?? landmarkAt(x, y) ?? landmarkAt(game.x, game.y);
    const gate = tile(x, y) === "D" && !game.door;
    $("#mode-detail").textContent = "朝向目标后互动";
    $("#prompt").textContent = game.ended ? "" : nearby ? `F · ${nearby.title ?? nearby.name}` : gate ? "F · 墓窟铁门" : "";
  }
  for (const [index, member] of game.party.entries()) {
    const panel = actorPanels[index];
    panel.card.classList.toggle("active", battle?.actor === index);
    panel.card.classList.toggle("fallen", !member.life);
    panel.life.textContent = `${member.life}/${member.hp}`;
    panel.focus.textContent = `${member.energy}/${member.focus}`;
    panel.lifeBar.style.width = `${member.life / member.hp * 100}%`;
    panel.focusBar.style.width = `${member.energy / member.focus * 100}%`;
  }
  const records = game.logs.map(({ copy, emphasis }) => {
    const row = document.createElement("li");
    row.textContent = copy;
    if (emphasis) row.className = "event";
    return row;
  });
  $("#log").replaceChildren(...records);
  drawMap();
}

function drawMap() {
  const size = 14;
  const left = 15;
  const top = 14;
  map.fillStyle = "#0e1510";
  map.fillRect(0, 0, 240, 224);
  for (let y = 0; y < layout.length; y++) {
    for (let x = 0; x < layout[y].length; x++) {
      const id = key(x, y);
      const seen = game.seen.has(id);
      map.fillStyle = !seen ? "#151d16" : solid(x, y) ? "#343d30" : game.visited.has(id) ? "#57624c" : "#3b4938";
      map.fillRect(left + x * size, top + y * size, size - 1, size - 1);
      if (!seen) continue;
      if (tile(x, y) === "D" && !game.door) map.fillStyle = "#d6a75c";
      else if (enemyAt(x, y)) map.fillStyle = "#c07157";
      else if (landmarkAt(x, y)) map.fillStyle = "#d1c292";
      else continue;
      map.save();
      map.translate(left + x * size + 6, top + y * size + 6);
      map.rotate(Math.PI / 4);
      map.fillRect(-2.4, -2.4, 4.8, 4.8);
      map.restore();
    }
  }
  map.save();
  map.translate(left + game.x * size + 6, top + game.y * size + 6);
  map.rotate(game.facing * Math.PI / 2);
  polygon(map, "#ffe0a0", [[0, -6], [5, 4], [0, 2], [-5, 4]]);
  map.restore();
  $("#map-count").textContent = `${game.visited.size} 格走过`;
}

function tone(type) {
  if (!sound) return;
  const notes = {
    hit: [105, 55, .105, "triangle", .12], hurt: [67, 39, .16, "sawtooth", .055],
    win: [365, 520, .22, "sine", .12], step: [75, 45, .065, "triangle", .05],
    wall: [78, 50, .075, "square", .025],
  };
  const [start, end, duration, wave, volume] = notes[type];
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function showHelp() {
  if (modalOptions.length) return;
  openModal("远征手册", "怎么进地窟", "W / ↑ 前进，S / ↓ 后退，A / D 横移。\nQ / ← 左转，E / → 右转，F / 空格互动。\n\n战斗中用 1–4 行动。战技消耗专注，防御减伤并回复专注。治疗会优先照顾生命比例最低的存活队员。也可以直接点下方按钮。", [
    ["返回", () => closeModal()],
    ["重新开始", () => openModal("重置远征", "回到石门入口？", "本次远征的进度会清空。", [
      ["继续当前远征", () => closeModal()],
      ["重新开始", freshGame],
    ])],
  ]);
}

controls.forEach((button) => button.addEventListener("click", () => dispatch(button.dataset.action)));
$("#help").addEventListener("click", showHelp);
$("#sound").addEventListener("click", async () => {
  if (modalOptions.length) return;
  if (!sound) {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    await audio.resume();
  }
  sound = !sound;
  $("#sound").setAttribute("aria-pressed", String(sound));
  $("#sound").textContent = sound ? "音效开" : "音效关";
  tone("win");
});
const keyboard = {
  w: "forward", ArrowUp: "forward", s: "back", ArrowDown: "back",
  q: "left", ArrowLeft: "left", e: "right", ArrowRight: "right",
  a: "strafeLeft", d: "strafeRight", f: "interact", " ": "interact",
  1: "attack", 2: "skill", 3: "guard", 4: "potion",
};
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (modalOptions.length) {
    if (event.key === "Escape" && !game.ended) closeModal();
    if (event.key === "Tab") {
      const buttons = [...$("#overlay-options").children];
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      event.preventDefault();
    }
    return;
  }
  if (event.key === "Escape") {
    showHelp();
    return;
  }
  const action = keyboard[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (!action || (event.key === " " && document.activeElement.tagName === "BUTTON")) return;
  event.preventDefault();
  if (!event.repeat) dispatch(action);
});

function polygon(context, color, points) {
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function sprite(w, h, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"));
  return canvas;
}

function hash(x, y, seed = 0) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function ink(r, g, b) {
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function makeTexture(kind) {
  const data = new Uint32Array(64 * 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const noise = (hash(x, y, 9) % 20) - 10;
      const grit = (hash(x >> 1, y >> 1, 4) % 15) - 7;
      const broad = (hash(x >> 3, y >> 3, 1) % 15) - 7;
      let color;
      if (kind === "stone") {
        const course = y >> 4;
        const u = (x + (course % 2) * 13 + (course === 3 ? 4 : 0)) & 63;
        const row = y % 16;
        const seam = u % 32;
        const offset = (hash(u >> 5, course, 2) % 22) - 10;
        const chipped = row === 1 && hash(x >> 1, course, 3) % 5 === 0;
        const base = row === 0 || seam === 0 || chipped ? 35
          : row === 1 || seam === 1 ? 105
            : row === 15 || seam === 31 ? 52 : 80 + offset + broad;
        const moss = (hash(x >> 3, y >> 2, 8) % 5 === 0 && row > 8) ? 10 : 0;
        color = [base + grit + noise + 7 - moss, base + grit + noise + 6, base + grit + noise - 4 - moss];
      } else if (kind === "door") {
        const band = y >= 10 && y <= 14 || y >= 42 && y <= 46;
        const rivet = band && y % 32 === 12 && x % 13 === 5;
        const isFrame = x < 5 || x > 58 || y < 5;
        const lock = x > 27 && x < 37 && y > 32 && y < 40;
        const base = band || isFrame ? 76 : x % 11 === 0 ? 29 : 47 + (hash(x >> 2, 1) % 20);
        color = rivet || lock ? [154 + noise, 127 + noise, 72 + noise] : [base + noise + 8, base + noise + 2, base + noise - 2];
      } else {
        const seam = x === 0 || y === 0 || (kind === "ceiling" && x === 32);
        const base = seam ? 34 : x === 1 || y === 1 ? 77 : 58 + broad;
        color = [base + noise + 3, base + noise + 6, base + noise - 1];
      }
      data[y * 64 + x] = ink(...color.map((channel) => clamp(channel)));
    }
  }
  return data;
}

const stone = makeTexture("stone");
const iron = makeTexture("door");
const floor = makeTexture("floor");
const ceiling = makeTexture("ceiling");
const lightField = Array.from({ length: layout.length }, (_, y) =>
  Array.from({ length: layout[y].length }, (_, x) => {
    let light = 0;
    for (const [tx, ty] of torches) {
      light = Math.max(light, Math.max(0, 1 - Math.hypot(x + .5 - tx, y + .5 - ty) / 3.1));
    }
    return light;
  })
);

function shaded(color, light, warmth) {
  const r = Math.min(255, (color & 255) * (light + warmth * .28) + 4);
  const g = Math.min(255, ((color >>> 8) & 255) * (light + warmth * .10) + 7);
  const b = Math.min(255, ((color >>> 16) & 255) * (light - warmth * .09) + 6);
  return ink(r, g, b);
}

function drawSurfaces(dx, dy, rx, ry, flicker) {
  for (let y = 0; y < height; y++) {
    const under = y >= height / 2;
    const depth = focal * (under ? .51 : .49) / Math.abs(y + .5 - height / 2);
    const stepX = rx * depth / focal;
    const stepY = ry * depth / focal;
    let fx = camera.x + dx * depth - stepX * width / 2;
    let fy = camera.y + dy * depth - stepY * width / 2;
    const attenuation = 1 / (1 + depth * depth * .07);
    const source = under ? floor : ceiling;
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(fx);
      const gy = Math.floor(fy);
      const torch = (lightField[gy]?.[gx] ?? 0) * flicker;
      const tx = ((fx - gx) * 64) & 63;
      const ty = ((fy - gy) * 64) & 63;
      const light = attenuation * (under ? .46 + torch * .39 : .25 + torch * .31) + .09;
      pixelData[y * width + x] = shaded(source[ty * 64 + tx], light, torch * attenuation);
      fx += stepX;
      fy += stepY;
    }
  }
}

function drawWalls(dx, dy, rx, ry, flicker) {
  for (let x = 0; x < width; x++) {
    const across = (x + .5 - width / 2) / focal;
    const rayX = dx + rx * across;
    const rayY = dy + ry * across;
    let gx = Math.floor(camera.x);
    let gy = Math.floor(camera.y);
    const stepX = rayX < 0 ? -1 : 1;
    const stepY = rayY < 0 ? -1 : 1;
    const deltaX = Math.abs(1 / rayX);
    const deltaY = Math.abs(1 / rayY);
    let nextX = (rayX < 0 ? camera.x - gx : gx + 1 - camera.x) * deltaX;
    let nextY = (rayY < 0 ? camera.y - gy : gy + 1 - camera.y) * deltaY;
    let side;
    let depth;
    do {
      side = nextX < nextY;
      if (side) {
        gx += stepX;
        depth = nextX;
        nextX += deltaX;
      } else {
        gy += stepY;
        depth = nextY;
        nextY += deltaY;
      }
    } while (!solid(gx, gy));
    depth = Math.max(.03, depth);
    depths[x] = depth;
    const source = tile(gx, gy) === "D" ? iron : stone;
    const point = side ? camera.y + depth * rayY : camera.x + depth * rayX;
    const texX = ((point - Math.floor(point)) * 64) & 63;
    const length = focal / depth;
    const top = height / 2 - length * .49;
    const bottom = top + length;
    const attenuation = 1 / (1 + depth * depth * .085);
    const torch = (lightField[gy]?.[gx] ?? 0) * flicker;
    const ambient = .12 + attenuation * ((side ? .49 : .69) + torch * .48);
    const warmth = torch * attenuation;
    for (let y = Math.max(0, Math.ceil(top)); y < Math.min(height, Math.ceil(bottom)); y++) {
      const texY = Math.min(63, ((y - top) / length * 64) | 0);
      const edge = .86 + .14 * Math.sin(Math.PI * texY / 64);
      pixelData[y * width + x] = shaded(source[texY * 64 + texX], ambient * edge, warmth);
    }
  }
}

function buildTorches() {
  return Array.from({ length: 4 }, (_, phase) => sprite(44, 68, (p) => {
    const gradient = p.createRadialGradient(22, 25, 1, 22, 25, 22);
    gradient.addColorStop(0, "#f7b14a89");
    gradient.addColorStop(.3, "#ef982c39");
    gradient.addColorStop(1, "#f6a13a00");
    p.fillStyle = gradient;
    p.fillRect(0, 0, 44, 50);
    polygon(p, "#241f19", [[14, 34], [20, 32], [28, 37], [25, 51], [17, 53]]);
    polygon(p, "#7e6440", [[15, 34], [18, 33], [24, 38], [22, 49], [18, 50]]);
    polygon(p, "#332b1d", [[18, 45], [24, 44], [25, 61], [22, 65]]);
    polygon(p, "#a24526", [[14, 33], [14, 25], [20, 16], [18, 10 + phase], [24, 14], [26, 7 + phase * 2], [30, 22], [30, 31], [26, 37], [20, 39]]);
    polygon(p, "#ed8e3c", [[17, 31], [19, 24], [23, 20], [25 + phase, 12 + phase], [28, 25], [27, 33], [21, 36]]);
    polygon(p, "#ffe5a0", [[20, 31], [21, 26], [24, 22 + phase], [25, 29], [24, 34], [21, 35]]);
    p.fillStyle = "#ffb55b";
    p.fillRect(16 + phase * 3, 7 + phase * 2, 1, 2);
  }));
}

function buildChest() {
  return sprite(66, 50, (p) => {
    polygon(p, "#141911", [[2, 36], [15, 19], [44, 13], [63, 33], [60, 43], [42, 49], [11, 45]]);
    polygon(p, "#61472b", [[7, 18], [14, 10], [50, 10], [60, 17], [62, 34], [57, 40], [10, 40]]);
    polygon(p, "#8f6b3b", [[8, 18], [15, 12], [50, 12], [57, 17], [50, 23], [12, 23]]);
    polygon(p, "#43301e", [[9, 27], [58, 26], [58, 37], [10, 37]]);
    for (const x of [16, 49]) {
      p.fillStyle = "#b09862";
      p.fillRect(x, 13, 4, 26);
      p.fillStyle = "#514839";
      p.fillRect(x + 3, 15, 2, 24);
    }
    p.fillStyle = "#dbc78a";
    p.fillRect(30, 22, 8, 9);
    p.fillStyle = "#4e391d";
    p.fillRect(33, 25, 2, 4);
  });
}

function buildAltar() {
  return sprite(78, 82, (p) => {
    polygon(p, "#131911", [[5, 69], [21, 63], [65, 64], [76, 73], [70, 79], [12, 79]]);
    polygon(p, "#364239", [[13, 63], [22, 56], [26, 33], [52, 34], [55, 57], [65, 62], [68, 72], [13, 72]]);
    polygon(p, "#586355", [[27, 35], [44, 37], [44, 57], [53, 65], [21, 65], [26, 57]]);
    polygon(p, "#4b5246", [[11, 31], [24, 19], [55, 19], [68, 31], [61, 41], [16, 41]]);
    polygon(p, "#7b8070", [[11, 31], [24, 20], [54, 20], [66, 31], [53, 35], [22, 35]]);
    for (const x of [25, 39, 53]) {
      polygon(p, "#464e46", [[x - 5, 29], [x, 24], [x + 5, 29], [x, 34]]);
      polygon(p, x === 39 ? "#b6caa1" : "#9c9d75", [[x - 3, 29], [x, 26], [x + 3, 29], [x, 32]]);
    }
    p.fillStyle = "#acbf9c";
    p.fillRect(36, 46, 2, 12);
    p.fillRect(32, 49, 10, 2);
  });
}

function buildPortal() {
  return sprite(92, 122, (p) => {
    polygon(p, "#202720", [[9, 116], [9, 37], [20, 17], [38, 7], [54, 7], [72, 17], [83, 37], [83, 116]]);
    polygon(p, "#526353", [[16, 111], [16, 38], [26, 20], [41, 12], [53, 12], [67, 20], [77, 38], [77, 111]]);
    polygon(p, "#1b2e29", [[24, 107], [24, 42], [33, 25], [47, 18], [60, 26], [69, 42], [69, 107]]);
    const light = p.createRadialGradient(46, 62, 4, 46, 62, 28);
    light.addColorStop(0, "#efd0849a");
    light.addColorStop(1, "#a9a87900");
    p.fillStyle = light;
    p.fillRect(17, 33, 58, 58);
    polygon(p, "#eed798", [[46, 40], [63, 61], [46, 81], [29, 61]]);
    polygon(p, "#6f6a47", [[46, 45], [58, 61], [46, 76], [34, 61]]);
    polygon(p, "#f5d58b", [[46, 51], [50, 61], [46, 71], [42, 61]]);
    p.fillStyle = "#687560";
    p.fillRect(7, 107, 79, 7);
    p.fillStyle = "#333e31";
    p.fillRect(4, 114, 85, 6);
  });
}

function buildEnemy(armored) {
  return sprite(108, 143, (p) => {
    const draw = (color, points) => polygon(p, color, points);
    const metal = armored ? "#70634f" : "#8c8872";
    const edge = armored ? "#a78b61" : "#beb496";
    const shade = armored ? "#4b4437" : "#4e5146";
    draw("#151812b0", [[10, 128], [31, 117], [82, 116], [103, 129], [88, 138], [32, 140]]);
    draw("#171b16", [[40, 42], [70, 37], [86, 64], [78, 91], [84, 125], [73, 132], [57, 116], [56, 86], [50, 106], [43, 129], [23, 129], [29, 106], [30, 69]]);
    if (armored) {
      draw("#4e3027", [[42, 28], [71, 24], [82, 45], [88, 74], [84, 94], [92, 126], [78, 115], [72, 130], [62, 110], [57, 119], [62, 82], [37, 87], [21, 114], [25, 65], [30, 44]]);
      draw("#734336", [[30, 51], [37, 50], [39, 68], [26, 108], [28, 72]]);
      draw("#342a24", [[72, 46], [85, 72], [80, 95], [86, 119], [75, 106], [70, 86]]);
    }
    draw(shade, [[35, 80], [51, 83], [45, 104], [42, 120], [33, 127], [22, 125], [27, 118]]);
    draw(metal, [[35, 90], [42, 92], [37, 105], [35, 117], [28, 120], [31, 107]]);
    draw(shade, [[57, 82], [70, 80], [72, 101], [79, 119], [86, 126], [81, 132], [65, 127], [60, 108]]);
    draw(metal, [[60, 88], [68, 88], [69, 106], [74, 120], [68, 122], [64, 110]]);
    draw(shade, [[35, 39], [45, 33], [67, 35], [76, 47], [68, 75], [66, 85], [45, 88], [32, 78], [35, 58]]);
    draw(metal, [[37, 40], [54, 35], [71, 42], [69, 55], [61, 58], [61, 69], [65, 77], [52, 82], [40, 79], [43, 67], [37, 60]]);
    if (armored) {
      draw(edge, [[38, 44], [53, 40], [67, 44], [54, 54], [40, 49]]);
      draw("#42362c", [[39, 53], [53, 59], [65, 54], [63, 68], [50, 72], [42, 66]]);
      draw("#be7046", [[52, 57], [55, 60], [52, 66], [48, 61]]);
    } else {
      for (let y = 45; y < 69; y += 6) {
        draw("#272a24", [[38, y], [48, y + 4], [58, y + 3], [67, y - 1], [62, y + 5], [50, y + 7], [42, y + 5]]);
      }
      p.fillStyle = edge;
      p.fillRect(50, 41, 4, 31);
    }
    draw(metal, [[34, 40], [25, 45], [17, 69], [17, 84], [25, 89], [29, 84], [23, 76], [30, 62], [37, 57]]);
    draw(edge, [[26, 47], [33, 44], [27, 58], [21, 67], [20, 63]]);
    draw(shade, [[71, 39], [81, 46], [84, 63], [96, 72], [93, 81], [77, 75], [70, 58]]);
    draw(metal, [[74, 43], [80, 48], [81, 62], [92, 70], [88, 75], [77, 70], [72, 56]]);
    draw("#282720", [[86, 73], [91, 67], [98, 76], [94, 85]]);
    draw("#635341", [[89, 86], [83, 71], [85, 67], [101, 74], [100, 79], [95, 80]]);
    draw("#b4aa89", [[90, 78], [98, 80], [98, 109], [93, 134], [87, 114]]);
    draw("#665f52", [[93, 82], [96, 83], [96, 107], [93, 128]]);
    if (armored) {
      draw("#c17946", [[88, 96], [90, 102], [93, 96], [95, 99], [94, 111], [91, 119], [87, 113]]);
      draw("#432e26", [[38, 32], [38, 18], [45, 10], [45, 4], [50, 10], [63, 10], [71, 3], [70, 17], [73, 28], [63, 40], [47, 40]]);
      draw(metal, [[42, 17], [51, 12], [65, 13], [68, 20], [64, 27], [65, 34], [56, 39], [45, 33], [42, 28]]);
      draw(edge, [[42, 18], [50, 13], [60, 14], [63, 18], [54, 20], [48, 24], [43, 23]]);
      draw("#211d1a", [[45, 24], [53, 25], [56, 23], [65, 22], [62, 29], [56, 30], [55, 34], [50, 31], [46, 29]]);
    } else {
      draw("#2d3128", [[37, 26], [38, 18], [46, 11], [58, 10], [67, 17], [69, 28], [63, 35], [60, 40], [46, 40], [43, 34]]);
      draw(metal, [[40, 25], [42, 18], [49, 13], [59, 14], [65, 18], [66, 27], [60, 32], [58, 37], [48, 37], [46, 33]]);
      draw(edge, [[42, 21], [48, 15], [57, 15], [63, 19], [54, 20], [51, 24], [43, 24]]);
      draw("#242a22", [[41, 24], [47, 23], [52, 27], [50, 30], [44, 29]]);
      draw("#242a22", [[56, 27], [62, 23], [65, 24], [62, 30], [56, 30]]);
      draw("#35392e", [[53, 29], [56, 33], [51, 33]]);
    }
    p.fillStyle = armored ? "#f0a05c" : "#c2dc8f";
    p.fillRect(46, 26, 3, 2);
    p.fillRect(59, 25, 3, 2);
    for (let i = 0; i < 50; i++) {
      const x = 38 + hash(i, 2, 8) % 32;
      const y = 42 + hash(i, 1, 6) % 36;
      p.fillStyle = i % 2 ? "#d9cf9c26" : "#10181030";
      p.fillRect(x, y, 1 + i % 2, 1);
    }
  });
}

function buildPortrait(art) {
  const palettes = {
    guard: ["#42483d", "#879084", "#b1b49a", "#665a45", "#b68c66"],
    scout: ["#34483a", "#587256", "#7f9567", "#665449", "#ba9876"],
    mage: ["#413952", "#69627d", "#9687a2", "#5a4847", "#bda28e"],
    priest: ["#3d5350", "#638883", "#a6b9a4", "#665047", "#c3a084"],
  };
  const [shadow, cloth, trim, skinShadow, skin] = palettes[art];
  return sprite(32, 42, (p) => {
    p.fillStyle = "#242a21";
    p.fillRect(0, 0, 32, 42);
    p.fillStyle = "#30382a";
    p.fillRect(4, 4, 24, 33);
    polygon(p, shadow, [[2, 41], [3, 33], [10, 28], [8, 20], [7, 12], [12, 6], [18, 4], [24, 9], [26, 16], [22, 26], [22, 29], [29, 33], [31, 41]]);
    polygon(p, cloth, [[8, 36], [14, 28], [9, 21], [8, 13], [12, 8], [18, 6], [24, 11], [24, 18], [20, 24], [24, 31], [29, 35], [29, 41], [5, 41]]);
    polygon(p, trim, [[10, 12], [13, 8], [18, 6], [22, 9], [16, 9], [13, 13], [12, 19], [10, 18]]);
    polygon(p, skinShadow, [[12, 15], [20, 12], [23, 17], [21, 26], [16, 29], [12, 23]]);
    polygon(p, skin, [[14, 16], [20, 15], [22, 18], [20, 24], [17, 26], [15, 23]]);
    p.fillStyle = "#2a2921";
    p.fillRect(15, 18, 2, 1);
    p.fillRect(20, 18, 2, 1);
    p.fillRect(17, 23, 3, 1);
    polygon(p, trim, [[5, 34], [10, 31], [16, 36], [20, 31], [27, 34], [28, 37], [23, 36], [16, 40], [9, 35]]);
    if (art === "guard") {
      polygon(p, trim, [[9, 10], [14, 6], [21, 7], [24, 13], [22, 17], [14, 17], [12, 22], [9, 20]]);
      p.fillStyle = shadow;
      p.fillRect(13, 15, 10, 2);
    } else if (art === "mage") {
      polygon(p, trim, [[4, 16], [9, 13], [16, 2], [23, 6], [21, 12], [28, 15], [27, 17], [18, 14], [10, 17]]);
      polygon(p, "#bbb49e", [[12, 20], [17, 25], [21, 22], [20, 29], [16, 34], [13, 29]]);
    } else if (art === "priest") {
      p.fillStyle = "#e0c890";
      p.fillRect(16, 11, 4, 2);
      p.fillRect(17, 10, 2, 4);
      p.fillRect(15, 34, 5, 2);
      p.fillRect(17, 32, 1, 7);
    }
  });
}

function initArt() {
  drawables.torch = buildTorches();
  drawables.chest = buildChest();
  drawables.altar = buildAltar();
  drawables.portal = buildPortal();
  drawables.skeleton = buildEnemy(false);
  drawables.warden = buildEnemy(true);
  drawables.plaque = sprite(45, 55, (p) => {
    polygon(p, "#313a30", [[4, 6], [36, 2], [42, 7], [39, 48], [9, 51], [3, 42]]);
    polygon(p, "#6d735e", [[7, 8], [36, 5], [37, 42], [9, 46]]);
    polygon(p, "#363b31", [[18, 6], [21, 20], [17, 27], [23, 34], [21, 45], [26, 35], [20, 27], [25, 21], [22, 6]]);
  });
  for (const member of roster) {
    const card = document.createElement("div");
    card.className = "member";
    const portrait = buildPortrait(member.art);
    portrait.className = "portrait";
    portrait.setAttribute("aria-hidden", "true");
    const info = document.createElement("div");
    info.className = "member-info";
    info.innerHTML = `<div class="member-name">${member.name}</div><div class="member-role">${member.role}</div>
      <div class="stat" title="生命"><i><b></b></i><span></span></div>
      <div class="stat focus" title="专注"><i><b></b></i><span></span></div>`;
    card.append(portrait, info);
    $("#party").append(card);
    actorPanels.push({
      card, life: card.querySelector(".stat span"), focus: card.querySelector(".focus span"),
      lifeBar: card.querySelector(".stat b"), focusBar: card.querySelector(".focus b"),
    });
  }
}

function drawObjects(dx, dy, rx, ry, now) {
  const items = [
    ...game.enemies.filter((enemy) => enemy.life > 0).map((enemy) => ({
      image: drawables[enemy.art], x: enemy.x + .5, y: enemy.y + .5, size: enemy.art === "warden" ? .88 : .76, lift: 0,
    })),
    ...landmarks.filter((item) => !game.used.has(item.type)).map((item) => ({
      image: drawables[item.art], x: item.x + .5, y: item.y + .5,
      size: { chest: .31, altar: .61, portal: .98, plaque: .45 }[item.art], lift: 0,
    })),
    ...torches.map(([x, y], index) => ({
      image: drawables.torch[(Math.floor(now / 105) + index) % 4], x, y, size: .41, lift: .37,
    })),
  ];
  const visible = items.map((item) => {
    const x = item.x - camera.x;
    const y = item.y - camera.y;
    return { ...item, depth: x * dx + y * dy, offset: x * rx + y * ry };
  }).filter((item) => item.depth > .22).sort((a, b) => b.depth - a.depth);
  for (const { image, depth, offset, size, lift } of visible) {
    const scale = focal / depth;
    const spriteHeight = scale * size;
    const spriteWidth = spriteHeight * image.width / image.height;
    const left = width / 2 + offset * scale - spriteWidth / 2;
    const top = height / 2 + (.51 - lift) * scale - spriteHeight;
    ctx.globalAlpha = clamp(1.18 - depth * .083, .28, 1);
    const last = Math.min(width, Math.ceil(left + spriteWidth));
    let column = Math.max(0, Math.floor(left));
    while (column < last) {
      while (column < last && depth >= depths[column]) column++;
      const start = column;
      while (column < last && depth < depths[column]) column++;
      if (start < column) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(start, 0, column - start, height);
        ctx.clip();
        ctx.drawImage(image, left, top, spriteWidth, spriteHeight);
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
}

const vignette = ctx.createRadialGradient(width / 2, height * .48, width * .18, width / 2, height * .52, width * .58);
vignette.addColorStop(0, "#080d0a00");
vignette.addColorStop(.7, "#080d0a55");
vignette.addColorStop(1, "#080d0ac9");
let lastFrame = -100;
function frame(now) {
  requestAnimationFrame(frame);
  if (!motion && !flash && now - lastFrame < 74) return;
  lastFrame = now;
  if (motion) {
    const progress = clamp((now - motion.start) / 135, 0, 1);
    const ease = 1 - (1 - progress) ** 2;
    camera.x = motion.from.x + (motion.x - motion.from.x) * ease;
    camera.y = motion.from.y + (motion.y - motion.from.y) * ease;
    camera.angle = motion.from.angle + motion.turn * ease;
    if (progress === 1) motion = null;
  }
  const dx = Math.cos(camera.angle);
  const dy = Math.sin(camera.angle);
  const flicker = .98 + Math.sin(now / 110) * .08 + Math.cos(now / 241) * .04;
  drawSurfaces(dx, dy, -dy, dx, flicker);
  drawWalls(dx, dy, -dy, dx, flicker);
  ctx.putImageData(pixels, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawObjects(dx, dy, -dy, dx, now);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  if (flash) {
    const intensity = 1 - (now - flash.start) / 225;
    if (intensity > 0) {
      ctx.globalAlpha = intensity * .23;
      ctx.fillStyle = flash.color === "red" ? "#b83c27" : "#d7ad60";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } else {
      flash = null;
    }
  }
}

initArt();
freshGame();
requestAnimationFrame(frame);
