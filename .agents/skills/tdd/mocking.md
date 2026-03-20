# 何时 mock（When to Mock）

只在 **系统边界（system boundaries）** 处进行 mock：

- 外部 API（支付、邮件等）
- 数据库（有时——更偏好使用测试数据库）
- 时间 / 随机性
- 文件系统（有时）

不要 mock：

- 你自己的类 / 模块
- 内部协作者
- 任何你能够控制的东西

## 为可 mock 性设计（Designing for Mockability）

在系统边界处，设计更容易 mock 的接口：

**1. 使用依赖注入（Use dependency injection）**

不要在内部创建依赖，而是把外部依赖作为参数传入：

```typescript
// Easy to mock（易于 mock）
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock（难以 mock）
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. 优先使用 SDK 风格的接口，而不是通用 fetcher**

为每个外部操作分别创建“具体函数”，而不是把所有外部操作都塞进一个带条件分支的通用函数：

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK 方式意味着：

- 每个 mock 返回一种确定的结构形状
- 测试设置里不需要条件逻辑
- 更容易看出某个测试到底覆盖了哪些端点（endpoints）
- 每个端点都有更好的类型安全（type safety）

