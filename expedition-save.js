"use strict";

const expeditionSave = (() => {
  const inRange = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

  function capture(game) {
    const { id, mission, hero, x, y, facing, steps, potions, door, player, enemies, used, visited, seen, logs, battle } = game;
    return {
      id, mission: mission.id, hero: hero.id, loadout: hero.loadout,
      x, y, facing, steps, potions, door, life: player.life, energy: player.energy,
      enemies: enemies.map((enemy) => ({ life: enemy.life, armor: enemy.armor ?? null })),
      used: [...used], visited: [...visited], seen: [...seen], logs,
      battle: battle && { enemy: enemies.indexOf(battle.enemy), round: battle.round, interruptRound: battle.interruptRound ?? 0 },
    };
  }

  function restore(raw, mission, hero) {
    if (!raw || typeof raw.id !== "string" || raw.id.length < 1 || raw.id.length > 80) return null;
    const { layout, encounters, landmarks } = mission;
    const columns = layout[0].length;
    const { x, y, facing, steps, potions, life, energy, door } = raw;
    if (!inRange(x, 0, columns - 1) || !inRange(y, 0, layout.length - 1) || !inRange(facing, 0, 3) ||
        !inRange(steps, 0, Number.MAX_SAFE_INTEGER) || !inRange(potions, 0, 5) ||
        !inRange(life, 1, hero.hp) || !inRange(energy, 0, hero.focus) || typeof door !== "boolean") return null;
    if (!Array.isArray(raw.used)) return null;
    const used = new Set(landmarks.filter((item) => item.type !== "exit" && raw.used.includes(item.type)).map((item) => item.type));
    if (door && !(used.has("key") && used.has("riddle"))) return null;
    const tile = layout[y][x];
    if (tile === "#" || (tile === "D" && !door) || (tile === "~" && !used.has("drain"))) return null;
    if (!Array.isArray(raw.enemies) || raw.enemies.length !== encounters.length) return null;
    const enemies = encounters.map((enemy, index) => {
      const saved = raw.enemies[index];
      if (!inRange(saved?.life, 0, enemy.hp) ||
          (enemy.armor !== undefined && !inRange(saved.armor, 0, enemy.armor))) return null;
      const actor = { ...enemy, life: saved.life };
      if (enemy.armor !== undefined) actor.armor = saved.armor;
      return actor;
    });
    if (enemies.includes(null) || enemies.some((enemy) => enemy.life && enemy.x === x && enemy.y === y)) return null;

    let battle = null;
    if (raw.battle !== null) {
      const { enemy: index, round, interruptRound } = raw.battle ?? {};
      if (!inRange(index, 0, enemies.length - 1) || !inRange(round, 1, Number.MAX_SAFE_INTEGER) ||
          !inRange(interruptRound, 0, round)) return null;
      const enemy = enemies[index];
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][facing];
      if (!enemy.life || enemy.x !== x + dx || enemy.y !== y + dy) return null;
      battle = { enemy, round, interruptRound, interruptPenalty: hero.interruptPenalty ?? 0 };
    }

    const cells = columns * layout.length;
    const gridSet = (value) => new Set(Array.isArray(value) ? value.filter((cell) => inRange(cell, 0, cells - 1)) : []);
    const logs = Array.isArray(raw.logs) ? raw.logs.slice(0, 35)
      .filter((entry) => typeof entry?.copy === "string")
      .map(({ copy, emphasis }) => ({ copy: copy.slice(0, 180), emphasis: Boolean(emphasis) })) : [];
    return {
      id: raw.id, mission, hero, x, y, facing, steps, potions, door,
      player: { life, energy }, enemies, used, visited: gridSet(raw.visited), seen: gridSet(raw.seen), logs, battle,
      sword: used.has("secret"), ended: false,
    };
  }

  return { capture, restore };
})();
