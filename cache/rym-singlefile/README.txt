把 RYM 专辑发行页用 SingleFile 保存为 .html，放在本目录。

然后双击项目根目录的 import-rym-singlefile.cmd，脚本会批量解析并更新：
  web\public\data\albums.json

导入器复用相邻 D:\Projects\RYMCrawler 中经过测试的页面解析器。
也可在终端运行：
  import-rym-singlefile.cmd
  import-rym-singlefile.cmd --dry-run
  import-rym-singlefile.cmd --user-rating 8

同一 RYM ID 会更新原记录，并保留已有 userRating 和 visual 字段。
登录状态保存的页面会自动读取个人评分（RYM 5 分制自动转换为网页的 10 分制）；
--user-rating 可显式覆盖页面中的个人评分。
HTML 可能包含登录账户信息，本目录下的网页文件默认不会提交到 Git。
