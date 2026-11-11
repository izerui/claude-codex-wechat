# vendor/swarm.js

来源：https://github.com/DhvanilPatel/swarm-cursors （`swarm-rebuild/swarm.js`，commit 3d49e0ac96172eb6af7ae8229b2152121bed2092）

- swarm-cursors 作者：Dhvanil Patel
- 动效设计与大部分动画引擎改编自 Joel Califa 的 Swarm（https://github.com/califa/swarm-site）

上游项目未附开源许可证，本仓库已获作者许可使用。**本文件不适用 relay-server 的 MIT 许可证**，复用前请自行联系上述作者。

本地改动：`onComplete()` 末尾加了 `window.__swarmAutoLive` 钩子（标有 `claude-codex-wechat patch`），用于搭完后自动 Go live。
