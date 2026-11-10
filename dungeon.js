"use strict";

const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const headings = ["↑ 北", "→ 东", "↓ 南", "← 西"];
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
let game;
let camera;
let motion;
let audio;
let sound = false;
let modalOptions = [];
let focusBeforeModal;

function freshGame(mission, hero = camp.profile()) {
  const { x, y } = mission.start;
  game = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    x, y, facing: 0, steps: 0, potions: 2, sword: false,
    mission, hero, player: { life: hero.hp, energy: hero.focus },
    enemies: mission.encounters.map((enemy) => ({ ...enemy, life: enemy.hp })),
    visited: new Set(), seen: new Set(), used: new Set(), battle: null, ended: false,
    door: false, logs: [],
  };
  note(`${hero.name}${mission.intro}`);
  enterExpedition(game);
  tone("depart");
}

function enterExpedition(run) {
  game = run;
  const { mission, hero, x, y, facing } = game;
  game.lightField = buildLightField(mission);
  camera = { x: x + .5, y: y + .5, angle: (facing - 1) * Math.PI / 2 };
  motion = null;
  combatFx.clear();
  closeModal(false);
  $("#camp").hidden = true;
  $("#expedition").hidden = false;
  $("#help").hidden = false;
  $("#footer-controls").hidden = false;
  $("#chapter").textContent = `${mission.chapter} ／ ${mission.title}`;
  $("#player-identity .portrait")?.remove();
  $("#player-identity").prepend(buildPortrait(hero.id));
  $(".player-name").textContent = hero.name;
  $(".player-role").textContent = hero.role;
  $("#skill-name").textContent = hero.skill;
  reveal();
  updateCheckpoint();
  $(game.battle ? "[data-action=attack]" : "[data-action=forward]").focus({ preventScroll: true });
}

function showCamp(message) {
  const returning = Boolean(game);
  combatFx.clear();
  game = null;
  closeModal(false);
  $("#expedition").hidden = true;
  $("#help").hidden = true;
  $("#footer-controls").hidden = true;
  $("#chapter").innerHTML = "营地 <span>／</span> 灰鸦镇";
  $("#camp").hidden = false;
  camp.show(message);
  if (returning) $($("#camp-report").hidden ? "#camp-depart" : "#report-title").focus({ preventScroll: true });
}

function updateCheckpoint() {
  update();
  if (!game.ended) {
    const saved = camp.saveExpedition(expeditionSave.capture(game));
    $("#expedition-save-status").textContent = saved ? "已自动保存" : "本页临时进度";
  }
}

function tile(x, y) {
  return game.mission.layout[y]?.[x] ?? "#";
}

function wallAt(x, y) {
  const ground = tile(x, y);
  return ground === "#" || (ground === "D" && !game.door) || closedLampGate(ground, game.used);
}

function floodedAt(x, y) {
  return !game.used.has("drain") && tile(x, y) === "~";
}

function solid(x, y) {
  return wallAt(x, y) || floodedAt(x, y);
}

function key(x, y) {
  return y * game.mission.layout[0].length + x;
}

function enemyAt(x, y) {
  return game.enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.life > 0);
}

function availableLandmark(item) {
  return item.art === "lamp" || (!game.used.has(item.type) && (item.type !== "ledger" || !camp.hasMineLedger()));
}

