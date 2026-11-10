"use strict";

const camp = (() => {
  const heroes = {
    guard: { name: "赫岚", role: "盾卫", hp: 40, focus: 3, attack: 7, skill: "盾击", power: 10, heavyBlock: 60, price: 0 },
    scout: { name: "苔鸦", role: "斥候", hp: 36, focus: 3, attack: 8, skill: "穿刺", power: 13, interruptPenalty: 0, price: 30 },
    mage: { name: "墨灯", role: "咒师", hp: 34, focus: 4, attack: 6, skill: "余火", power: 15, armorBreak: 2, price: 40 },
  };
  const gear = {
    blade: { name: "淬火短刃", slot: "weapon", icon: 0, stat: "attack", bonus: 2, price: 35 },
    coat: { name: "锁环软甲", slot: "armor", icon: 1, stat: "hp", bonus: 8, price: 45 },
    charm: { name: "灰晶护符", slot: "trinket", icon: 2, stat: "focus", bonus: 1, price: 25 },
    shieldClasp: { name: "磐铁盾扣", slot: "technique", icon: 3, hero: "guard", stat: "heavyBlock", bonus: 20, effect: "盾击抵挡重击时额外减免 20 个百分点", price: 40 },
    snare: { name: "绊索扣", slot: "technique", icon: 4, hero: "scout", stat: "interruptPenalty", bonus: 3, effect: "成功打断后，敌人改用的反击再减少 3 伤害", price: 35 },
    ember: { name: "裂纹炭晶", slot: "technique", icon: 5, hero: "mage", stat: "armorBreak", bonus: 1, effect: "余火额外削掉 1 点护甲", price: 35 },
  };
  const statNames = { attack: "攻击", hp: "生命", focus: "专注", heavyBlock: "盾击重击减免", interruptPenalty: "打断后减伤", armorBreak: "余火破甲" };
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

  function readLoadout(raw, heroId) {
    const loadout = {};
    for (const slot of Object.keys(slotNames)) {
      const id = raw?.[slot];
      if (typeof id !== "string" || !Object.hasOwn(gear, id)) continue;
      const item = gear[id];
      if (item.slot === slot && (!item.hero || item.hero === heroId)) loadout[slot] = id;
    }
    return loadout;
  }

  function load() {
    const initial = { version: 3, gold: 100, selected: "guard", roster: { guard: {} }, mission: "vault", cleared: [], expedition: null, report: null };
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
    if (![1, 2, 3].includes(saved?.version) || !Number.isSafeInteger(saved.gold) || saved.gold < 0) return initial;
    initial.gold = saved.gold;
    for (const id of Object.keys(heroes)) {
      const items = saved.roster?.[id];
      if (!items || typeof items !== "object") continue;
      initial.roster[id] = readLoadout(items, id);
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
    if (saved.version === 3) {
      const active = saved.expedition;
      if (typeof active?.mission === "string" && Object.hasOwn(missions, active.mission) &&
          typeof active.hero === "string" && Object.hasOwn(initial.roster, active.hero) &&
          isUnlocked(missions[active.mission], initial.cleared)) {
        const restored = restoreExpedition(active);
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
    const hero = { ...heroes[id], id, loadout: { ...loadout } };
    hero.equipment = Object.values(loadout).map((itemId) => gear[itemId]);
    for (const item of hero.equipment) hero[item.stat] += item.bonus;
    return hero;
  }

  function restoreExpedition(active) {
    return expeditionSave.restore(active, missions[active.mission], profile(active.hero, readLoadout(active.loadout, active.hero)));
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
      found: Array.isArray(raw.found) ? ["key", "cache", "secret", "drain"].filter((item) => raw.found.includes(item)) : [],
      unlocked: typeof raw.unlocked === "string" && Object.hasOwn(missions, raw.unlocked) ? raw.unlocked : null,
      pending: raw.pending === true,
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
    get("prepare-equipment").textContent = `装备：${names.join(" / ")}`;
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
    const rows = Object.entries(gear).filter(([, item]) => !item.hero || item.hero === heroId).map(([id, item]) => {
      const art = document.createElement("span");
      art.className = "camp-stock-icon";
      art.style.setProperty("--gear-icon", `${item.icon * 20}%`);
      art.setAttribute("aria-hidden", "true");
      const button = document.createElement("button");
      button.textContent = target[item.slot] ? "已装备" : state.gold < item.price ? `缺 ${item.price - state.gold} 金` : `购买 · ${item.price} 金`;
      button.disabled = Boolean(target[item.slot]) || state.gold < item.price;
      button.setAttribute("aria-label", target[item.slot] ? `已装备${item.name}` : `购买${item.name}，${item.price} 金币`);
      button.addEventListener("click", () => {
        if (target[item.slot] || state.gold < item.price) return;
        state.gold -= item.price;
        target[item.slot] = id;
        save();
        playCue("equip");
        renderProfile();
        renderFacility();
        get("shop-hero").focus({ preventScroll: true });
        announce(`${heroes[heroId].name}已装备${item.name}。`);
      });
      const slot = slotNames[item.slot];
      const before = hero[item.stat];
      const unit = item.stat === "heavyBlock" ? "%" : "";
      const values = target[item.slot] ? `${before}${unit}（当前）` : `${before}${unit} → ${before + item.bonus}${unit}`;
      const description = item.effect ? `${slot} · ${item.effect}` : slot;
      return stockRow(art, item.name, description, button, `${statNames[item.stat]} ${values}`);
    });
    get("camp-stock").replaceChildren(...rows);
  }

  function renderFacility() {
    const inShop = screen === "shop";
    get("camp-gold").textContent = state.gold;
    get("camp-facility").dataset.place = screen;
    get("facility-kicker").textContent = inShop ? "Ⅱ / THE FORGE" : "Ⅰ / THE TAVERN";
    get("facility-title").textContent = inShop ? "余火铁匠铺" : "断杯酒馆";
    const shopIntro = state.expedition ? "先选装备的归属。暂停中的远征会沿用出发时的装备。" : "先选英雄，再比较购买前后的属性。买下后立即装备。";
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
      status.textContent = input.disabled ? "通关墓窟后解锁" : state.cleared.includes(mission.id) ? "已通关" : "可出征";
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
      secret: "暗格：守火人之刃（本次远征）",
      drain: "排水闸轮：抽干了矿井积水",
    };
    const items = report.found.length ? report.found.map((item) => discoveries[item]) : ["此次远征没有额外发现。"];
    get("report-loot").replaceChildren(...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }));
    get("report-unlock").hidden = !report.unlocked;
    get("report-unlock").textContent = report.unlocked ? `新委托已开放 · ${missions[report.unlocked].title}` : "";
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
    if (outcome === "won") {
      const firstClear = !state.cleared.includes(mission.id);
      reward = firstClear ? mission.firstReward : mission.repeatReward;
      if (firstClear) {
        state.cleared.push(mission.id);
        unlocked = Object.values(missions).find((next) => next.requires === mission.id)?.id ?? null;
        if (unlocked) state.mission = unlocked;
      }
      state.gold = Math.min(state.gold + reward, Number.MAX_SAFE_INTEGER);
    }
    state.expedition = null;
    state.report = readReport({
      mission: mission.id, hero: snapshot.hero, outcome, reward, unlocked, pending: true,
      explored: snapshot.visited.length, kills: snapshot.enemies.filter((enemy) => !enemy.life).length, found: snapshot.used,
    });
    save();
    return state.report;
  }

  return { init, show, profile, saveExpedition, settleExpedition };
})();
