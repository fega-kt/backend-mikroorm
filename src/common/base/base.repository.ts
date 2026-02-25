import { EntityRepository } from "@mikro-orm/mongodb";

export class BaseRepository<T extends object> extends EntityRepository<T> {
  async paginate(filter = {}, page = 1, limit = 10) {
    const [data, total] = await this.findAndCount(filter, {
      limit,
      offset: (page - 1) * limit,
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }
}
