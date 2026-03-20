# 面向可测试性的接口设计（Interface Design for Testability）

好的接口会让测试变得更自然：

1. **接收依赖，不要自己创建（Accept dependencies, don't create them）**

   ```typescript
   // Testable（可测试）
   function processOrder(order, paymentGateway) {}

   // Hard to test（难以测试）
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **返回结果，不要产生副作用（Return results, don't produce side effects）**

   ```typescript
   // Testable（可测试）
   function calculateDiscount(cart): Discount {}

   // Hard to test（难以测试）
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **小的暴露面（Small surface area）**

   - 方法更少 = 需要更少的测试
   - 参数更少 = 更简单的测试准备