function landmarkAt(x, y) {
  return game.mission.landmarks.find((item) => item.x === x && item.y === y && availableLandmark(item));
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
      if (wallAt(x, y)) break;
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
  if (game.ended) return;
  game.ended = true;
  game.battle = null;
  const { mission } = game;
  const result = camp.settleExpedition(expeditionSave.capture(game), won ? "won" : "lost");
  const title = won ? mission.successTitle : "火光熄灭";
  const copy = won
    ? `${mission.success}\n营地金库获得 ${result?.reward ?? 0} 金币。`
    : "你的火把落在石阶上。地窟记住了你的脚步。";
  note(title, true);
  openModal(won ? "远征完成" : "远征结束", title, copy, [["返回营地", () => showCamp()]]);
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
    case "westCache":
    case "cache": {
      const amount = item.potions ?? 2;
      game.used.add(item.type);
      game.potions += amount;
      note(`拾得治疗药剂 ×${amount}。`, true);
      describe(item.title, `皮扣一碰就断，箱里还有 ${amount} 瓶完好的治疗药剂。`);
      break;
    }
    case "secret":
      game.used.add("secret");
      game.sword = true;
      note("你拾起守火人之刃，本次远征的普通攻击额外 +3。", true);
      describe(item.title, "你从石板背后的凹槽抽出一柄短剑。剑刃仍带着温度。");
      break;
    case "riddle":
      openModal("墓窟机关", item.title, "碑上刻着一句话：「烈焰熄灭以后，什么还记得火？」\n石台上有三枚可以按下的印记。", [
        ["枯木", () => wrongSeal(item)],
        ["烟雾", () => wrongSeal(item)],
        ["余烬", () => {
          game.used.add("riddle");
          note("余烬印亮了，北侧铁门的暗锁弹开。", true);
          tone("mechanism");
          updateCheckpoint();
          describe("印记亮起", "一道暖光沿石缝向北爬去。那里还有一扇需要黄铜钥匙才能开启的铁门。");
        }],
        ["退后", () => closeModal()],
      ]);
      break;
    case "shrine":
      game.used.add("shrine");
      game.player.life = game.hero.hp;
      game.player.energy = game.hero.focus;
      note("圣龛恢复了你的生命与专注。", true);
      describe(item.title, item.copy ?? "你借圣龛里的旧火歇息。火苗慢慢变蓝，随后静静熄灭。");
      break;
    case "drain":
      openModal("矿井机关", item.title, "闸轮旁刻着排水渠的走向。转动闸轮，积水便会流入井底。", [
        ["转动闸轮", () => {
          game.used.add("drain");
          reveal();
          note("积水退去，北侧采掘厅和两条横巷可以通行了。", true);
          tone("mechanism");
          updateCheckpoint();
          describe("水位下降", "铁闸深处发出轰鸣，水面逐渐降到石阶下方。");
        }],
        ["退后", () => closeModal()],
      ]);
      break;
    case "ledger":
      if (!game.used.has("drain")) {
        describe("泡在水里的文书箱", "水还没退，够不到锁扣。先去西侧泵房排水。");
        break;
      }
      game.used.add("ledger");
      note("从东侧工具巷取回矿工名册。通关后把它交给铁匠。", true);
      tone("mechanism");
      describe(item.title, "油布保住了矿工名册。最后一页夹着旧短镐的锻造图，带回灰鸦镇交给铁匠。");
      break;
    case "westLamp":
    case "eastLamp": {
      const route = cloisterRoutes[item.gate];
      if (game.used.has(route.flag) || !game.enemies.at(-1).life) {
        describe(item.title, game.used.has(route.flag) ? `${route.passage}已经打开，另一侧石门关闭。` : "司钟人已倒下。晨钟正等着你。");
        break;
      }
      const pattern = route.charge ? `司钟人会先蓄力，再使出「${route.heavyName}」。` : `司钟人每隔一回合便会使出「${route.heavyName}」。`;
      openModal("修道院机关", item.title, `点亮这盏壁灯会打开${route.passage}，并熄灭另一盏灯。${pattern}`, [
        ["点亮壁灯", () => {
          game.used.delete(cloisterRoutes.W.flag);
          game.used.delete(cloisterRoutes.E.flag);
          game.used.add(route.flag);
          reveal();
          note(`${route.lamp}亮起，${route.passage}的石门缓缓升起。`, true);
          tone("mechanism");
          closeModal();
          updateCheckpoint();
        }],
        ["退后", () => closeModal()],
      ]);
      break;
    }
    case "exit":
      if (game.enemies.at(-1).life > 0) {
        describe(item.title, game.mission.exitBlocked);
      } else {
        finish(true);
      }
      break;
  }
}

function wrongSeal(item) {
  note("印记陷了下去，机关纹丝未动。", true);
  updateCheckpoint();
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
      tone("mechanism");
    } else {
      const needs = !game.used.has("key") ? "锁孔需要一把黄铜钥匙。" : "";
      const seal = !game.used.has("riddle") ? "门后有一道暗锁，纹样与东厅的三印石台相同。" : "";
      describe("墓窟铁门", needs + seal);
    }
  } else if (item) {
    useLandmark(item);
  } else if (closedLampGate(tile(x, y), game.used)) {
    describe("沉重的石门", `点亮大厅里的${cloisterRoutes[tile(x, y)].lamp}才能打开这扇门。`);
  } else if (floodedAt(x, y)) {
    describe("淹没的通道", "水没过了头顶。西侧泵房的闸轮可以排水。");
  } else {
    note("伸手摸过去，只有湿冷的石头。");
  }
}

function startBattle(enemy) {
  const enemyDirection = directions.findIndex(([dx, dy]) => game.x + dx === enemy.x && game.y + dy === enemy.y);
  if (enemyDirection !== -1) game.facing = enemyDirection;
  game.battle = { enemy, round: 1 };
  combatFx.clear();
  note(`${enemy.name}挡住了去路。`, true);
  tone("encounter");
}

function enemyIntent({ enemy, round, interruptRound, interruptPenalty }) {
  const pattern = (enemy.lanternTactics && cloisterRoute(game.used)) || enemy;
  const { charge, heavyName, heavyDamage, windup = "高举铁镐" } = pattern;
  if (charge && round % 3 === 2) {
    return { kind: "charge", damage: 0, name: heavyName, nextDamage: heavyDamage, windup, interrupted: interruptRound === round + 1 };
  }
  if (heavyDamage && round % (charge ? 3 : 2) === 0) {
    if (round === interruptRound) return { kind: "staggered", damage: enemy.damage - interruptPenalty, name: "仓促反击" };
    return { kind: "heavy", damage: heavyDamage, name: heavyName };
  }
  return { kind: "normal", damage: enemy.damage, name: "反击" };
}

function retaliation(battle, damageMultiplier) {
  const intent = enemyIntent(battle);
  const { enemy } = battle;
  const delay = 145;
  if (intent.kind === "charge") {
    if (!intent.interrupted) {
      note(`${enemy.name}${intent.windup}，下一回合将使出${intent.name}。`, true);
      combatFx.emit("charge", "蓄力", delay);
      tone("charge");
    }
    battle.round++;
    return;
  }
  const damage = Math.ceil(intent.damage * damageMultiplier);
  const { player } = game;
  player.life = Math.max(0, player.life - damage);
  note(`${enemy.name}的${intent.name}造成 ${damage} 点伤害。`);
  if (damageMultiplier < 1) {
    if (intent.kind === "heavy") combatFx.emit("heavy", null, delay);
    combatFx.emit("blocked", damage, delay);
  } else {
    combatFx.emit(intent.kind === "heavy" ? "heavy" : "damage", damage, delay);
  }
  if (!player.life) {
    finish(false);
    return;
  }
  tone(intent.kind === "heavy" ? "heavy" : "hurt");
  battle.round++;
  if (enemyIntent(battle).kind === "heavy") tone("charge");
}

