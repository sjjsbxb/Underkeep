# 余烬地窟 · Ashen Vault

一款纯前端、零依赖的第一人称地牢探索原型：在灰烬笼罩的墓窟中探索、标记、遭遇并与守卫者战斗。全部由原生 HTML / CSS / JavaScript 与 Canvas 2D 实现，无需构建步骤。

> A zero-dependency, first-person dungeon-crawler prototype written in vanilla HTML/CSS/JS with a hand-rolled Canvas 2D renderer.

## 试玩 / Play

- 在线试玩：https://sjjsbxb.github.io/Underkeep/
- 或直接双击 `index.html`（纯静态，无服务端依赖）

## 操作 / Controls

| 操作 | 按键 |
| --- | --- |
| 前进 / 后退 | `W` / `S` 或 `↑` / `↓` |
| 左转 / 右转 | `Q` / `E` 或 `←` / `→` |
| 互动（搜索、开启、对话） | `F` |
| 战斗：攻击 / 战技 / 防御 / 药剂 | `1` / `2` / `3` / `4` |
| 帮助 / 音效开关 | 「操作」/「音效」按钮 |

移动端可直接使用屏幕上的方向与互动按钮。

## 特性 / Features

- **第一人称伪 3D 渲染**：基于像素列投射的自制渲染器（`dungeon.js`），逐列计算墙体深度、纹理采样与距离衰减光照，无 WebGL、无第三方库。
- **网格地牢**：固定布局的墓窟地图，带朝向、转角平滑插值、火把与地标。
- **探索与解谜**：地标互动（宝箱、祭坛、封印门、传送门），未探索区域在探路图上保持迷雾。
- **回合制战斗**：小队成员各自的生命与战技，敌人血条、防御减伤与药剂消耗。
- **氛围表现**：火焰闪烁光照、像素级噪声纹理、暗角、程序化音效（WebAudio）。
- **无依赖 / 无构建**：三个文件即可运行，方便移植与二次开发。

## 文件结构 / Layout

```
.
├── index.html   # 页面骨架、HUD 与按钮
├── style.css    # 界面主题与响应式布局
├── dungeon.js   # 地图数据、游戏循环、渲染器、战斗与交互逻辑
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

- [ ] 多楼层与楼梯，层间难度递进
- [ ] 随机地牢生成（房间 + 走廊）与种子复现
- [ ] 更多敌人类型、技能与状态效果
- [ ] 存档 / 读档（localStorage）
- [ ] 移动端触控优化与横屏提示
- [ ] 音效与配乐扩展

## 许可 / License

[MIT](LICENSE)
