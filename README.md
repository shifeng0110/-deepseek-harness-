# -deepseek-harness-
自用小插件库，时不时分享点有趣小玩意。
各插件都有md，把东西丢给ds就能自己部署进去了。

## dsh-livewall 动态壁纸插件

DeepSeek Harness Web GUI 的动态壁纸插件:程序生成动效(星尘粒子 / 极光渐变 / 柔光斑)、本地或网络视频 / 图片壁纸、面板半透明可调、可选声音。装配进 web profile 的 `cordis.patch.yml` 一行即可使用。

- 源码:`livewall/`(host 半 `lib/index.js` + 浏览器半 `lib/client.js` + `package.json`)
- 使用 / 安装 / 同步 / 回滚:见 `livewall/使用说明.md`

## dsh-whale 鲸鱼娘悬浮插件

DeepSeek Harness GUI 的悬浮桌宠:点击可切换 发呆/余额/台词 模式、可拖动;本地代理(whale/proxy.js,端口 8790)负责转发余额查询。

- 源码:`whale/`(widget.js 为核心,proxy.js 本地代理)
- 使用说明:`whale/使用说明.md`
- 隐私说明:真实 API Key 存于本地 `whale/config.json`(**不会提交**,已 gitignore),仓库只提供 `config.example.json`;`patch-gui.js` 的 dist 路径由环境变量推导,不含本机绝对路径。