function attack(enemy, damage, name, style) {
  enemy.life = Math.max(0, enemy.life - damage);
  note(`${name}造成 ${damage} 点伤害。`);
  combatFx.hit(enemy, style, damage);
  tone("hit");
}

function physicalDamage(enemy, power, pierce = 0) {
  return Math.max(1, power - Math.max(0, (enemy.armor ?? 0) - pierce));
}

function basicAttackDamage(hero, enemy) {
  return physicalDamage(enemy, hero.attack + (game.sword ? 3 : 0), hero.pierce);
}

function skillEffect(hero, battle, intent) {
  const { enemy, round } = battle;
  const armorBreak = Math.min(hero.armorBreak ?? 0, enemy.armor ?? 0);
  const canInterrupt = hero.id === "scout" && (intent.kind === "heavy" || intent.kind === "charge");
  return {
    damage: hero.armorBreak ? hero.power : physicalDamage(enemy, hero.power),
    multiplier: hero.heavyBlock ? (intent.kind === "heavy" ? (100 - hero.heavyBlock) / 100 : .6) : 1,
    armorBreak,
    interruptRound: canInterrupt ? round + (intent.kind === "charge" ? 1 : 0) : null,
  };
}

function battleAction(action) {
  const { battle, player, hero } = game;
  const { enemy } = battle;
  if (!["attack", "guard", "potion", "skill"].includes(action) ||
      (action === "skill" && !player.energy) ||
      (action === "potion" && (!game.potions || player.life >= hero.hp))) return;
  combatFx.begin();
  let damageMultiplier = 1;
  if (action === "attack") {
    attack(enemy, basicAttackDamage(hero, enemy), "普通攻击", "slash");
  } else if (action === "guard") {
    damageMultiplier = 1 / 3;
    combatFx.emit("guard");
    if (player.energy < hero.focus) {
      player.energy++;
      note("你举盾防御，恢复 1 点专注。");
    } else {
      note("你举盾防御。");
    }
  } else if (action === "potion") {
    game.potions--;
    const restored = Math.min(16, hero.hp - player.life);
    player.life += restored;
    note(`治疗药剂恢复了 ${restored} 点生命。`);
    combatFx.emit("potion", restored);
    tone("potion");
  } else {
    player.energy--;
    const intent = enemyIntent(battle);
    const effect = skillEffect(hero, battle, intent);
    damageMultiplier = effect.multiplier;
    const style = { guard: "bash", scout: "thrust", mage: "ember" }[hero.id];
    attack(enemy, effect.damage, hero.skill, style);
    if (enemy.life && effect.armorBreak) {
      enemy.armor -= effect.armorBreak;
      note(`余火烧开了护甲，${enemy.name}失去 ${effect.armorBreak} 点护甲。`, true);
      combatFx.emit("armor", "破甲", 75);
    }
    if (enemy.life && effect.interruptRound) {
      battle.interruptRound = effect.interruptRound;
      battle.interruptPenalty = hero.interruptPenalty;
      note(`穿刺打断了${intent.name}，敌人改用仓促反击。`, true);
      combatFx.emit("interrupt", "打断", 75);
      tone("interrupt");
    }
  }
  if (!enemy.life) {
    game.battle = null;
    const recovery = player.energy < hero.focus ? "恢复了 1 点专注。" : "";
    player.energy = Math.min(hero.focus, player.energy + 1);
    note(`击败${enemy.name}。${recovery}`, true);
    if (enemy === game.enemies.at(-1)) note(game.mission.bossDefeated, true);
    tone("win");
    return;
  }
  retaliation(battle, damageMultiplier);
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
  if (!game || game.ended || modalOptions.length) return;
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
      else if (closedLampGate(tile(x, y), game.used)) describe("沉重的石门", `点亮大厅里的${cloisterRoutes[tile(x, y)].lamp}才能打开这扇门。`);
      else if (floodedAt(x, y)) describe("淹没的通道", "水没过了头顶。西侧泵房的闸轮可以排水。");
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
  updateCheckpoint();
}

function goal() {
  if (game.ended) return [game.player.life ? game.mission.successTitle : "远征结束", "返回灰鸦镇继续整备。"];
  if (game.mission.id === "cloister") {
    const route = cloisterRoute(game.used);
    if (!route) return ["选择一盏壁灯", "向北到双灯厅。余烬灯开西侧，寒银灯开东侧。"];
    if (game.enemies.at(-1).life) return ["击败缄默司钟人", `${route.lamp}已点亮。沿${route.passage}去唱经厅，留意「${route.heavyName}」。`];
    return ["敲响晨钟", "去唱经厅北端，面向钟架互动。"];
  }
  if (game.mission.id === "mine") {
    if (!game.used.has("drain")) return ["找到排水闸轮", "从入井栈道绕向西侧泵房，降低水位。"];
    if (game.enemies.at(-1).life) return ["击败沉钟矿监", "穿过已排水的北侧通道。矿监举起铁镐后，准备挡住重击。"];
    return ["敲响井铃", "继续向北，面向井铃互动。"];
  }
  if (!game.used.has("key")) return ["寻找黄铜钥匙", "沿墓道向北，在西侧墓室寻找守火人的遗匣。"];
  if (!game.used.has("riddle")) return ["解开三印石台", "找到通往东厅的路，留意遗匣里那张烧焦的纸。"];
  if (!game.door) return ["打开墓窟铁门", "用黄铜钥匙开启东厅北面的铁门。"];
  if (game.enemies.at(-1).life) return ["击败灰誓守陵者", "守陵者在铁门后的墓室。看到重斩预告时可以举盾。"];
  return ["触碰余烬封印", "朝墓室最北端前进，面向封印互动。"];
}

