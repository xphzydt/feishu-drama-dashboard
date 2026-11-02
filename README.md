# AI短剧制作统计组件

每个个人表格视图对应一圈。新增视图后增加一圈，改名后同步名称，删除视图后移除对应圈。“查看剧集”按视图自身的编号跳转，改名不影响跳转。

## 建立个人视图

在“02 剧集制作”中创建表格视图，设置筛选“制作人＝该成员”。视图名称可自由修改，组件显示完整的视图名称。没有该视图时，不会仅因增加制作人选项或统计行而增加圈。未分配剧集的新成员视图会显示零集。

组件每10秒在可见时重新读取视图和数据；剧集、积分记录变化也触发刷新。内部以“(dashboard_view)”结尾的仪表盘视图不计入同心环。删除视图不会删除原表剧集。

## 数据来源

使用飞书官方 SDK，只读取当前多维表格，不保存实际项目数据、表格地址、密钥或令牌。

- “02 剧集制作”：制作人、所属项目、集号、完成集数、成片总秒数。
- “04 积分流水”：制作人、消耗积分。

每圈的集数和时长来自对应视图的剧集；积分来自该制作人的全部积分流水。中央团队集数与总时长卡片按剧集总表统计，不会因重复视图重复计算。无需在“05 人员进度”另建行才能出现新圈。

## 使用地址

- 仪表盘同心环：https://xphzydt.github.io/feishu-drama-dashboard/?surface=dashboard&widget=rings
- 仪表盘总时长：https://xphzydt.github.io/feishu-drama-dashboard/?surface=dashboard&widget=duration
- 侧边栏同心环：https://xphzydt.github.io/feishu-drama-dashboard/?surface=sidebar&widget=rings

必须从飞书相应插件入口打开。查看者需要能够读取剧集源表与积分流水。其他账号、匿名仪表盘分享和移动端尚未核验。

## SDK

使用飞书官方仪表盘示例的 @lark-base-open/js-sdk 0.4.1-beta.5，许可见 SDK-LICENSE.txt。
