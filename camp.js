"use strict";

const camp = (() => {
  const heroes = {
    guard: { name: "赫岚", role: "盾卫", hp: 40, focus: 3, attack: 7, skill: "盾击", power: 10, heavyBlock: 60, price: 0 },
    scout: { name: "苔鸦", role: "斥候", hp: 36, focus: 3, attack: 8, skill: "穿刺", power: 13, interruptPenalty: 0, price: 30 },
    mage: { name: "墨灯", role: "咒师", hp: 34, focus: 4, attack: 6, skill: "余火", power: 15, armorBreak: 2, price: 40 },
  };
  const gear = {
    blade: { name: "淬火短刃", slot: "weapon", icon: 0, stat: "attack", bonus: 2, price: 35 },
    pick: { name: "矿工短镐", slot: "weapon", icon: 6, stat: "pierce", bonus: 3, effect: "普攻无视最多 3 点护甲", price: 30 },
    coat: { name: "锁环软甲", slot: "armor", icon: 1, stat: "hp", bonus: 8, price: 45 },
    charm: { name: "灰晶护符", slot: "trinket", icon: 2, stat: "focus", bonus: 1, price: 25 },
    shieldClasp: { name: "磐铁盾扣", slot: "technique", icon: 3, hero: "guard", stat: "heavyBlock", bonus: 20, effect: "盾击抵挡重击时额外减免 20 个百分点", price: 40 },
    snare: { name: "绊索扣", slot: "technique", icon: 4, hero: "scout", stat: "interruptPenalty", bonus: 3, effect: "成功打断后，敌人改用的反击再减少 3 伤害", price: 35 },
    ember: { name: "裂纹炭晶", slot: "technique", icon: 5, hero: "mage", stat: "armorBreak", bonus: 1, effect: "余火额外削掉 1 点护甲", price: 35 },
  };
  const statNames = { attack: "攻击", hp: "生命", focus: "专注", heavyBlock: "盾击重击减免", interruptPenalty: "打断后减伤", armorBreak: "余火破甲", pierce: "普攻穿甲" };
  const slotNames = { weapon: "武器", armor: "护甲", trinket: "饰品", technique: "战技配件" };
  const storageKey = "ashen-vault.camp";
  const get = (id) => document.getElementById(id);
  let saveAvailable = true;
  let savedText = null;
  const state = load();
  let screen = "town";
  let returnFocus = "camp-tavern";
  let recipient = state.selected;
  let portraitFor;
  let playCue;

  function isUnlocked(mission, cleared = state.cleared) {
    return !mission.requires || cleared.includes(mission.requires);
  }

  function gearAllowed(id, heroId, mineLedger) {
    if (typeof id !== "string" || !Object.hasOwn(gear, id) || (id === "pick" && !mineLedger)) return false;
    return !gear[id].hero || gear[id].hero === heroId;
  }

  function readLoadout(raw, heroId, mineLedger) {
    const loadout = {};
    for (const slot of Object.keys(slotNames)) {
      const id = raw?.[slot];
      if (gearAllowed(id, heroId, mineLedger) && gear[id].slot === slot) loadout[slot] = id;
    }
    return loadout;
  }

  function load() {
    const initial = { version: 4, gold: 100, selected: "guard", roster: { guard: {} }, inventory: { guard: [] }, mission: "vault", cleared: [], mineLedger: false, expedition: null, report: null };
    try {
      savedText = localStorage.getItem(storageKey);
    } catch {
      saveAvailable = false;
      return initial;
    }
    let saved;
    try {
      saved = JSON.parse(savedText);
    } catch {
      return initial;
    }
    if (![1, 2, 3, 4].includes(saved?.version) || !Number.isSafeInteger(saved.gold) || saved.gold < 0) return initial;
    initial.gold = saved.gold;
    initial.mineLedger = saved.version === 4 && saved.mineLedger === true &&
      Array.isArray(saved.cleared) && saved.cleared.includes("vault") && saved.cleared.includes("mine");
    for (const id of Object.keys(heroes)) {
      const items = saved.roster?.[id];
      if (!items || typeof items !== "object") continue;
      const loadout = readLoadout(items, id, initial.mineLedger);
      const owned = saved.version === 4 ? saved.inventory?.[id] : null;
      const extras = Array.isArray(owned) ? owned.filter((item) => gearAllowed(item, id, initial.mineLedger)) : [];
      initial.roster[id] = loadout;
      initial.inventory[id] = [...new Set([...extras, ...Object.values(loadout)])];
    }
    if (typeof saved.selected === "string" && Object.hasOwn(initial.roster, saved.selected)) initial.selected = saved.selected;
    if (saved.version >= 2 && Array.isArray(saved.cleared)) {
      for (const mission of Object.values(missions)) {
        if (saved.cleared.includes(mission.id) && isUnlocked(mission, initial.cleared)) initial.cleared.push(mission.id);
      }
      if (typeof saved.mission === "string" && Object.hasOwn(missions, saved.mission) && isUnlocked(missions[saved.mission], initial.cleared)) {
        initial.mission = saved.mission;
      }
    }
    if (saved.version >= 3) {
      const active = saved.expedition;
      if (typeof active?.mission === "string" && Object.hasOwn(missions, active.mission) &&
          typeof active.hero === "string" && Object.hasOwn(initial.roster, active.hero) &&
          isUnlocked(missions[active.mission], initial.cleared)) {
        const restored = restoreExpedition(active, initial.mineLedger);
        if (restored) initial.expedition = expeditionSave.capture(restored);
      }
      initial.report = readReport(saved.report);
    }
    return initial;
  }

  function save() {
    try {
      if (localStorage.getItem(storageKey) !== savedText) {
        location.reload();
        return false;
      }
      const next = JSON.stringify(state);
      if (next !== savedText) localStorage.setItem(storageKey, next);
      savedText = next;
      saveAvailable = true;
    } catch {
      saveAvailable = false;
    }
    return saveAvailable;
  }

  function profile(id = state.selected, loadout = state.roster[id]) {
    const hero = { ...heroes[id], id, pierce: 0, loadout: { ...loadout } };
    hero.equipment = Object.values(loadout).map((itemId) => gear[itemId]);
    for (const item of hero.equipment) hero[item.stat] += item.bonus;
    return hero;
  }

  function restoreExpedition(active, mineLedger = state.mineLedger) {
    return expeditionSave.restore(active, missions[active.mission], profile(active.hero, readLoadout(active.loadout, active.hero, mineLedger)));
  }

  function saveExpedition(snapshot) {
    state.expedition = snapshot;
    return save();
  }

  function readReport(raw) {
    if (typeof raw?.mission !== "string" || !Object.hasOwn(missions, raw.mission) ||
        typeof raw.hero !== "string" || !Object.hasOwn(heroes, raw.hero) ||
        !["won", "lost", "retreat"].includes(raw.outcome)) return null;
    const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
    return {
      mission: raw.mission, hero: raw.hero, outcome: raw.outcome,
      reward: count(raw.reward), explored: count(raw.explored), kills: count(raw.kills),
      found: Array.isArray(raw.found) ? ["key", "cache", "westCache", "secret", "drain", "ledger", "westLamp", "eastLamp"].filter((item) => raw.found.includes(item)) : [],
      unlocked: typeof raw.unlocked === "string" && Object.hasOwn(missions, raw.unlocked) ? raw.unlocked : null,
      pending: raw.pending === true,
      pickUnlocked: raw.pickUnlocked === true,
    };
  }

  function announce(message = "") {
    const storageNote = saveAvailable ? "" : "浏览器无法写入存档，当前进度仅保留在此页面。";
    get("camp-status").textContent = [message, storageNote].filter(Boolean).join(" ");
  }

  function renderRoster() {
    const options = Object.keys(state.roster).map((id) => {
      const hero = heroes[id];
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "hero";
      input.value = id;
      input.checked = id === state.selected;
      input.addEventListener("change", () => {
        state.selected = id;
        save();
        renderProfile();
        announce(`已选择${hero.name}出征。`);
      });
      const role = document.createElement("small");
      role.textContent = hero.role;
      const name = document.createElement("span");
      name.append(hero.name, role);
      label.append(input, portraitFor(id), name);
      return label;
    });
    get("hero-options").replaceChildren(...options);
    get("roster-count").textContent = `${options.length} 名英雄`;
    renderProfile();
  }

  function skillDescription(hero) {
    const damage = `${hero.skill} ${hero.power} 伤害`;
    if (hero.heavyBlock) return `${damage} · 挡下 ${hero.heavyBlock}% 重击伤害`;
    if (hero.armorBreak) return `${damage} · 无视护甲并削弱 ${hero.armorBreak} 点`;
    return `${damage} · 打断蓄力或重击`;
  }

  function renderProfile() {
    const hero = profile();
    const stats = document.createElement("p");
    stats.className = "camp-hero-stats";
    for (const [label, value] of [["生命", hero.hp], ["攻击", hero.attack], ["专注", hero.focus]]) {
      const stat = document.createElement("span");
      stat.textContent = `${label} ${value}`;
      stats.append(stat);
    }
    if (hero.pierce) {
      const pierce = document.createElement("span");
      pierce.textContent = `普攻穿甲 ${hero.pierce}`;
      stats.append(pierce);
    }
    const skill = document.createElement("p");
    skill.className = "camp-hero-gear";
    skill.textContent = skillDescription(hero);
    const equipment = document.createElement("p");
    equipment.className = "camp-hero-gear";
    const names = Object.entries(slotNames).map(([slot, label]) => {
      return gear[state.roster[hero.id][slot]]?.name ?? `无${label}`;
    });
    equipment.textContent = names.join(" / ");
    get("hero-detail").replaceChildren(stats, skill, equipment);
    get("prepare-hero").textContent = `${hero.name} · ${hero.role} · 生命 ${hero.hp} / 攻击 ${hero.attack} / 专注 ${hero.focus}`;
    get("prepare-equipment").textContent = `装备：${names.join(" / ")}${hero.pierce ? ` · 普攻穿甲 ${hero.pierce}` : ""}`;
  }

  function stockRow(art, name, description, button, comparison) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    const title = document.createElement("h4");
    const copy = document.createElement("p");
    title.textContent = name;
    copy.textContent = description;
    info.append(title, copy);
    if (comparison) {
      const change = document.createElement("p");
      change.className = "shop-comparison";
      change.textContent = comparison;
      info.append(change);
    }
    li.append(art, info, button);
    return li;
  }

  function renderTavern() {
    const rows = Object.entries(heroes).filter(([, hero]) => hero.price).map(([id, hero]) => {
      const button = document.createElement("button");
      const hired = Object.hasOwn(state.roster, id);
      button.textContent = hired ? "已入册" : state.gold < hero.price ? `缺 ${hero.price - state.gold} 金` : `招募 · ${hero.price} 金`;
      button.disabled = hired || state.gold < hero.price;
      button.setAttribute("aria-label", hired ? `${hero.name}已入册` : `招募${hero.name}，${hero.price} 金币`);
      button.addEventListener("click", () => {
        if (Object.hasOwn(state.roster, id) || state.gold < hero.price) return;
        state.gold -= hero.price;
        state.roster[id] = {};
        state.inventory[id] = [];
        state.selected = id;
        save();
        playCue("recruit");
        renderRoster();
        renderFacility();
        get("hero-options").querySelector(":checked").focus({ preventScroll: true });
        announce(`${hero.name}已加入名册，可以独自出征。`);
      });
      return stockRow(portraitFor(id), `${hero.name} · ${hero.role}`, `生命 ${hero.hp}　攻击 ${hero.attack}　${skillDescription(hero)}`, button);
    });
    get("camp-stock").replaceChildren(...rows);
  }

  function renderShop() {
    const heroId = recipient;
    const target = state.roster[heroId];
    const hero = profile(heroId);
    const owned = state.inventory[heroId];
    const rows = Object.entries(gear).filter(([id]) => gearAllowed(id, heroId, state.mineLedger)).map(([id, item]) => {
      const art = document.createElement("span");
      art.className = "camp-stock-icon";
      art.style.setProperty("--gear-icon", `${item.icon * 100 / 6}%`);
      art.setAttribute("aria-hidden", "true");
      const button = document.createElement("button");
      const equipped = target[item.slot] === id;
      const hasItem = owned.includes(id);
      button.textContent = equipped ? "已装备" : hasItem ? "装备" : state.gold < item.price ? `缺 ${item.price - state.gold} 金` : `购买 · ${item.price} 金`;
      button.disabled = equipped || (!hasItem && state.gold < item.price);
      button.setAttribute("aria-label", equipped ? `已装备${item.name}` : hasItem ? `装备${item.name}` : `购买${item.name}，${item.price} 金币`);
      button.addEventListener("click", () => {
        if (target[item.slot] === id) return;
        if (!owned.includes(id)) {
          if (state.gold < item.price) return;
          state.gold -= item.price;
          owned.push(id);
        }
        target[item.slot] = id;
        save();
        playCue("equip");
        renderProfile();
        renderFacility();
        get("shop-hero").focus({ preventScroll: true });
        announce(`${heroes[heroId].name}已装备${item.name}。`);
      });
      const slot = slotNames[item.slot];
      const next = profile(heroId, { ...target, [item.slot]: id });
      const stats = item.slot === "weapon" && state.mineLedger ? ["attack", "pierce"] : [item.stat];
      const comparison = stats.map((stat) => {
        const unit = stat === "heavyBlock" ? "%" : "";
        const values = equipped ? `${hero[stat]}${unit}（当前）` : `${hero[stat]}${unit} → ${next[stat]}${unit}`;
        return `${statNames[stat]} ${values}`;
      }).join(" · ");
      const description = item.effect ? `${slot} · ${item.effect}` : slot;
      return stockRow(art, item.name, description, button, comparison);
    });
    get("camp-stock").replaceChildren(...rows);
  }

  function renderFacility() {
    const inShop = screen === "shop";
    get("camp-gold").textContent = state.gold;
    get("camp-facility").dataset.place = screen;
    get("facility-kicker").textContent = inShop ? "Ⅱ / THE FORGE" : "Ⅰ / THE TAVERN";
    get("facility-title").textContent = inShop ? "余火铁匠铺" : "断杯酒馆";
    const shopIntro = state.expedition ? "暂停中的远征会沿用出发时的装备。换装会在下次出征生效。" : "先选英雄，再比较属性。买下后立即装备，已拥有的物品可免费换装。";
    get("facility-intro").textContent = inShop ? shopIntro : "酒馆里的佣兵愿意为金币下墓。招募后可在名册里选择出征的人。";
    get("shop-recipient").hidden = !inShop;
    if (inShop) {
      get("shop-hero").replaceChildren(...Object.keys(state.roster).map((id) =>
        new Option(heroes[id].name, id, false, id === recipient)
      ));
      renderShop();
    } else {
      renderTavern();
    }
  }

  function renderContract() {
    const mission = missions[state.mission];
    get("prepare-title").textContent = mission.title;
    get("prepare-contract").textContent = `${mission.chapter} · ${mission.contract}`;
    get("prepare-sidequest").hidden = mission.id !== "mine";
    get("prepare-sidequest").textContent = state.mineLedger ? "支线已完成 · 找回矿工名册" : "可选支线 · 在东侧工具巷找回矿工名册";
    const cleared = state.cleared.includes(mission.id);
    get("prepare-reward").textContent = cleared ? `重访报酬 ${mission.repeatReward} 金币` : `首次通关 ${mission.firstReward} 金币`;
  }

  function renderMissions() {
    const choices = Object.values(missions).map((mission) => {
      const label = document.createElement("label");
      label.className = `route-marker route-choice route-${mission.id}`;
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "mission";
      input.value = mission.id;
      input.checked = mission.id === state.mission;
      input.disabled = !isUnlocked(mission);
      input.addEventListener("change", () => {
        state.mission = mission.id;
        save();
        renderContract();
      });
      const name = document.createElement("strong");
      name.textContent = mission.title;
      const status = document.createElement("small");
      status.textContent = input.disabled ? `通关${mission.requires === "vault" ? "墓窟" : "矿井"}后解锁` :
        state.cleared.includes(mission.id) ? "已通关" : "可出征";
      label.append(input, name, status);
      return label;
    });
    get("mission-options").replaceChildren(...choices);
    renderContract();
  }

  function renderReport() {
    const report = state.report;
    const mission = missions[report.mission];
    get("report-title").textContent = { won: "远征告捷", lost: "远征失利", retreat: "撤回营地" }[report.outcome];
    get("report-subtitle").textContent = `${heroes[report.hero].name} · ${mission.title}`;
    get("report-gold").textContent = `${report.reward} 金币`;
    get("report-explored").textContent = `${report.explored} 格`;
    get("report-kills").textContent = `${report.kills} 名`;
    const discoveries = {
      key: "守火人的遗匣：黄铜钥匙、治疗药剂 ×1",
      cache: "补给箱：治疗药剂 ×2",
      westCache: "抄经台补给匣：治疗药剂 ×1",
      secret: "暗格：守火人之刃（本次远征）",
      drain: "排水闸轮：抽干了矿井积水",
      ledger: report.outcome === "won" ? "矿工名册已交给铁匠" : "找到矿工名册（远征未完成）",
      westLamp: "点亮余烬壁灯，打开西侧抄经廊",
      eastLamp: "点亮寒银壁灯，打开东侧回声廊",
    };
    const items = report.found.length ? report.found.map((item) => discoveries[item]) : ["此次远征没有额外发现。"];
    get("report-loot").replaceChildren(...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }));
    const unlocks = [];
    if (report.pickUnlocked) unlocks.push("支线完成 · 矿工短镐已入库，可到铁匠铺换装");
    if (report.unlocked) unlocks.push(`新委托已开放 · ${missions[report.unlocked].title}`);
    get("report-unlock").hidden = !unlocks.length;
    get("report-unlock").textContent = unlocks.join("。");
    const ending = report.outcome === "won" && mission.ending;
    get("report-ending").hidden = !ending;
    get("report-ending-copy").textContent = ending || "";
  }

  function setScreen(next) {
    if (screen === "report" && next !== "report" && state.report?.pending) {
      state.report.pending = false;
      save();
    }
    screen = next;
    const atTown = screen === "town";
    const preparing = screen === "prepare";
    const reporting = screen === "report";
    get("camp-town").hidden = !atTown;
    get("camp-facility").hidden = screen !== "shop" && screen !== "tavern";
    get("camp-prepare").hidden = !preparing;
    get("camp-report").hidden = !reporting;
    get("camp-back").hidden = atTown;
    get("camp-last-report").hidden = !atTown || !state.report;
    const active = state.expedition;
    get("camp-depart").textContent = active ? "继续远征 →" : preparing ? "进入地牢 →" : "出征 →";
    get("camp-abandon").hidden = !active;
    get("camp-checkpoint").hidden = !active;
    get("camp-checkpoint").textContent = active ? `${heroes[active.hero].name} · ${missions[active.mission].title} · 生命 ${active.life}` : "";
    if (preparing) renderMissions();
    if (reporting) renderReport();
    if (screen === "shop" || screen === "tavern") renderFacility();
  }

  function backToTown() {
    setScreen("town");
    get(returnFocus).focus();
  }

  function show(message) {
    setScreen(state.report?.pending ? "report" : "town");
    get("camp-gold").textContent = state.gold;
    renderRoster();
    announce(message);
  }

  function init(makePortrait, depart, resume, cue) {
    portraitFor = makePortrait;
    playCue = cue;
    for (const place of ["tavern", "shop"]) {
      get(`camp-${place}`).addEventListener("click", () => {
        recipient = state.selected;
        returnFocus = `camp-${place}`;
        setScreen(place);
        get("facility-title").focus();
      });
    }
    get("camp-back").addEventListener("click", backToTown);
    get("camp-last-report").addEventListener("click", () => {
      returnFocus = "camp-last-report";
      setScreen("report");
      get("report-title").focus();
    });
    const abandonDialog = get("camp-abandon-dialog");
    get("camp-abandon").addEventListener("click", () => {
      abandonDialog.returnValue = "";
      abandonDialog.showModal();
    });
    abandonDialog.addEventListener("close", () => {
      if (abandonDialog.returnValue !== "abandon" || !state.expedition) return;
      settleExpedition(state.expedition, "retreat");
      show();
      get("report-title").focus();
    });
    get("camp").addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !abandonDialog.open && screen !== "town" && !event.defaultPrevented) backToTown();
    });
    get("shop-hero").addEventListener("change", (event) => {
      recipient = event.target.value;
      renderShop();
      announce(`装备归属已切换为${heroes[recipient].name}。`);
    });
    get("camp-depart").addEventListener("click", () => {
      if (state.expedition) {
        const restored = restoreExpedition(state.expedition);
        if (restored) resume(restored);
      } else if (screen === "prepare") {
        const mission = missions[state.mission];
        if (isUnlocked(mission)) depart(mission);
      } else {
        returnFocus = "camp-depart";
        setScreen("prepare");
        get("prepare-title").focus();
      }
    });
  }

  function settleExpedition(snapshot, outcome) {
    if (state.expedition?.id !== snapshot.id) return null;
    const mission = missions[snapshot.mission];
    let reward = 0;
    let unlocked = null;
    let pickUnlocked = false;
    if (outcome === "won") {
      const firstClear = !state.cleared.includes(mission.id);
      reward = firstClear ? mission.firstReward : mission.repeatReward;
      if (firstClear) {
        state.cleared.push(mission.id);
        unlocked = Object.values(missions).find((next) => next.requires === mission.id)?.id ?? null;
        if (unlocked) state.mission = unlocked;
      }
      state.gold = Math.min(state.gold + reward, Number.MAX_SAFE_INTEGER);
      if (mission.id === "mine" && snapshot.used.includes("ledger") && !state.mineLedger) {
        state.mineLedger = true;
        state.inventory[snapshot.hero].push("pick");
        pickUnlocked = true;
      }
    }
    state.expedition = null;
    state.report = readReport({
      mission: mission.id, hero: snapshot.hero, outcome, reward, unlocked, pickUnlocked, pending: true,
      explored: snapshot.visited.length, kills: snapshot.enemies.filter((enemy) => !enemy.life).length, found: snapshot.used,
    });
    save();
    return state.report;
  }

  return { init, show, profile, saveExpedition, settleExpedition, hasMineLedger: () => state.mineLedger };
})();
