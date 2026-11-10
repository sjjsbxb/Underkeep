# 余烬地窟 · Ashen Vault

[![Play Online](https://img.shields.io/badge/%E2%96%B6%20Play%20Online-GitHub%20Pages-d9a441?style=flat-square)](https://sjjsbxb.github.io/Underkeep/)
[![License: MIT](https://img.shields.io/badge/License-MIT-4c8bf5?style=flat-square)](LICENSE)

一款纯前端、零依赖的第一人称地牢探索原型：在灰烬笼罩的墓窟中探索、标记、遭遇并与守卫者战斗。全部由原生 HTML / CSS / JavaScript 与 Canvas 2D 实现，无需构建步骤。

> A zero-dependency, first-person dungeon-crawler prototype written in vanilla HTML/CSS/JS with a hand-rolled Canvas 2D renderer.

![余烬地窟游戏截图](docs/screenshot.png)

## 试玩 / Play

- 在线试玩：https://sjjsbxb.github.io/Underkeep/
- 或直接双击 `index.html`（纯静态，无服务端依赖）

## 操作 / Controls

从灰鸦镇出发。点地图上的酒馆招募佣兵，点铁匠铺为指定英雄比较并购买装备。在右侧名册选择一名英雄，再从底栏进入出征整备，选择任务后独自下地牢。首次通关守火人的墓窟获得 60 金币，并解锁淹没的矿井。矿井首次通关获得 90 金币，两关重访报酬分别为 30 和 45 金币。

地牢每次行动后会自动保存。刷新后在营地选择「继续远征」，或者通过地牢内的「操作」菜单保存并返镇。完成、失败或放弃远征后会显示结算，可在小镇通过「上次远征」重看。

| 操作 | 按键 |
| --- | --- |
| 前进 / 后退 | `W` / `S` 或 `↑` / `↓` |
| 左转 / 右转 | `Q` / `E` 或 `←` / `→` |
| 互动（搜索、开启、对话） | `F` |
| 战斗：攻击 / 战技 / 防御 / 药剂 | `1` / `2` / `3` / `4` |
| 帮助 / 音效开关 | 「操作」/「音效」按钮 |

触屏界面有独立的前进、后退、横移、转向和互动按钮。初次进地牢及第一场战斗时会出现上手提示。点「音效」可开启招募、购装、机关、药剂、蓄力和打断等动作提示音。

## 特性 / Features

- **第一人称伪 3D 渲染**：基于像素列投射的自制渲染器（`dungeon.js`），逐列计算墙体深度、纹理采样与距离衰减光照，无 WebGL、无第三方库。
- **网格地牢**：两张手工地图，墓窟的钥匙与石台机关，以及矿井的积水、轨道和排水闸轮。
- **探索与解谜**：地标互动（宝箱、祭坛、封印门、传送门），未探索区域在探路图上保持迷雾。
- **营地**：招募斥候和咒师，分别为英雄购置武器、护甲、饰品和专属战技配件。
- **单人回合制战斗**：每次派一名英雄出征。预告显示敌人将如何行动，控制栏显示预计输出。盾卫的盾击能挡重击，斥候的穿刺能打断蓄力或重击，咒师的余火无视护甲并削弱它。防御回复专注，药剂恢复生命。
- **氛围表现**：小镇、设施室内和装备图标使用像素画，地牢有火把闪烁、纹理和动作提示音（WebAudio）。
- **无依赖 / 无构建**：双击入口即可运行。

## 文件结构 / Layout

```
.
├── index.html   # 页面骨架、HUD 与按钮
├── style.css    # 界面主题与响应式布局
├── camp.css     # 营地界面
├── camp-town-pixel.png # 灰鸦镇像素地图
├── camp-tavern-pixel.png # 断杯酒馆室内
├── camp-forge-pixel.png  # 余火铁匠铺室内
├── gear-pixel.svg # 六种装备的像素图标
├── camp.svg     # 灰鸦镇构图草稿
├── camp-interiors.svg # 酒馆与铁匠铺构图草稿
├── camp.js      # 招募、装备、英雄属性与营地存档
├── missions.js  # 两座地牢的地图、地标、敌人与任务报酬
├── expedition-save.js # 远征快照与恢复校验
├── dungeon.js   # 游戏循环、渲染器、战斗与交互逻辑
├── docs/
│   └── screenshot.png
└── README.md
```

## 本地开发 / Development

无需安装任何依赖：

```bash
# 任选其一
python -m http.server 8000
npx serve .
```

然后打开 `http://localhost:8000`。

修改 `dungeon.js` 后刷新页面即可生效。

## 开发计划 / Roadmap

- [x] 两座可选的手工地牢，首次通关墓窟解锁矿井
- [ ] 随机地牢生成（房间 + 走廊）与种子复现
- [x] 区分三名英雄的战技，加入首领预告、护甲和专属配件
- [x] 地牢内续玩、装备属性预览与远征结算
- [x] 像素美术统一、新手提示、触屏操作和关键动作音效
- [ ] 配乐扩展

## 许可 / License

[MIT](LICENSE)