function areaName() {
  if (game.mission.id === "cloister") {
    if (game.y <= 4) return "唱经厅";
    if (game.y <= 7) return game.x < 7 ? cloisterRoutes.W.passage : cloisterRoutes.E.passage;
    return game.y <= 9 ? "双灯厅" : "寂静前庭";
  }
  if (game.mission.id === "mine") {
    if (game.y <= 4) return "北侧采掘厅";
    if (game.y <= 8 && game.x <= 3) return "西侧泵房";
    if (game.y <= 8 && game.x >= 11) return "东侧工具巷";
    return game.y >= 11 ? "入井栈道" : "旧轨道";
  }
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
  $("#sidequest").hidden = game.mission.id !== "mine" || camp.hasMineLedger();
  $("#sidequest-detail").textContent = game.used.has("ledger") ? "名册已拾取。完成本次远征后交给铁匠。" : "排水后搜索东侧工具巷的文书箱，带着名册完成远征。";
  $("#area").textContent = areaName();
  $("#compass").textContent = headings[game.facing];
  const { battle, player, hero } = game;
  $("#supplies").textContent = `药剂 ×${game.potions}${game.sword ? "　·　守火人之刃" : ""}`;
  $("#supplies").title = hero.equipment.map((item) => item.name).join(" / ");
  $("#step-count").textContent = `${game.steps} 步`;
  $("#encounter").hidden = !battle;
  $("#explore-actions").hidden = Boolean(battle);
  $("#battle-actions").hidden = !battle;
  $("#mode").textContent = battle ? `第 ${battle.round} 回合` : "探索";
  if (battle) {
    const { enemy } = battle;
    $("#enemy-name").textContent = enemy.name;
    $("#enemy-life").textContent = `${enemy.life} / ${enemy.hp}`;
    $(".enemy-meter i").style.width = `${enemy.life / enemy.hp * 100}%`;
    $("#enemy-armor").hidden = enemy.armor === undefined;
    $("#enemy-armor").textContent = enemy.armor ? `护甲 ${enemy.armor} · 减免物理伤害` : "护甲已破";
    const intent = enemyIntent(battle);
    const effect = skillEffect(hero, battle, intent);
    let bonus = "";
    if (effect.interruptRound) bonus = ` · 打断${intent.name}`;
    else if (effect.armorBreak) bonus = ` · 破甲 ${effect.armorBreak}`;
    else if (hero.heavyBlock && intent.damage) bonus = ` · 承伤 ${Math.ceil(intent.damage * effect.multiplier)}`;
    const skillPreview = player.energy ? `${hero.skill} ${effect.damage}${bonus}` : `${hero.skill}专注不足`;
    $("#mode-detail").textContent = `普攻 ${basicAttackDamage(hero, enemy)} · ${skillPreview}`;
    $("#prompt").dataset.intent = intent.kind;
    if (intent.kind === "charge") {
      $("#prompt").textContent = `蓄力 · 本回合不攻击 · 下回合${intent.name} ${intent.nextDamage} 伤害`;
    } else if (intent.kind === "staggered") {
      $("#prompt").textContent = `重击已打断 · 仓促反击 ${intent.damage} 伤害`;
    } else {
      $("#prompt").textContent = `${intent.name} ${intent.damage} 伤害 · 防御后承伤 ${Math.ceil(intent.damage / 3)}`;
    }
    $("[data-action=skill]").disabled = !player.energy;
    $("[data-action=potion]").disabled = !game.potions || player.life === hero.hp;
  } else {
    delete $("#prompt").dataset.intent;
    const [x, y] = ahead();
    const nearby = enemyAt(x, y) ?? landmarkAt(x, y) ?? landmarkAt(game.x, game.y);
    const gate = tile(x, y) === "D" && !game.door;
    const lampGate = closedLampGate(tile(x, y), game.used);
    $("#mode-detail").textContent = "朝向目标后互动";
    $("#prompt").textContent = game.ended ? "" : nearby ? `F · ${nearby.title ?? nearby.name}` :
      gate ? "F · 墓窟铁门" : lampGate ? "F · 沉重的石门" : floodedAt(x, y) ? "积水挡住了通道" : "";
  }
  $("#player-card").classList.toggle("active", Boolean(battle));
  $("#player-card").classList.toggle("fallen", !player.life);
  $("#player-life .stat-value").textContent = `${player.life}/${hero.hp}`;
  $("#player-focus .stat-value").textContent = `${player.energy}/${hero.focus}`;
  $("#player-life b").style.width = `${player.life / hero.hp * 100}%`;
  $("#player-focus b").style.width = `${player.energy / hero.focus * 100}%`;
  const firstFight = !game.enemies.some((enemy) => enemy.life === 0);
  let tip = "";
  if (!game.ended && battle && firstFight && battle.round <= 2) {
    tip = "看敌人的行动预告再选招。防御会减伤并恢复专注，药剂留到受伤后再用。";
  } else if (!game.ended && !battle && game.steps < 3) {
    tip = "沿着火光向前，朝向门、宝箱或机关后按 F 或点「互动」。任务进度见「当前目标」。";
  }
  $("#field-guide").hidden = !tip;
  $("#field-guide-copy").textContent = tip;
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
  const { layout } = game.mission;
  const size = 14;
  const left = 15;
  const top = 14;
  map.fillStyle = "#0e1510";
  map.fillRect(0, 0, 240, 224);
  for (let y = 0; y < layout.length; y++) {
    for (let x = 0; x < layout[y].length; x++) {
      const id = key(x, y);
      const seen = game.seen.has(id);
      map.fillStyle = !seen ? "#151d16" : floodedAt(x, y) ? "#396468" : wallAt(x, y) ? "#343d30" : game.visited.has(id) ? "#57624c" : "#3b4938";
      map.fillRect(left + x * size, top + y * size, size - 1, size - 1);
      if (!seen) continue;
      if (closedLampGate(tile(x, y), game.used)) map.fillStyle = tile(x, y) === "W" ? "#ca8453" : "#8ea9b4";
      else if (tile(x, y) === "D" && !game.door) map.fillStyle = "#d6a75c";
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

const soundCues = {
  // Delay, start pitch, end pitch, duration, waveform and peak gain.
  step: [[0, 75, 45, .065, "triangle", .05]],
  wall: [[0, 78, 50, .075, "square", .025]],
  hit: [[0, 105, 55, .105, "triangle", .10]],
  hurt: [[.045, 67, 39, .14, "sawtooth", .044]],
  encounter: [[0, 112, 62, .22, "triangle", .072]],
  heavy: [[.035, 91, 34, .23, "triangle", .125], [.06, 44, 31, .16, "square", .022]],
  charge: [[.1, 103, 156, .14, "triangle", .062], [.23, 150, 178, .17, "sine", .055]],
  interrupt: [[.06, 420, 132, .16, "triangle", .073]],
  potion: [[0, 318, 490, .13, "sine", .08], [.075, 440, 570, .15, "sine", .063]],
  mechanism: [[0, 126, 54, .2, "triangle", .088], [.12, 331, 180, .12, "square", .024]],
  recruit: [[0, 294, 293, .14, "sine", .063], [.105, 392, 392, .19, "sine", .073]],
  equip: [[0, 570, 284, .105, "triangle", .07], [.085, 780, 392, .17, "sine", .053]],
  depart: [[0, 147, 105, .18, "triangle", .06], [.14, 88, 51, .19, "sine", .072]],
  win: [[0, 365, 486, .19, "sine", .076], [.12, 482, 583, .2, "sine", .063]],
};

function tone(type) {
  if (!sound || audio.state !== "running") return;
  const now = audio.currentTime;
  for (const [delay, from, to, duration, wave, volume] of soundCues[type]) {
    const start = now + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(.001, start);
    gain.gain.linearRampToValueAtTime(volume, start + .008);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}

function showHelp() {
  if (!game || modalOptions.length) return;
  openModal("远征手册", "怎么进地窟", "W / ↑ 前进，S / ↓ 后退，A / D 横移。\nQ / ← 左转，E / → 右转，F / 空格互动。\n触屏可直接点移动、转向和互动按钮。\n\n战斗中用 1–4 行动。查看敌人预告和控制栏的伤害。盾击挡重击，穿刺打断蓄力，余火无视并削弱护甲。防御回复专注，药剂最多恢复 16 点生命。", [
    ["返回", () => closeModal()],
    ["重新开始", () => openModal("重置远征", "回到本关入口？", "本次远征的进度会清空。", [
      ["继续当前远征", () => closeModal()],
      ["重新开始", () => freshGame(game.mission, game.hero)],
    ])],
    ["保存并返回营地", () => {
      updateCheckpoint();
      showCamp("远征已暂停，可从原处继续。");
    }],
    ["结束远征", () => openModal("结束远征", "返回灰鸦镇？", "本次地牢探索进度会清空，并记录为撤退。", [
      ["继续远征", () => closeModal()],
      ["返回营地", () => {
        camp.settleExpedition(expeditionSave.capture(game), "retreat");
        showCamp();
      }],
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
    try {
      audio ??= new Audio();
      await audio.resume();
    } catch {
      return;
    }
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
  if (!game || event.altKey || event.ctrlKey || event.metaKey) return;
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
      if (kind === "stone" || kind === "cloister") {
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
        if (kind === "cloister") {
          const trim = x > 3 && x < 60 && (y === 12 || y === 51);
          const stone = base + grit + noise + (trim ? 20 : 5);
          color = [stone + 6 - moss, stone + 7, stone + 11 - moss];
        } else {
          color = [base + grit + noise + 7 - moss, base + grit + noise + 6, base + grit + noise - 4 - moss];
        }
      } else if (kind === "mine") {
        const ridge = (x + y * 2 + (hash(y >> 3, 4) % 6)) % 29;
        const fissure = (ridge < 2 && hash(x >> 4, y >> 3, 28) % 5 !== 0) || (y + (x >> 2)) % 21 === 0;
        const shelf = (hash(x >> 4, y >> 3, 13) % 22) - 11;
        const base = (fissure ? 34 : ridge < 4 ? 86 : 63 + shelf) + grit + noise;
        color = [base - 4, base + 5, base + 9];
      } else if (kind === "water") {
        const wave = (y + ((x >> 3) % 3)) % 16;
        const glint = wave < 2 && (hash(x >> 2, y >> 4, 17) % 4 !== 0);
        const base = (glint ? 96 : wave < 4 ? 65 : 46) + broad + (noise >> 1);
        color = [base >> 1, base + 13, base + 21];
      } else if (kind === "rail") {
        const rail = Math.min(Math.abs(x - 17), Math.abs(x - 46));
        const tie = x > 8 && x < 56 && y % 32 < 7;
        const base = 54 + broad + (noise >> 1);
        color = rail <= 2 ? [90 + noise, 85 + noise, 72 + noise] :
          rail === 3 ? [39, 35, 30] : tie ? [base + 11, base - 3, base - 11] : [base + 1, base + 5, base - 1];
      } else if (kind === "westGate" || kind === "eastGate") {
        const gap = x < 5 || x > 58 || y < 6 || y % 16 < 2;
        const rune = Math.abs(x - 32) + Math.abs(y - 33) < 10 && (x === 32 || y === 33 || Math.abs(x - 32) + Math.abs(y - 33) === 8);
        const base = (gap ? 29 : 65) + grit + noise;
        color = rune ? (kind === "westGate" ? [154, 99, 51] : [96, 136, 153]) : [base + 3, base + 2, base + 5];
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
const mineStone = makeTexture("mine");
const cloisterStone = makeTexture("cloister");
const iron = makeTexture("door");
const lampGateTextures = { W: makeTexture("westGate"), E: makeTexture("eastGate") };
const floor = makeTexture("floor");
const water = makeTexture("water");
const rails = makeTexture("rail");
const ceiling = makeTexture("ceiling");

function buildLightField({ layout, torches }) {
  return layout.map((row, y) => Array.from(row, (_, x) => {
    let light = 0;
    for (const [tx, ty] of torches) {
      light = Math.max(light, Math.max(0, 1 - Math.hypot(x + .5 - tx, y + .5 - ty) / 3.1));
    }
    return light;
  }));
}

function shaded(color, light, warmth) {
  const r = Math.min(255, (color & 255) * (light + warmth * .28) + 4);
  const g = Math.min(255, ((color >>> 8) & 255) * (light + warmth * .10) + 7);
  const b = Math.min(255, ((color >>> 16) & 255) * (light - warmth * .09) + 6);
  return ink(r, g, b);
}

function drawSurfaces(dx, dy, rx, ry, flicker, now) {
  const { lightField, mission } = game;
  const inMine = mission.id === "mine";
  const waterVisible = inMine && !game.used.has("drain");
  const ripple = Math.floor(now / 145) & 63;
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
      const ground = under && inMine ? mission.layout[gy]?.[gx] : null;
      if (waterVisible && ground === "~") {
        pixelData[y * width + x] = shaded(water[((ty + ripple) & 63) * 64 + tx], light + attenuation * .23, 0);
      } else {
        const texture = ground === "r" ? rails : source;
        pixelData[y * width + x] = shaded(texture[ty * 64 + tx], light, torch * attenuation);
      }
      fx += stepX;
      fy += stepY;
    }
  }
}

function drawWalls(dx, dy, rx, ry, flicker) {
  const wallTexture = game.mission.id === "mine" ? mineStone : game.mission.id === "cloister" ? cloisterStone : stone;
  const { lightField } = game;
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
    } while (!wallAt(gx, gy));
    depth = Math.max(.03, depth);
    depths[x] = depth;
    const wall = tile(gx, gy);
    const source = wall === "D" ? iron : lampGateTextures[wall] ?? wallTexture;
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

function buildEnemy(armored, miner = false) {
  return sprite(108, 143, (p) => {
    const draw = (color, points) => polygon(p, color, points);
    const metal = miner ? "#627273" : armored ? "#70634f" : "#8c8872";
    const edge = miner ? "#90a1a0" : armored ? "#a78b61" : "#beb496";
    const shade = miner ? "#394848" : armored ? "#4b4437" : "#4e5146";
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
    if (miner) {
      draw("#513a29", [[87, 113], [91, 50], [97, 51], [94, 116]]);
      draw("#aa8860", [[88, 109], [92, 53], [94, 54], [90, 109]]);
      draw("#282b27", [[71, 56], [79, 44], [93, 41], [103, 46], [107, 55], [95, 52], [85, 53]]);
      draw("#98a29b", [[73, 53], [81, 46], [93, 43], [102, 47], [93, 46], [83, 49]]);
    } else {
      draw("#635341", [[89, 86], [83, 71], [85, 67], [101, 74], [100, 79], [95, 80]]);
      draw("#b4aa89", [[90, 78], [98, 80], [98, 109], [93, 134], [87, 114]]);
      draw("#665f52", [[93, 82], [96, 83], [96, 107], [93, 128]]);
      if (armored) draw("#c17946", [[88, 96], [90, 102], [93, 96], [95, 99], [94, 111], [91, 119], [87, 113]]);
    }
    if (armored) {
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
    if (miner) {
      p.fillStyle = "#a77647";
      p.fillRect(49, 13, 12, 8);
      p.fillStyle = "#ffe3a2";
      p.fillRect(52, 14, 6, 5);
    }
    for (let i = 0; i < 50; i++) {
      const x = 38 + hash(i, 2, 8) % 32;
      const y = 42 + hash(i, 1, 6) % 36;
      p.fillStyle = i % 2 ? "#d9cf9c26" : "#10181030";
      p.fillRect(x, y, 1 + i % 2, 1);
    }
  });
}

function buildPortrait(id) {
  const palettes = {
    guard: ["#42483d", "#879084", "#b1b49a", "#665a45", "#b68c66"],
    scout: ["#34483a", "#587256", "#7f9567", "#665449", "#ba9876"],
    mage: ["#413952", "#69627d", "#9687a2", "#5a4847", "#bda28e"],
  };
  const [shadow, cloth, trim, skinShadow, skin] = palettes[id];
  const portrait = sprite(32, 42, (p) => {
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
    if (id === "guard") {
      polygon(p, trim, [[9, 10], [14, 6], [21, 7], [24, 13], [22, 17], [14, 17], [12, 22], [9, 20]]);
      p.fillStyle = shadow;
      p.fillRect(13, 15, 10, 2);
    } else if (id === "mage") {
      polygon(p, trim, [[4, 16], [9, 13], [16, 2], [23, 6], [21, 12], [28, 15], [27, 17], [18, 14], [10, 17]]);
      polygon(p, "#bbb49e", [[12, 20], [17, 25], [21, 22], [20, 29], [16, 34], [13, 29]]);
    }
  });
  portrait.className = "portrait";
  portrait.setAttribute("aria-hidden", "true");
  return portrait;
}

function initArt() {
  drawables.torch = buildTorches();
  drawables.chest = buildChest();
  drawables.altar = buildAltar();
  drawables.portal = buildPortal();
  drawables.skeleton = buildEnemy(false);
  drawables.warden = buildEnemy(true);
  drawables.miner = buildEnemy(true, true);
  drawables.cantor = sprite(108, 143, (p) => {
    polygon(p, "#201e26", [[19, 131], [30, 82], [21, 76], [25, 46], [42, 36], [37, 22], [53, 4], [65, 13], [74, 35], [91, 52], [93, 78], [82, 83], [88, 130]]);
    polygon(p, "#494454", [[27, 124], [37, 73], [29, 62], [32, 48], [48, 39], [62, 40], [78, 49], [84, 64], [73, 77], [80, 123], [61, 133], [38, 132]]);
    polygon(p, "#666177", [[35, 50], [49, 41], [56, 47], [49, 58], [47, 90], [36, 122], [31, 120], [42, 72]]);
    polygon(p, "#36343f", [[61, 46], [75, 50], [81, 60], [71, 75], [75, 104], [80, 123], [60, 131], [64, 103], [60, 75]]);
    polygon(p, "#7a6b55", [[49, 45], [61, 45], [64, 64], [60, 112], [54, 126], [49, 110], [52, 65]]);
    polygon(p, "#4c4350", [[39, 27], [49, 15], [54, 8], [64, 18], [70, 35], [61, 43], [45, 40]]);
    polygon(p, "#b2a187", [[44, 27], [52, 20], [62, 23], [65, 31], [60, 39], [48, 37]]);
    polygon(p, "#746b67", [[60, 23], [65, 31], [60, 39], [54, 38], [58, 32]]);
    p.fillStyle = "#32252a";
    p.fillRect(48, 28, 5, 2);
    p.fillRect(58, 29, 4, 2);
    p.fillRect(51, 35, 8, 2);
    p.fillStyle = "#c7af71";
    p.fillRect(53, 51, 6, 7);
    p.fillRect(51, 72, 10, 3);
    polygon(p, "#5b5253", [[24, 48], [31, 52], [30, 66], [44, 73], [41, 81], [23, 76], [20, 67]]);
    polygon(p, "#51464c", [[79, 50], [89, 55], [92, 71], [86, 80], [77, 75], [83, 65]]);
    polygon(p, "#5b4435", [[77, 113], [91, 35], [96, 36], [84, 116]]);
    polygon(p, "#a08056", [[80, 109], [92, 38], [94, 39], [82, 112]]);
    polygon(p, "#af8e53", [[86, 35], [86, 24], [90, 18], [98, 19], [102, 26], [102, 36], [107, 40], [105, 44], [82, 43], [81, 40]]);
    polygon(p, "#dec08a", [[89, 26], [92, 21], [98, 22], [99, 26], [99, 35], [101, 39], [87, 38], [90, 34]]);
    p.fillStyle = "#88734e";
    p.fillRect(91, 44, 5, 4);
  });
  for (const [id, color] of Object.entries({ lamp: null, westLamp: "#f29a53", eastLamp: "#93c7df" })) {
    drawables[id] = sprite(56, 98, (p) => {
      polygon(p, "#272831", [[8, 88], [13, 82], [20, 79], [22, 42], [16, 38], [16, 33], [40, 33], [40, 39], [34, 42], [36, 79], [43, 82], [49, 88], [47, 93], [10, 93]]);
      p.fillStyle = "#766e66";
      p.fillRect(16, 36, 22, 3);
      p.fillRect(22, 43, 4, 37);
      p.fillRect(13, 85, 31, 3);
      if (!color) return;
      polygon(p, color, [[19, 33], [18, 25], [23, 18], [23, 12], [27, 17], [32, 5], [37, 17], [37, 24], [40, 30], [34, 34]]);
      polygon(p, "#fff3cb", [[24, 32], [25, 26], [30, 19], [32, 15], [35, 25], [35, 30], [31, 33]]);
    });
  }
  drawables.ledger = sprite(66, 50, (p) => {
    polygon(p, "#241c16", [[7, 25], [12, 17], [42, 13], [58, 23], [60, 40], [50, 45], [9, 42]]);
    polygon(p, "#63523e", [[9, 26], [15, 19], [42, 16], [55, 24], [51, 31], [12, 33]]);
    polygon(p, "#54422f", [[12, 34], [51, 32], [55, 26], [56, 39], [50, 42], [12, 40]]);
    polygon(p, "#a58d5e", [[24, 23], [32, 18], [44, 19], [48, 24], [40, 28], [26, 28]]);
    p.fillStyle = "#d4be82";
    p.fillRect(29, 22, 11, 2);
    p.fillStyle = "#715739";
    p.fillRect(31, 22, 2, 2);
    p.fillRect(31, 33, 7, 5);
  });
  drawables.valve = sprite(72, 84, (p) => {
    polygon(p, "#202d29", [[18, 76], [18, 65], [33, 61], [33, 28], [41, 28], [41, 61], [55, 65], [55, 76]]);
    polygon(p, "#514639", [[17, 19], [26, 8], [47, 8], [57, 19], [57, 40], [46, 51], [26, 51], [17, 40]]);
    polygon(p, "#a07a49", [[20, 20], [28, 11], [46, 11], [54, 20], [54, 38], [46, 47], [28, 47], [20, 38]]);
    polygon(p, "#303a32", [[25, 22], [31, 16], [43, 16], [49, 22], [49, 36], [43, 42], [31, 42], [25, 36]]);
    p.fillStyle = "#ba9158";
    p.fillRect(25, 27, 24, 4);
    p.fillRect(35, 16, 4, 26);
    p.fillStyle = "#e0b472";
    p.fillRect(34, 26, 7, 6);
  });
  drawables.bell = sprite(76, 113, (p) => {
    polygon(p, "#302921", [[8, 105], [8, 18], [18, 8], [59, 8], [68, 18], [68, 105], [59, 105], [59, 22], [17, 22], [17, 105]]);
    p.fillStyle = "#74654a";
    p.fillRect(10, 22, 4, 80);
    p.fillRect(18, 10, 40, 4);
    polygon(p, "#a48145", [[30, 22], [45, 22], [50, 30], [52, 55], [58, 66], [56, 72], [20, 72], [18, 66], [24, 55], [27, 30]]);
    polygon(p, "#d1a462", [[32, 24], [42, 24], [44, 30], [44, 52], [49, 63], [25, 63], [29, 53], [29, 31]]);
    p.fillStyle = "#382b20";
    p.fillRect(20, 67, 36, 4);
    p.fillStyle = "#c49a58";
    p.fillRect(34, 72, 7, 6);
  });
  drawables.plaque = sprite(45, 55, (p) => {
    polygon(p, "#313a30", [[4, 6], [36, 2], [42, 7], [39, 48], [9, 51], [3, 42]]);
    polygon(p, "#6d735e", [[7, 8], [36, 5], [37, 42], [9, 46]]);
    polygon(p, "#363b31", [[18, 6], [21, 20], [17, 27], [23, 34], [21, 45], [26, 35], [20, 27], [25, 21], [22, 6]]);
  });
}

function drawObjects(dx, dy, rx, ry, now) {
  const { landmarks, torches } = game.mission;
  const items = [
    ...game.enemies.flatMap((enemy) => {
      const pose = combatFx.pose(enemy, now);
      if (!enemy.life && !pose) return [];
      return [{ image: drawables[enemy.art], x: enemy.x + .5, y: enemy.y + .5,
        size: enemy.art === "skeleton" ? .76 : .88, lift: 0, pose }];
    }),
    ...landmarks.filter(availableLandmark).map((item) => ({
      image: drawables[item.art === "lamp" && game.used.has(item.type) ? item.type : item.art], x: item.x + .5, y: item.y + .5,
      size: { chest: .31, ledger: .34, altar: .61, portal: .98, plaque: .45, valve: .65, bell: .87, lamp: .68 }[item.art], lift: 0,
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
  for (const { image, depth, offset, size, lift, pose } of visible) {
    const scale = focal / depth;
    const spriteHeight = scale * size;
    const spriteWidth = spriteHeight * image.width / image.height;
    const left = width / 2 + offset * scale - spriteWidth / 2 + (pose?.x ?? 0);
    const top = height / 2 + (.51 - lift) * scale - spriteHeight + (pose?.y ?? 0);
    ctx.globalAlpha = clamp(1.18 - depth * .083, .28, 1) * (pose?.alpha ?? 1);
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
  if (!game) return;
  const hasEffects = combatFx.active(now);
  if (!motion && !hasEffects && now - lastFrame < 74) return;
  lastFrame = now;
  if (motion) {
    const progress = clamp((now - motion.start) / 135, 0, 1);
    const ease = 1 - (1 - progress) ** 2;
    camera.x = motion.from.x + (motion.x - motion.from.x) * ease;
    camera.y = motion.from.y + (motion.y - motion.from.y) * ease;
    camera.angle = motion.from.angle + motion.turn * ease;
    if (progress === 1) motion = null;
  }
  const renderAngle = camera.angle + combatFx.cameraKick(now);
  const dx = Math.cos(renderAngle);
  const dy = Math.sin(renderAngle);
  const flicker = .98 + Math.sin(now / 110) * .08 + Math.cos(now / 241) * .04;
  drawSurfaces(dx, dy, -dy, dx, flicker, now);
  drawWalls(dx, dy, -dy, dx, flicker);
  ctx.putImageData(pixels, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawObjects(dx, dy, -dy, dx, now);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  if (hasEffects) combatFx.draw(ctx, now, width, height);
}

initArt();
camp.init(buildPortrait, freshGame, enterExpedition, tone);
showCamp();
requestAnimationFrame(frame);
