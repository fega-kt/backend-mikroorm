import { z } from "zod";

export const createCommentValidation = z.object({
  task: z.string().trim().min(1, "Task is required"),
  content: z.string().trim().min(1, "Content is required").max(5000),
  parentComment: z.string().trim().optional(),
});

export const updateCommentValidation = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const commentFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  parentComment: z.string().trim().nullable().optional(),
});
