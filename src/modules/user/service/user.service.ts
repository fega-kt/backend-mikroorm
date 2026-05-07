import { ENV } from "@config/env.config";
import { EntityManager, EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

import { BaseService } from "@common/base/base.service";
import { STORAGE_PATH } from "@common/constants/storage.constant";
import { SYSTEM_DEPARTMENT_ID } from "@common/constants/system.constant";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { UploadService } from "@modules/upload/service/upload.service";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { UserEntity } from "../entity/user.entity";
import { createUserValidation, updateUserValidation } from "../validation/user.validation";

@Injectable({ scope: Scope.REQUEST })
export class UserService extends BaseService<UserEntity> {
  private readonly supabaseAdmin: SupabaseClient;

  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    private readonly em: EntityManager,
    private readonly uploadService: UploadService,
  ) {
    super(userRepo, request);
    this.supabaseAdmin = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async create(data: z.infer<typeof createUserValidation>): Promise<void> {
    const result = createUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const { loginName, fullName, workEmail, password, department, isActive } = data;
    const exist = await this.userRepo.findOne({
      loginName,
    });

    if (exist) {
      throw new ConflictException("Email already exists in local database");
    }

    // 2️⃣ Check in Supabase (Fallback to listUsers if auth schema is restricted)
    const { data: supabaseResponse, error: supabaseError } = await this.supabaseAdmin.auth.admin.listUsers();

    if (supabaseError || !supabaseResponse) {
      throw new BadRequestException("Failed to check Supabase user: " + supabaseError?.message);
    }

    const supabaseUser = supabaseResponse.users.find((u: User) => u.email === loginName);

    let authUser = supabaseUser;

    if (!authUser) {
      const { data: createdAuthUser, error: createSupabaseError } = await this.supabaseAdmin.auth.admin.createUser({
        email: loginName,
        password: password,
        email_confirm: true,
        user_metadata: { fullName },
      });

      if (createSupabaseError) {
        throw new BadRequestException("Failed to create user in Supabase Auth: " + createSupabaseError.message);
      }

      authUser = createdAuthUser.user;
    }

    const defaulValueBase = this.getDefaultValuesForCreate();
    return this.em.transactional(async (em) => {
      // 1️⃣ create user
      const user = this.userRepo.create({
        fullName,
        loginName,
        workEmail,
        isActive: isActive !== undefined ? isActive : true,
        department: department ? new ObjectId(department) : new ObjectId(SYSTEM_DEPARTMENT_ID),
        ...defaulValueBase,
      });

      em.persist(user);

      // 2️⃣ create principal
      const principal = em.create(PrincipalEntity, {
        name: fullName,
        type: PrincipalType.User,
        user,
        ...defaulValueBase,
      });

      em.persist(principal);

      await em.flush();
    });
  }

  async findAllUser(page = 1, limit = 10) {
    const { data, total } = await this.paginate(
      { deleted: { $ne: true } },
      {
        limit,
        page,
        fields: ["id", "fullName", "workEmail", "createdAt", "isActive", "loginName", "avatar"],
      },
    );

    return { data, total };
  }

  async getDetail(id: string): Promise<UserEntity> {
    const user = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "fullName", "loginName", "workEmail", "avatar", "isActive", "department", "groups", "department.name"],
        populate: ["department", "groups"],
      },
    );

    if (!user) {
      throw new NotFoundException("User not found or deleted");
    }

    return user;
  }

  async update(id: string, data: z.infer<typeof updateUserValidation>) {
    const result = updateUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    return await this.updateOne(id, data);
  }

  async remove(id: string) {
    return await super.remove(id);
  }

  async uploadAvatar(id: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.upload(file, `${STORAGE_PATH.USER_AVATAR}/${id}`);
    await this.updateOne(id, { avatar: url });
    return url;
  }
}
