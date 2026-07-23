import { Module } from "@nestjs/common";
import { FoodsController } from "./foods.controller";

@Module({
  controllers: [FoodsController],
})
export class FoodsModule {}
