import { Module } from "@nestjs/common";
import { FoodsModule } from "./foods/foods.module";

@Module({
  imports: [FoodsModule],
})
export class AppModule {}
