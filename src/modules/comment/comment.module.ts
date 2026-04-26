import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ProjectModule } from "@modules/project/project.module";
import { TaskEntity } from "@modules/task/entity/task.entity";
import { Module } from "@nestjs/common";
import { CommentController } from "./controller/comment.controller";
import { CommentEntity } from "./entity/comment.entity";
import { CommentService } from "./service/comment.service";

@Module({
  imports: [MikroOrmModule.forFeature([CommentEntity, TaskEntity]), ProjectModule],
  providers: [CommentService],
  controllers: [CommentController],
  exports: [CommentService],
})
export class CommentModule {}
