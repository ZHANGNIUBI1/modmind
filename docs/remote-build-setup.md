# 远程构建使用说明

## 先说结论

远程构建需要第三方平台账号。ModMind 不保存平台密码，也不会要求用户把密码填进应用；授权时会打开浏览器完成登录。

没有第三方账号时，可以继续使用本地构建，不影响项目创建、编辑和导出 JAR。

## 小白用户推荐路径

1. 注册一个 Gitee 账号。
2. 在 Gitee 创建一个私有仓库。
3. 在 Gitee 个人设置中创建 Personal Access Token，授予目标仓库读写权限，并保存好 Token。
4. 在 ModMind 设置中填写仓库地址、构建分支和 Token，点击“校验连接”。
5. 在 Gitee Go 中启用 Java/Gradle 流水线。
6. 回到 ModMind，点击“推送并开始远程构建”。

ModMind 会自动生成 `.gitee-ci.yml` 并推送项目。首次构建后，可以在 Gitee 流水线页面查看日志和下载 `build/libs/*.jar` 制品。

## 五种 Provider 的账号要求

| Provider | 需要注册 | 还需要什么 |
| --- | --- | --- |
| Gitee Go | Gitee 账号 | 私有仓库和 Gitee Go 流水线 |
| CODING DevOps | 腾讯云账号、CODING 账号/团队 | 部分能力可能要求企业空间或实名认证 |
| 华为云 CodeArts | 华为云账号 | CodeArts 项目和构建服务，部分区域需要实名认证 |
| GitHub Actions + 国内 Runner | GitHub 账号 | 一台长期在线的国内电脑、NAS 或服务器 |
| Gitee Webhook + Jenkins | Gitee 账号 | 一台已部署 Jenkins 的电脑、NAS 或服务器 |

云平台的免费额度、构建分钟数和制品保留时间会随账号类型及平台政策变化。自托管 Runner/Jenkins 不收平台构建费，但需要用户已有设备并自行维护。

## 自动择优规则

自动模式会依次检查凭据、服务健康、免费额度、构建环境兼容性、排队时间和历史成功率，然后选择当前可用的平台。

构建尚未启动就失败时，可以自动切换备用 Provider。若任务已经启动但状态未知，ModMind 会先查询原任务，避免重复构建和重复消耗额度。

当所有远程 Provider 都不可用时，ModMind 会提示切换到本地构建。

## 权限与安全

- 只授予构建所需的仓库权限。
- 不要把平台 Token 写进项目文件或 `gradle.properties`。
- 私有仓库的源码和构建日志会按对应平台的隐私策略处理。
- 使用自托管 Runner/Jenkins 时，应为每个仓库单独创建 Runner，避免执行不受信任的脚本。

## 当前版本边界

1.2.0 已接入 Gitee 连接器：校验仓库、加密保存 Token、生成 Gitee Go 配置并安全推送代码。Gitee Go 的构建状态和制品下载仍由 Gitee 流水线页面提供，因为 Gitee 没有稳定公开的通用流水线状态 API。其他 Provider 暂未接入，不会在自动模式中被假装成可用平台。
