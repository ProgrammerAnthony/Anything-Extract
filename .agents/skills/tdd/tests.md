# 好测试与坏测试（Good and Bad Tests）

## 好测试（Good Tests）

**集成式（Integration-style）**：通过真实接口测试，而不是对内部部分进行 mock。

```typescript
// GOOD: 测试可观察行为
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征：

- 测试的是用户/调用者关心的行为
- 只使用公共 API
- 能在内部重构后继续存活
- 描述的是“是什么（WHAT）”，而不是“怎么做（HOW）”
- 每个测试只做一个逻辑断言（one logical assertion per test）

## 坏测试（Bad Tests）

**实现细节测试（Implementation-detail tests）**：耦合到内部结构。

```typescript
// BAD: 测试实现细节
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

危险信号（Red flags）：

- mock 内部协作者
- 测试私有方法
- 断言调用次数/调用顺序
- 在重构但行为没变时，测试仍会失败
- 测试名描述的是“怎么做”，而不是“做什么”
- 通过外部手段验证，而不是通过接口验证

```typescript
// BAD: 绕过接口来验证
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: 通过接口验证
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

