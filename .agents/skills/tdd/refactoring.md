# 重构候选（Refactor Candidates）

在每个 TDD 循环之后，你可以寻找：

- **重复（Duplication）** → 抽取函数/类
- **长方法（Long methods）** → 拆分成私有 helper（保持测试聚焦在公共接口）
- **浅模块（Shallow modules）** → 合并或加深（deep）
- **特征羡慕（Feature envy）** → 把逻辑移动到数据所在的位置
- **基本类型过剩（Primitive obsession）** → 引入值对象（value objects）
- 新代码暴露出的、对现有代码存在问题的部分（existing code）

